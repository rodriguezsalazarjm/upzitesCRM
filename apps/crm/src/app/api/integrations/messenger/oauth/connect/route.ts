import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { isEncryptionConfigured } from '@/lib/crypto';
import { recordAudit } from '@/lib/domain/audit';
import { MESSENGER_OAUTH_NONCE_COOKIE, buildFacebookLoginAuthorizationUrl, getMessengerOAuthConfig } from '@/lib/messenger/oauth';
import { createMetaOAuthState } from '@/lib/meta/meta-oauth-state';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireCurrentUser();

  if (!canManageChannels(user.role)) {
    return NextResponse.json({ message: 'Solo el owner o un admin puede conectar Messenger.' }, { status: 403 });
  }

  const config = getMessengerOAuthConfig();
  if (!config) {
    return NextResponse.json(
      { message: 'Messenger OAuth no esta configurado: faltan META_APP_ID/META_APP_SECRET.' },
      { status: 503 },
    );
  }
  if (!isEncryptionConfigured()) {
    return NextResponse.json({ message: 'Falta INTEGRATION_ENCRYPTION_KEY: no se puede guardar la conexion.' }, { status: 503 });
  }

  const { state, nonce } = createMetaOAuthState(
    { workspaceId: user.workspace.id, userId: user.id, channel: 'MESSENGER' },
    config.appSecret,
  );

  const cookieStore = await cookies();
  cookieStore.set(MESSENGER_OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'messenger.oauth_started',
    entity: 'ChannelAccount',
  });

  return NextResponse.redirect(buildFacebookLoginAuthorizationUrl({ config, state }));
}
