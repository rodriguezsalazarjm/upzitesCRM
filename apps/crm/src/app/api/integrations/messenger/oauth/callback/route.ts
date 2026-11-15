import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { recordAudit } from '@/lib/domain/audit';
import {
  MESSENGER_OAUTH_NONCE_COOKIE,
  MessengerOAuthError,
  exchangeForLongLivedUserToken,
  exchangeMessengerOAuthCode,
  fetchManagedPages,
  getMessengerOAuthConfig,
} from '@/lib/messenger/oauth';
import { MESSENGER_PENDING_COOKIE, encodeMessengerPendingSelection } from '@/lib/messenger/pending-selection';
import { verifyMetaOAuthState } from '@/lib/meta/meta-oauth-state';

export const dynamic = 'force-dynamic';

function integracionesUrl(query: string) {
  const base = (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
  return `${base}/integraciones?${query}`;
}

/**
 * Callback de Facebook Login. A diferencia de Instagram, esto NUNCA conecta
 * una cuenta directamente: solo intercambia el code, obtiene las Pages
 * administradas y las deja pendientes de seleccion (spec Fase D1, seccion
 * 14) — la conexion real ocurre en /api/integrations/messenger/select-page,
 * despues de que el usuario elige.
 */
export async function GET(request: Request) {
  const config = getMessengerOAuthConfig();
  if (!config) return NextResponse.json({ message: 'Messenger OAuth no esta configurado.' }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code') ?? '';
  const state = searchParams.get('state') ?? '';

  const stateCheck = verifyMetaOAuthState(state, config.appSecret, 'MESSENGER');
  if (!stateCheck.valid) {
    console.warn('messenger_oauth_invalid_state', { reason: stateCheck.reason });
    return NextResponse.json({ message: 'State invalido' }, { status: 401 });
  }

  const cookieStore = await cookies();
  const nonce = cookieStore.get(MESSENGER_OAUTH_NONCE_COOKIE)?.value;
  if (!nonce || nonce !== stateCheck.payload.nonce) {
    console.warn('messenger_oauth_nonce_mismatch', { workspaceId: stateCheck.payload.workspaceId });
    return NextResponse.json({ message: 'La sesion de conexion no coincide' }, { status: 401 });
  }

  const user = await requireCurrentUser();
  if (user.id !== stateCheck.payload.userId || user.workspace.id !== stateCheck.payload.workspaceId) {
    console.warn('messenger_oauth_user_mismatch', {
      expectedUserId: stateCheck.payload.userId,
      expectedWorkspaceId: stateCheck.payload.workspaceId,
      actualUserId: user.id,
      actualWorkspaceId: user.workspace.id,
    });
    return NextResponse.json({ message: 'La sesion no coincide con quien inicio la conexion' }, { status: 401 });
  }
  if (!canManageChannels(user.role)) {
    return NextResponse.json({ message: 'Solo el owner o un admin puede conectar Messenger.' }, { status: 403 });
  }
  if (!code) return NextResponse.json({ message: 'Falta el code' }, { status: 400 });

  try {
    const shortLived = await exchangeMessengerOAuthCode({ config, code });
    const longLived = await exchangeForLongLivedUserToken({ config, shortLivedAccessToken: shortLived.accessToken });
    const pages = await fetchManagedPages({ userAccessToken: longLived.accessToken });

    if (pages.length === 0) {
      cookieStore.delete(MESSENGER_OAUTH_NONCE_COOKIE);
      return NextResponse.redirect(integracionesUrl('messenger=sin_paginas'));
    }

    cookieStore.set(MESSENGER_PENDING_COOKIE, encodeMessengerPendingSelection({ workspaceId: user.workspace.id, userId: user.id, pages }), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 600,
    });

    await recordAudit({
      workspaceId: user.workspace.id,
      actorId: user.id,
      action: 'messenger.oauth_pages_listed',
      entity: 'ChannelAccount',
      metadata: { pageCount: pages.length },
    });

    cookieStore.delete(MESSENGER_OAUTH_NONCE_COOKIE);
    return NextResponse.redirect(integracionesUrl('messenger=elegir_pagina'));
  } catch (error) {
    const message = error instanceof MessengerOAuthError ? error.message : error instanceof Error ? error.message : 'error desconocido';
    console.error('messenger_oauth_failed', { workspaceId: user.workspace.id, error: message });
    cookieStore.delete(MESSENGER_OAUTH_NONCE_COOKIE);
    return NextResponse.redirect(integracionesUrl('messenger=error'));
  }
}
