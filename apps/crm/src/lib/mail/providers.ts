import type { MailProvider } from '../../../generated/prisma/client';
import { isLocalDemo } from '../testing/local-mode';
import { fakeMailProvider } from './fake';
import { gmailProvider } from './gmail';
import { microsoftProvider } from './microsoft';
import type { MailProviderClient } from './types';

export const MAIL_PROVIDERS: Record<MailProvider, { label: string; slug: string; env: [string, string] }> = {
  GMAIL: { label: 'Gmail', slug: 'gmail', env: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'] },
  MICROSOFT: { label: 'Microsoft 365 / Outlook', slug: 'microsoft', env: ['MICROSOFT_OAUTH_CLIENT_ID', 'MICROSOFT_OAUTH_CLIENT_SECRET'] },
};
export const providerFromSlug = (slug: string) => (Object.entries(MAIL_PROVIDERS).find(([, v]) => v.slug === slug)?.[0] ?? null) as MailProvider | null;

let override: MailProviderClient | null = null;
/** Tests: todos los proveedores responden con este cliente. */
export const setMailProviderForTests = (client: MailProviderClient | null) => { override = client; };

/** null = no configurado (el botón se muestra deshabilitado con el motivo). */
export function mailProvider(provider: MailProvider): MailProviderClient | null {
  if (override) return override;
  const [idVar, secretVar] = MAIL_PROVIDERS[provider].env;
  const clientId = process.env[idVar];
  const clientSecret = process.env[secretVar];
  if (clientId && clientSecret) return provider === 'GMAIL' ? gmailProvider({ clientId, clientSecret }) : microsoftProvider({ clientId, clientSecret });
  // Modo local de pruebas sin credenciales: buzón falso, para poder recorrer la UI.
  return isLocalDemo() ? fakeMailProvider : null;
}

export function mailRedirectUri(provider: MailProvider) {
  const base = (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
  return `${base}/api/mail/oauth/${MAIL_PROVIDERS[provider].slug}/callback`;
}
