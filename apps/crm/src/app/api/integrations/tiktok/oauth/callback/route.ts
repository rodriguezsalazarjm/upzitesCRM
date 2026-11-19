import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { recordAudit } from '@/lib/domain/audit';
import { verifyMetaOAuthState } from '@/lib/meta/meta-oauth-state';
import { prisma } from '@/lib/prisma';
import { TIKTOK_OAUTH_NONCE_COOKIE, exchangeTikTokOAuthCode, fetchTikTokProfile, getTikTokOAuthConfig, tokenColumns } from '@/lib/tiktok/oauth';

export const dynamic = 'force-dynamic';

function integracionesUrl(query: string) {
  const base = (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
  return `${base}/integraciones?${query}`;
}

/** P29: callback de Login Kit. Controles baratos primero (state, nonce, usuario y rol) y recién después el canje del code. */
export async function GET(request: Request) {
  const config = getTikTokOAuthConfig();
  if (!config) return NextResponse.json({ message: 'TikTok OAuth no está configurado.' }, { status: 503 });

  const { searchParams } = new URL(request.url);
  // El usuario canceló o TikTok rechazó: volver a Integraciones sin canjear nada.
  if (searchParams.get('error')) return NextResponse.redirect(integracionesUrl('tiktok=cancelado'));
  const code = searchParams.get('code') ?? '';
  const stateCheck = verifyMetaOAuthState(searchParams.get('state') ?? '', config.clientSecret, 'TIKTOK');
  if (!stateCheck.valid) {
    console.warn('tiktok_oauth_invalid_state', { reason: stateCheck.reason });
    return NextResponse.json({ message: 'State invalido' }, { status: 401 });
  }
  const cookieStore = await cookies();
  const nonce = cookieStore.get(TIKTOK_OAUTH_NONCE_COOKIE)?.value;
  if (!nonce || nonce !== stateCheck.payload.nonce) return NextResponse.json({ message: 'La sesion de conexion no coincide' }, { status: 401 });

  const user = await requireCurrentUser();
  if (user.id !== stateCheck.payload.userId || user.workspace.id !== stateCheck.payload.workspaceId) {
    return NextResponse.json({ message: 'La sesion no coincide con quien inicio la conexion' }, { status: 401 });
  }
  if (!canManageChannels(user.role)) return NextResponse.json({ message: 'Solo el owner o un admin puede conectar TikTok.' }, { status: 403 });
  if (!code) return NextResponse.json({ message: 'Falta el code' }, { status: 400 });

  try {
    const tokens = await exchangeTikTokOAuthCode({ config, code });
    const profile = await fetchTikTokProfile(tokens.accessToken);
    const taken = await prisma.channelAccount.findUnique({
      where: { channel_externalAccountId: { channel: 'TIKTOK', externalAccountId: tokens.openId } },
      select: { workspaceId: true },
    });
    if (taken && taken.workspaceId !== user.workspace.id) {
      cookieStore.delete(TIKTOK_OAUTH_NONCE_COOKIE);
      return NextResponse.json({ message: 'Esa cuenta de TikTok ya está conectada a otro workspace.' }, { status: 409 });
    }
    const fields = {
      workspaceId: user.workspace.id,
      displayName: profile.displayName,
      ...tokenColumns(tokens),
      // Los permisos que el creador CONCEDIÓ (puede desmarcar alguno).
      scopes: tokens.grantedScopes.join(','),
      status: 'CONNECTED' as const,
      connectedAt: new Date(),
      lastVerifiedAt: new Date(),
      lastErrorCode: null,
      lastError: null,
      metadata: { authorization: { mechanism: 'TIKTOK_LOGIN_KIT', product: 'CONTENT_POSTING' } },
    };
    await prisma.channelAccount.upsert({
      where: { channel_externalAccountId: { channel: 'TIKTOK', externalAccountId: tokens.openId } },
      create: { ...fields, channel: 'TIKTOK', connectionMethod: 'OAUTH', externalAccountId: tokens.openId, capabilities: [] },
      update: fields,
    });
    await recordAudit({
      workspaceId: user.workspace.id,
      actorId: user.id,
      action: 'tiktok.oauth_connected',
      entity: 'ChannelAccount',
      // Nunca el token: solo lo que identifica la cuenta y el alcance.
      metadata: { openId: tokens.openId, displayName: profile.displayName, scopes: tokens.grantedScopes },
    });
    cookieStore.delete(TIKTOK_OAUTH_NONCE_COOKIE);
    return NextResponse.redirect(integracionesUrl('tiktok=conectado'));
  } catch (error) {
    console.error('tiktok_oauth_failed', { workspaceId: user.workspace.id, error: error instanceof Error ? error.message : error });
    cookieStore.delete(TIKTOK_OAUTH_NONCE_COOKIE);
    return NextResponse.redirect(integracionesUrl('tiktok=error'));
  }
}
