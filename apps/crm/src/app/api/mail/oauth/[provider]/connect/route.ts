import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { isEncryptionConfigured } from '@/lib/crypto';
import { createMailOAuthState, MAIL_OAUTH_NONCE_COOKIE } from '@/lib/mail/oauth-state';
import { mailProvider, mailRedirectUri, MAIL_PROVIDERS, providerFromSlug } from '@/lib/mail/providers';

export const dynamic = 'force-dynamic';

/** Inicia el OAuth del buzón personal (nonce en state firmado + cookie httpOnly). */
export async function GET(_request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const user = await requireCurrentUser();
  const provider = providerFromSlug((await params).provider);
  if (!provider) return NextResponse.json({ message: 'Proveedor desconocido.' }, { status: 404 });
  const client = mailProvider(provider);
  if (!client) return NextResponse.json({ message: `${MAIL_PROVIDERS[provider].label} no está configurado: faltan ${MAIL_PROVIDERS[provider].env.join(' y ')}.` }, { status: 503 });
  if (!isEncryptionConfigured()) return NextResponse.json({ message: 'Falta INTEGRATION_ENCRYPTION_KEY: no se puede guardar la conexión.' }, { status: 503 });
  const { state, nonce } = createMailOAuthState({ workspaceId: user.workspace.id, userId: user.id, provider });
  (await cookies()).set(MAIL_OAUTH_NONCE_COOKIE, nonce, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 });
  return NextResponse.redirect(client.authorizeUrl(state, mailRedirectUri(provider)));
}
