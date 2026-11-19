import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { isEncryptionConfigured } from '@/lib/crypto';
import { recordAudit } from '@/lib/domain/audit';
import { createMetaOAuthState } from '@/lib/meta/meta-oauth-state';
import { TIKTOK_OAUTH_NONCE_COOKIE, buildTikTokAuthorizationUrl, getTikTokOAuthConfig } from '@/lib/tiktok/oauth';

export const dynamic = 'force-dynamic';

/** P29: inicia Login Kit de TikTok. Mismo diseño que Instagram: state firmado + nonce en cookie httpOnly. */
export async function GET() {
  const user = await requireCurrentUser();
  if (!canManageChannels(user.role)) return NextResponse.json({ message: 'Solo el owner o un admin puede conectar TikTok.' }, { status: 403 });
  const config = getTikTokOAuthConfig();
  if (!config) return NextResponse.json({ message: 'TikTok OAuth no está configurado: faltan TIKTOK_CLIENT_KEY/TIKTOK_CLIENT_SECRET.' }, { status: 503 });
  if (!isEncryptionConfigured()) return NextResponse.json({ message: 'Falta INTEGRATION_ENCRYPTION_KEY: no se puede guardar la conexión.' }, { status: 503 });

  const { state, nonce } = createMetaOAuthState({ workspaceId: user.workspace.id, userId: user.id, channel: 'TIKTOK' }, config.clientSecret);
  const cookieStore = await cookies();
  cookieStore.set(TIKTOK_OAUTH_NONCE_COOKIE, nonce, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 });
  await recordAudit({ workspaceId: user.workspace.id, actorId: user.id, action: 'tiktok.oauth_started', entity: 'ChannelAccount' });
  return NextResponse.redirect(buildTikTokAuthorizationUrl({ config, state }));
}
