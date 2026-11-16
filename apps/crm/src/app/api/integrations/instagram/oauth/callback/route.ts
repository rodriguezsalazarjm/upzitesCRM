import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { encryptSecret } from '@/lib/crypto';
import { recordAudit } from '@/lib/domain/audit';
import { prisma } from '@/lib/prisma';
import {
  INSTAGRAM_OAUTH_NONCE_COOKIE,
  INSTAGRAM_OAUTH_SCOPES,
  InstagramOAuthError,
  exchangeForLongLivedInstagramToken,
  exchangeInstagramOAuthCode,
  fetchInstagramProfile,
  getInstagramOAuthConfig,
} from '@/lib/instagram/oauth';
import { ensureInstagramWebhookSubscription } from '@/lib/instagram/webhook-subscription';
import { verifyMetaOAuthState } from '@/lib/meta/meta-oauth-state';

export const dynamic = 'force-dynamic';

function integracionesUrl(query: string) {
  const base = (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
  return `${base}/integraciones?${query}`;
}

/**
 * Callback de Business Login for Instagram. Orden de controles, de mas
 * barato a mas caro (mismo diseno que Mercado Pago): state firmado, nonce de
 * cookie, permisos del usuario ACTUAL, y recien despues el intercambio del
 * `code` (la unica llamada saliente real).
 */
export async function GET(request: Request) {
  const config = getInstagramOAuthConfig();
  if (!config) {
    return NextResponse.json({ message: 'Instagram OAuth no esta configurado.' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code') ?? '';
  const state = searchParams.get('state') ?? '';

  const stateCheck = verifyMetaOAuthState(state, config.appSecret, 'INSTAGRAM');
  if (!stateCheck.valid) {
    console.warn('instagram_oauth_invalid_state', { reason: stateCheck.reason });
    return NextResponse.json({ message: 'State invalido' }, { status: 401 });
  }

  const cookieStore = await cookies();
  const nonce = cookieStore.get(INSTAGRAM_OAUTH_NONCE_COOKIE)?.value;
  if (!nonce || nonce !== stateCheck.payload.nonce) {
    console.warn('instagram_oauth_nonce_mismatch', { workspaceId: stateCheck.payload.workspaceId });
    return NextResponse.json({ message: 'La sesion de conexion no coincide' }, { status: 401 });
  }

  // El usuario que completa el callback debe ser el mismo que lo inicio, en
  // el mismo workspace, y seguir teniendo permiso — el ROL puede haber
  // cambiado desde que se genero el state.
  const user = await requireCurrentUser();
  if (user.id !== stateCheck.payload.userId || user.workspace.id !== stateCheck.payload.workspaceId) {
    console.warn('instagram_oauth_user_mismatch', {
      expectedUserId: stateCheck.payload.userId,
      expectedWorkspaceId: stateCheck.payload.workspaceId,
      actualUserId: user.id,
      actualWorkspaceId: user.workspace.id,
    });
    return NextResponse.json({ message: 'La sesion no coincide con quien inicio la conexion' }, { status: 401 });
  }
  if (!canManageChannels(user.role)) {
    return NextResponse.json({ message: 'Solo el owner o un admin puede conectar Instagram.' }, { status: 403 });
  }

  if (!code) {
    return NextResponse.json({ message: 'Falta el code' }, { status: 400 });
  }

  try {
    const shortLived = await exchangeInstagramOAuthCode({ config, code });
    const longLived = await exchangeForLongLivedInstagramToken({
      shortLivedAccessToken: shortLived.accessToken,
      appSecret: config.appSecret,
    });
    const profile = await fetchInstagramProfile({ accessToken: longLived.accessToken });

    // Una cuenta de Instagram profesional pertenece a un solo workspace: si ya
    // esta conectada a otro, se rechaza en vez de reasignarla en silencio
    // (spec Fase D1, seccion 8) — igual criterio que Mercado Pago/Shopify.
    const taken = await prisma.channelAccount.findUnique({
      where: { channel_externalAccountId: { channel: 'INSTAGRAM', externalAccountId: profile.id } },
      select: { workspaceId: true },
    });
    if (taken && taken.workspaceId !== user.workspace.id) {
      cookieStore.delete(INSTAGRAM_OAUTH_NONCE_COOKIE);
      return NextResponse.json({ message: 'Esa cuenta de Instagram ya esta conectada a otro workspace.' }, { status: 409 });
    }

    await prisma.channelAccount.upsert({
      where: { channel_externalAccountId: { channel: 'INSTAGRAM', externalAccountId: profile.id } },
      create: {
        workspaceId: user.workspace.id,
        channel: 'INSTAGRAM',
        connectionMethod: 'OAUTH',
        externalAccountId: profile.id,
        displayName: profile.username,
        accessTokenEncrypted: encryptSecret(longLived.accessToken),
        accessTokenExpiresAt: new Date(Date.now() + longLived.expiresInSeconds * 1000),
        scopes: INSTAGRAM_OAUTH_SCOPES.join(','),
        capabilities: [],
        status: 'CONNECTED',
        connectedAt: new Date(),
        lastVerifiedAt: new Date(),
        lastErrorCode: null,
        lastError: null,
        metadata: { authorization: { mechanism: 'INSTAGRAM_LOGIN', tokenType: 'INSTAGRAM_USER', instagramAccountId: profile.id } },
      },
      update: {
        workspaceId: user.workspace.id,
        displayName: profile.username,
        // Reconectar es la forma de sumar un permiso nuevo (P19: publicar).
        scopes: INSTAGRAM_OAUTH_SCOPES.join(','),
        accessTokenEncrypted: encryptSecret(longLived.accessToken),
        accessTokenExpiresAt: new Date(Date.now() + longLived.expiresInSeconds * 1000),
        status: 'CONNECTED',
        connectedAt: new Date(),
        lastVerifiedAt: new Date(),
        lastErrorCode: null,
        lastError: null,
        metadata: { authorization: { mechanism: 'INSTAGRAM_LOGIN', tokenType: 'INSTAGRAM_USER', instagramAccountId: profile.id } },
      },
    });

    // Suscripcion de webhook: si falla, la cuenta queda CONNECTED igual (el
    // token es valido), pero sin eventos entrantes hasta reintentar desde
    // "Verificar conexion" — no vale la pena revertir la conexion por esto.
    try {
      await ensureInstagramWebhookSubscription({ instagramAccountId: profile.id, accessToken: longLived.accessToken });
    } catch (error) {
      console.error('instagram_webhook_subscription_failed', { workspaceId: user.workspace.id, error: error instanceof Error ? error.message : error });
    }

    await recordAudit({
      workspaceId: user.workspace.id,
      actorId: user.id,
      action: 'instagram.oauth_connected',
      entity: 'ChannelAccount',
      // Nunca el token: solo lo que identifica la cuenta y el alcance.
      metadata: { instagramAccountId: profile.id, username: profile.username },
    });

    cookieStore.delete(INSTAGRAM_OAUTH_NONCE_COOKIE);
    return NextResponse.redirect(integracionesUrl('instagram=conectado'));
  } catch (error) {
    const message = error instanceof InstagramOAuthError ? error.message : error instanceof Error ? error.message : 'error desconocido';
    console.error('instagram_oauth_failed', { workspaceId: user.workspace.id, error: message });
    cookieStore.delete(INSTAGRAM_OAUTH_NONCE_COOKIE);
    return NextResponse.redirect(integracionesUrl('instagram=error'));
  }
}
