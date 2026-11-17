import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { MAIL_OAUTH_NONCE_COOKIE, verifyMailOAuthState } from '@/lib/mail/oauth-state';
import { mailProvider, mailRedirectUri, providerFromSlug } from '@/lib/mail/providers';
import { connectMailbox, syncMailbox } from '@/lib/mail/service';

export const dynamic = 'force-dynamic';

const back = (query: string) => `${(process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '')}/inbox/email?${query}`;

/** State firmado → nonce de cookie → mismo usuario y negocio → recién ahí el intercambio del code. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const provider = providerFromSlug((await params).provider);
  const client = provider ? mailProvider(provider) : null;
  if (!provider || !client) return NextResponse.json({ message: 'Proveedor no disponible.' }, { status: 404 });
  const url = new URL(request.url);
  if (url.searchParams.get('error')) return NextResponse.redirect(back('error=cancelado'));
  const payload = verifyMailOAuthState(url.searchParams.get('state') ?? '', provider);
  if (!payload) return NextResponse.json({ message: 'State inválido o vencido.' }, { status: 401 });
  const store = await cookies();
  if (store.get(MAIL_OAUTH_NONCE_COOKIE)?.value !== payload.nonce) return NextResponse.json({ message: 'La sesión de conexión no coincide.' }, { status: 401 });
  store.delete(MAIL_OAUTH_NONCE_COOKIE);
  const user = await requireCurrentUser();
  if (user.id !== payload.userId || user.workspace.id !== payload.workspaceId) return NextResponse.json({ message: 'La sesión no coincide con quien inició la conexión.' }, { status: 401 });
  const code = url.searchParams.get('code');
  if (!code) return NextResponse.json({ message: 'Falta el code.' }, { status: 400 });
  try {
    const result = await client.exchangeCode(code, mailRedirectUri(provider));
    if (!result.emailAddress) return NextResponse.redirect(back('error=sin_email'));
    const account = await connectMailbox({ workspaceId: user.workspace.id, userId: user.id, provider, emailAddress: result.emailAddress, tokens: result });
    await syncMailbox(account).catch(() => undefined);
    return NextResponse.redirect(back('conectado=1'));
  } catch (error) {
    console.warn('mail_oauth_failed', { provider, error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.redirect(back('error=proveedor'));
  }
}
