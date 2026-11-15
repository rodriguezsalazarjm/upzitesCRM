import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { isEncryptionConfigured } from '@/lib/crypto';
import { recordAudit } from '@/lib/domain/audit';
import { INSTAGRAM_OAUTH_NONCE_COOKIE, buildInstagramAuthorizationUrl, getInstagramOAuthConfig } from '@/lib/instagram/oauth';
import { createMetaOAuthState } from '@/lib/meta/meta-oauth-state';

export const dynamic = 'force-dynamic';

/**
 * Inicia Business Login for Instagram. Mismo diseno que
 * /api/integrations/mercado-pago/oauth/connect: el nonce viaja por dos
 * canales (state firmado + cookie httpOnly) y el callback exige que
 * coincidan, para que un state capturado no sirva desde otro navegador.
 */
export async function GET() {
  const user = await requireCurrentUser();

  if (!canManageChannels(user.role)) {
    return NextResponse.json({ message: 'Solo el owner o un admin puede conectar Instagram.' }, { status: 403 });
  }

  const config = getInstagramOAuthConfig();
  if (!config) {
    return NextResponse.json(
      { message: 'Instagram OAuth no esta configurado: faltan META_INSTAGRAM_APP_ID/META_INSTAGRAM_APP_SECRET.' },
      { status: 503 },
    );
  }

  if (!isEncryptionConfigured()) {
    return NextResponse.json({ message: 'Falta INTEGRATION_ENCRYPTION_KEY: no se puede guardar la conexion.' }, { status: 503 });
  }

  const { state, nonce } = createMetaOAuthState(
    { workspaceId: user.workspace.id, userId: user.id, channel: 'INSTAGRAM' },
    config.appSecret,
  );

  const cookieStore = await cookies();
  cookieStore.set(INSTAGRAM_OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'instagram.oauth_started',
    entity: 'ChannelAccount',
  });

  return NextResponse.redirect(buildInstagramAuthorizationUrl({ config, state }));
}
