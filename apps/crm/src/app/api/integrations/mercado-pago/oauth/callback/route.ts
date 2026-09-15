import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  MercadoPagoConnectionMethod,
  MercadoPagoConnectionStatus,
} from '../../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { encryptSecret } from '@/lib/crypto';
import { recordAudit } from '@/lib/domain/audit';
import { prisma } from '@/lib/prisma';
import {
  MercadoPagoCredentialError,
  canManageMercadoPago,
  exchangeMercadoPagoOAuthCode,
  getPlatformOAuthConfig,
} from '@/lib/mercado-pago';
import { verifyMercadoPagoOAuthState } from '@/lib/commerce/mercado-pago-oauth-state';
import { MERCADO_PAGO_OAUTH_NONCE_COOKIE } from '../connect/route';

export const dynamic = 'force-dynamic';

function redirectUri() {
  const base = (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
  return `${base}/api/integrations/mercado-pago/oauth/callback`;
}

function integracionesUrl(query: string) {
  const base = (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
  return `${base}/integraciones?${query}`;
}

/**
 * Callback de OAuth. Orden de controles, de mas barato a mas caro: state
 * firmado, nonce de la cookie, permisos del usuario ACTUAL (puede haber
 * cambiado desde que empezo el flujo), y recien despues el intercambio del
 * `code` (la unica llamada saliente, y de un solo uso: Mercado Pago lo
 * invalida al primer canje, exitoso o no).
 */
export async function GET(request: Request) {
  const config = getPlatformOAuthConfig();
  if (!config) {
    return NextResponse.json({ message: 'Mercado Pago OAuth no esta configurado.' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code') ?? '';
  const state = searchParams.get('state') ?? '';

  const stateCheck = verifyMercadoPagoOAuthState(state, config.clientSecret);
  if (!stateCheck.valid) {
    console.warn('mercado_pago_oauth_invalid_state', { reason: stateCheck.reason });
    return NextResponse.json({ message: 'State invalido' }, { status: 401 });
  }

  const cookieStore = await cookies();
  const nonce = cookieStore.get(MERCADO_PAGO_OAUTH_NONCE_COOKIE)?.value;

  if (!nonce || nonce !== stateCheck.payload.nonce) {
    console.warn('mercado_pago_oauth_nonce_mismatch', { workspaceId: stateCheck.payload.workspaceId });
    return NextResponse.json({ message: 'La sesion de conexion no coincide' }, { status: 401 });
  }

  // El usuario que completa el callback debe ser el mismo que lo inicio, en
  // el mismo workspace, y seguir teniendo permiso: nada de esto se vuelve a
  // confiar del state por si solo (ya viaja firmado, pero el ROL puede haber
  // cambiado desde que se genero).
  const user = await requireCurrentUser();
  if (user.id !== stateCheck.payload.userId || user.workspace.id !== stateCheck.payload.workspaceId) {
    console.warn('mercado_pago_oauth_user_mismatch', {
      expectedUserId: stateCheck.payload.userId,
      expectedWorkspaceId: stateCheck.payload.workspaceId,
      actualUserId: user.id,
      actualWorkspaceId: user.workspace.id,
    });
    return NextResponse.json({ message: 'La sesion no coincide con quien inicio la conexion' }, { status: 401 });
  }
  if (!canManageMercadoPago(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede conectar Mercado Pago.' },
      { status: 403 },
    );
  }

  if (!code) {
    return NextResponse.json({ message: 'Falta el code' }, { status: 400 });
  }

  let tokens;
  try {
    tokens = await exchangeMercadoPagoOAuthCode({ config, code, redirectUri: redirectUri() });
  } catch (error) {
    const message =
      error instanceof MercadoPagoCredentialError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'error desconocido';
    console.error('mercado_pago_oauth_exchange_failed', { workspaceId: user.workspace.id, error: message });
    cookieStore.delete(MERCADO_PAGO_OAUTH_NONCE_COOKIE);
    return NextResponse.redirect(integracionesUrl('mercado_pago=error'));
  }

  // Una cuenta de Mercado Pago pertenece a un solo workspace: si ya esta
  // conectada (por OAuth) a otro, se rechaza en vez de reasignarla en
  // silencio — igual que Shopify con el dominio de tienda.
  const taken = await prisma.mercadoPagoConnection.findFirst({
    where: { mercadoPagoUserId: tokens.mercadoPagoUserId, connectionMethod: MercadoPagoConnectionMethod.OAUTH },
    select: { workspaceId: true },
  });
  if (taken && taken.workspaceId !== user.workspace.id) {
    cookieStore.delete(MERCADO_PAGO_OAUTH_NONCE_COOKIE);
    return NextResponse.json({ message: 'Esa cuenta de Mercado Pago ya esta conectada a otro workspace.' }, { status: 409 });
  }

  const expiresAt = tokens.expiresInSeconds ? new Date(Date.now() + tokens.expiresInSeconds * 1000) : null;

  await prisma.mercadoPagoConnection.upsert({
    where: { workspaceId: user.workspace.id },
    create: {
      workspaceId: user.workspace.id,
      connectionMethod: MercadoPagoConnectionMethod.OAUTH,
      mode: tokens.liveMode ? 'PRODUCTION' : 'TEST',
      mercadoPagoUserId: tokens.mercadoPagoUserId,
      publicKey: tokens.publicKey,
      accessTokenEncrypted: encryptSecret(tokens.accessToken),
      refreshTokenEncrypted: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
      accessTokenExpiresAt: expiresAt,
      scopes: tokens.scope,
      status: MercadoPagoConnectionStatus.CONNECTED,
      connectedAt: new Date(),
      lastVerifiedAt: new Date(),
      lastErrorCode: null,
      lastError: null,
    },
    update: {
      connectionMethod: MercadoPagoConnectionMethod.OAUTH,
      mode: tokens.liveMode ? 'PRODUCTION' : 'TEST',
      mercadoPagoUserId: tokens.mercadoPagoUserId,
      publicKey: tokens.publicKey,
      accessTokenEncrypted: encryptSecret(tokens.accessToken),
      refreshTokenEncrypted: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
      accessTokenExpiresAt: expiresAt,
      scopes: tokens.scope,
      status: MercadoPagoConnectionStatus.CONNECTED,
      connectedAt: new Date(),
      lastVerifiedAt: new Date(),
      lastErrorCode: null,
      lastError: null,
    },
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'mercado_pago.oauth_connected',
    entity: 'MercadoPagoConnection',
    // Nunca el token, ni cifrado: solo lo que identifica la cuenta y el alcance.
    metadata: { mercadoPagoUserId: tokens.mercadoPagoUserId, mode: tokens.liveMode ? 'PRODUCTION' : 'TEST', scope: tokens.scope },
  });

  cookieStore.delete(MERCADO_PAGO_OAUTH_NONCE_COOKIE);

  return NextResponse.redirect(integracionesUrl('mercado_pago=conectado'));
}
