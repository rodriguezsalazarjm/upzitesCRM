import { ChannelAccountStatus } from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { decryptSecret, encryptSecret } from '../crypto';

export class InstagramTokenError extends Error {}

/**
 * Ciclo de vida oficial de un token de Instagram Login: NO hay refresh_token.
 * Un token de larga duracion (~60 dias) se "refresca" (extiende) llamando a
 * este mismo endpoint con el token vigente todavia no vencido — si ya vencio,
 * no hay forma de recuperarlo y hace falta re-autorizar (REAUTH_REQUIRED).
 * Documentado por Meta como `GET /refresh_access_token?grant_type=ig_refresh_token`.
 */
const REFRESH_WINDOW_MS = 24 * 60 * 60_000; // Reintentar 24h antes de vencer, con margen para reintentos.

export async function refreshInstagramLongLivedToken(input: {
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const doFetch = input.fetchImpl ?? fetch;
  const params = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: input.accessToken });
  let response: Response;
  try {
    response = await doFetch(`https://graph.instagram.com/refresh_access_token?${params.toString()}`);
  } catch (error) {
    throw new InstagramTokenError(error instanceof Error ? error.message : 'error de red');
  }
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_message?: string;
  };
  if (!response.ok || !payload.access_token || !payload.expires_in) {
    throw new InstagramTokenError(payload.error_message ?? `HTTP ${response.status}`);
  }
  return { accessToken: payload.access_token, expiresInSeconds: payload.expires_in };
}

/**
 * Devuelve un access token utilizable para la cuenta, extendiendolo primero
 * si esta por vencer. Si ya vencio o Instagram lo rechaza (revocado, permisos
 * retirados), marca la cuenta REAUTH_REQUIRED en vez de fallar en silencio —
 * ninguna automatizacion debe seguir intentando enviar con un token muerto.
 */
export async function getValidInstagramAccessToken(
  channelAccountId: string,
  fetchImpl?: typeof fetch,
): Promise<{ ok: true; accessToken: string } | { ok: false; reason: string }> {
  const account = await prisma.channelAccount.findUnique({
    where: { id: channelAccountId },
    select: { id: true, channel: true, accessTokenEncrypted: true, accessTokenExpiresAt: true, status: true },
  });
  if (!account || account.channel !== 'INSTAGRAM') return { ok: false, reason: 'cuenta de Instagram no encontrada' };
  if (!account.accessTokenEncrypted) return { ok: false, reason: 'sin token guardado' };

  const currentToken = decryptSecret(account.accessTokenEncrypted);
  const needsRefresh =
    !account.accessTokenExpiresAt || account.accessTokenExpiresAt.getTime() - Date.now() < REFRESH_WINDOW_MS;

  if (!needsRefresh) return { ok: true, accessToken: currentToken };

  try {
    const refreshed = await refreshInstagramLongLivedToken({ accessToken: currentToken, fetchImpl });
    await prisma.channelAccount.update({
      where: { id: account.id },
      data: {
        accessTokenEncrypted: encryptSecret(refreshed.accessToken),
        accessTokenExpiresAt: new Date(Date.now() + refreshed.expiresInSeconds * 1000),
        lastVerifiedAt: new Date(),
        lastErrorCode: null,
        lastError: null,
      },
    });
    return { ok: true, accessToken: refreshed.accessToken };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error desconocido';
    await prisma.channelAccount.update({
      where: { id: account.id },
      data: { status: ChannelAccountStatus.REAUTH_REQUIRED, lastErrorCode: 'TOKEN_REFRESH_FAILED', lastError: message },
    });
    return { ok: false, reason: message };
  }
}
