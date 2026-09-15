import { decryptSecret, encryptSecret } from '../crypto';
import { prisma } from '../prisma';
import {
  getPlatformOAuthConfig,
  refreshMercadoPagoOAuthToken,
  MercadoPagoCredentialError,
} from '../mercado-pago';
import {
  MercadoPagoConnectionMethod,
  MercadoPagoConnectionStatus,
  type Prisma,
} from '../../../generated/prisma/client';

export type WorkspaceMercadoPagoConnection = {
  workspaceId: string;
  mode: 'TEST' | 'PRODUCTION';
  connectionMethod: MercadoPagoConnectionMethod;
  accessToken: string;
  mercadoPagoUserId: string | null;
};

/**
 * Bloquea la fila para que dos refresh concurrentes del mismo workspace no se
 * pisen (el refresh token de OAuth suele rotar en cada uso: si dos procesos
 * lo canjean a la vez, el segundo puede fallar o dejar guardado un token que
 * el otro proceso ya considera viejo). Mismo patron que lockConversation en
 * src/lib/whatsapp/outbound.ts.
 */
async function lockMercadoPagoConnection(tx: Prisma.TransactionClient, workspaceId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "mercado_pago_connections" WHERE "workspace_id" = ${workspaceId} FOR UPDATE
  `;
  return rows.length > 0;
}

/**
 * El secreto para validar la firma del webhook, SIN tocar el access token ni
 * intentar un refresh: se resuelve antes de decidir si el resto de la
 * notificacion merece confianza, y no debe costar una llamada a Mercado Pago
 * por cada intento (alguien mandando firmas invalidas no deberia poder
 * gastar el cupo de refresh de un vendedor real).
 *
 *  - OAUTH: el secreto es el DE LA APLICACION de Upzites Flow
 *    (MERCADO_PAGO_WEBHOOK_SECRET), el mismo que la suscripcion del CRM,
 *    porque Mercado Pago firma las notificaciones de marketplace con el
 *    secreto de la app integradora, no uno por vendedor.
 *  - MANUAL: el secreto guardado en esa fila (Fase A original).
 */
export async function getWorkspaceMercadoPagoWebhookSecret(
  workspaceId: string,
): Promise<{ webhookSecret: string } | null> {
  const connection = await prisma.mercadoPagoConnection.findUnique({
    where: { workspaceId },
    select: { connectionMethod: true, status: true, webhookSecretEncrypted: true },
  });
  if (!connection || connection.status === MercadoPagoConnectionStatus.DISCONNECTED) return null;

  if (connection.connectionMethod === MercadoPagoConnectionMethod.OAUTH) {
    const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    return secret ? { webhookSecret: secret } : null;
  }

  if (!connection.webhookSecretEncrypted) return null;
  return { webhookSecret: decryptSecret(connection.webhookSecretEncrypted) };
}

const EXPIRY_BUFFER_MS = 5 * 60_000;

/**
 * Devuelve un access token UTILIZABLE de la cuenta de Mercado Pago de un
 * workspace: descifra el guardado y, si es OAuth y esta vencido o por
 * vencer, lo renueva antes de devolverlo. Null si el workspace no conecto
 * nada, si esta en DISCONNECTED/NEEDS_ATTENTION, o si el refresh fallo
 * definitivamente (en ese caso la fila queda en REAUTH_REQUIRED).
 */
export async function getValidWorkspaceMercadoPagoToken(
  workspaceId: string,
): Promise<WorkspaceMercadoPagoConnection | null> {
  const connection = await prisma.mercadoPagoConnection.findUnique({ where: { workspaceId } });
  if (!connection) return null;
  if (
    connection.status !== MercadoPagoConnectionStatus.CONNECTED ||
    !connection.accessTokenEncrypted
  ) {
    return null;
  }

  if (connection.connectionMethod === MercadoPagoConnectionMethod.MANUAL) {
    return {
      workspaceId,
      mode: connection.mode,
      connectionMethod: connection.connectionMethod,
      accessToken: decryptSecret(connection.accessTokenEncrypted),
      mercadoPagoUserId: connection.mercadoPagoUserId,
    };
  }

  // OAUTH: si todavia falta para vencer (con margen), no hace falta tocar la red.
  const stillFresh =
    connection.accessTokenExpiresAt && connection.accessTokenExpiresAt.getTime() - EXPIRY_BUFFER_MS > Date.now();
  if (stillFresh) {
    return {
      workspaceId,
      mode: connection.mode,
      connectionMethod: connection.connectionMethod,
      accessToken: decryptSecret(connection.accessTokenEncrypted),
      mercadoPagoUserId: connection.mercadoPagoUserId,
    };
  }

  return refreshWorkspaceOAuthToken(workspaceId);
}

/**
 * Renueva el access token OAuth de un workspace bajo bloqueo de fila: si otro
 * proceso ya referesco mientras esperabamos el lock, se relee y se usa ESE
 * resultado en vez de refrescar dos veces con el mismo refresh token.
 */
async function refreshWorkspaceOAuthToken(
  workspaceId: string,
): Promise<WorkspaceMercadoPagoConnection | null> {
  const oauthConfig = getPlatformOAuthConfig();
  if (!oauthConfig) {
    console.error('mercado_pago_oauth_not_configured_for_refresh', { workspaceId });
    return null;
  }

  return prisma.$transaction(async (tx) => {
    if (!(await lockMercadoPagoConnection(tx, workspaceId))) return null;

    const connection = await tx.mercadoPagoConnection.findUnique({ where: { workspaceId } });
    if (
      !connection ||
      connection.status !== MercadoPagoConnectionStatus.CONNECTED ||
      connection.connectionMethod !== MercadoPagoConnectionMethod.OAUTH ||
      !connection.accessTokenEncrypted
    ) {
      return null;
    }

    // Alguien ya refresco mientras esperabamos el lock: usar ese resultado.
    const stillFresh =
      connection.accessTokenExpiresAt &&
      connection.accessTokenExpiresAt.getTime() - EXPIRY_BUFFER_MS > Date.now();
    if (stillFresh) {
      return {
        workspaceId,
        mode: connection.mode,
        connectionMethod: connection.connectionMethod,
        accessToken: decryptSecret(connection.accessTokenEncrypted),
        mercadoPagoUserId: connection.mercadoPagoUserId,
      };
    }

    if (!connection.refreshTokenEncrypted) {
      await markReauthRequired(tx, workspaceId, 'NO_REFRESH_TOKEN', 'No hay refresh token guardado.');
      return null;
    }

    let tokens;
    try {
      tokens = await refreshMercadoPagoOAuthToken({
        config: oauthConfig,
        refreshToken: decryptSecret(connection.refreshTokenEncrypted),
      });
    } catch (error) {
      const message =
        error instanceof MercadoPagoCredentialError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Fallo desconocido al renovar el token.';
      await markReauthRequired(tx, workspaceId, 'REFRESH_FAILED', message);
      return null;
    }

    const expiresAt = tokens.expiresInSeconds
      ? new Date(Date.now() + tokens.expiresInSeconds * 1000)
      : null;

    await tx.mercadoPagoConnection.update({
      where: { workspaceId },
      data: {
        accessTokenEncrypted: encryptSecret(tokens.accessToken),
        // Mercado Pago no siempre rota el refresh token en cada renovacion;
        // si no vino uno nuevo, se conserva el que ya funcionaba.
        refreshTokenEncrypted: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : undefined,
        accessTokenExpiresAt: expiresAt,
        mercadoPagoUserId: tokens.mercadoPagoUserId,
        mode: tokens.liveMode ? 'PRODUCTION' : 'TEST',
        lastRefreshAt: new Date(),
        lastErrorCode: null,
        lastError: null,
      },
    });

    return {
      workspaceId,
      mode: tokens.liveMode ? 'PRODUCTION' : 'TEST',
      connectionMethod: MercadoPagoConnectionMethod.OAUTH,
      accessToken: tokens.accessToken,
      mercadoPagoUserId: tokens.mercadoPagoUserId,
    };
  });
}

async function markReauthRequired(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  errorCode: string,
  errorMessage: string,
) {
  await tx.mercadoPagoConnection.update({
    where: { workspaceId },
    data: {
      status: MercadoPagoConnectionStatus.REAUTH_REQUIRED,
      lastErrorCode: errorCode,
      lastError: errorMessage,
    },
  });
}
