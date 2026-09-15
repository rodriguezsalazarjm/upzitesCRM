import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireCurrentUser } from '@/lib/auth';
import { isEncryptionConfigured } from '@/lib/crypto';
import { recordAudit } from '@/lib/domain/audit';
import { buildMercadoPagoAuthorizationUrl, canManageMercadoPago, getPlatformOAuthConfig } from '@/lib/mercado-pago';
import { createMercadoPagoOAuthState } from '@/lib/commerce/mercado-pago-oauth-state';

export const dynamic = 'force-dynamic';

export const MERCADO_PAGO_OAUTH_NONCE_COOKIE = 'upzites_mp_oauth_nonce';

function redirectUri() {
  const base = (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
  return `${base}/api/integrations/mercado-pago/oauth/callback`;
}

/**
 * Inicia el OAuth: el vendedor autoriza la APLICACION de Mercado Pago de
 * Upzites Flow (marketplace), no pega ningun token a mano.
 *
 * Mismo diseno que /api/integrations/shopify/connect: el nonce viaja por dos
 * canales (dentro del state firmado y en una cookie httpOnly) y el callback
 * exige que coincidan, para que un state capturado no sirva desde otro
 * navegador.
 */
export async function GET() {
  const user = await requireCurrentUser();

  if (!canManageMercadoPago(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede conectar Mercado Pago.' },
      { status: 403 },
    );
  }

  const config = getPlatformOAuthConfig();
  if (!config) {
    return NextResponse.json(
      {
        message:
          'Mercado Pago OAuth no esta configurado: faltan MERCADO_PAGO_CLIENT_ID/MERCADO_PAGO_CLIENT_SECRET.',
      },
      { status: 503 },
    );
  }

  if (!isEncryptionConfigured()) {
    return NextResponse.json(
      { message: 'Falta INTEGRATION_ENCRYPTION_KEY: no se puede guardar la conexion.' },
      { status: 503 },
    );
  }

  const { state, nonce } = createMercadoPagoOAuthState(
    { workspaceId: user.workspace.id, userId: user.id },
    config.clientSecret,
  );

  const cookieStore = await cookies();
  cookieStore.set(MERCADO_PAGO_OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'mercado_pago.oauth_started',
    entity: 'MercadoPagoConnection',
  });

  const authorizationUrl = buildMercadoPagoAuthorizationUrl({
    config,
    state,
    redirectUri: redirectUri(),
  });

  return NextResponse.redirect(authorizationUrl);
}
