import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getSessionSecret } from '../session-token';

/**
 * P38: `state` del OAuth del buzón. Mismo diseño que el de Meta (HMAC + nonce
 * en cookie + vencimiento), con el proveedor dentro para que un state de Gmail
 * no sirva en el callback de Microsoft.
 */
export const MAIL_OAUTH_NONCE_COOKIE = 'upz_mail_oauth_nonce';
const TTL_MS = 10 * 60_000;
type Payload = { workspaceId: string; userId: string; provider: string; nonce: string; exp: number };

const sign = (body: string) => createHmac('sha256', `mail-oauth:${getSessionSecret()}`).update(body).digest('base64url');

export function createMailOAuthState(input: { workspaceId: string; userId: string; provider: string }, now = Date.now()) {
  const payload: Payload = { ...input, nonce: randomBytes(16).toString('base64url'), exp: now + TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { state: `${body}.${sign(body)}`, nonce: payload.nonce };
}

export function verifyMailOAuthState(state: string, provider: string, now = Date.now()): Payload | null {
  const [body, signature] = state.split('.');
  if (!body || !signature) return null;
  const a = Buffer.from(signature);
  const b = Buffer.from(sign(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Payload;
    return payload.exp > now && payload.provider === provider ? payload : null;
  } catch {
    return null;
  }
}
