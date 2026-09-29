import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSessionSecret } from '../session-token';

/**
 * Enlace del checkout publico (`/checkout/[id]?t=<token>`): token HMAC atado al
 * pedido y con vencimiento. Modulo sin base de datos para poder usarlo desde
 * checkout.ts (back_urls) y probarlo aislado. Ver public-checkout.ts.
 */

/** Vigencia de un enlace de checkout publico. */
export const PUBLIC_CHECKOUT_TTL_MS = 7 * 24 * 3_600_000;

function signature(orderId: string, expiresAtSeconds: number, secret: string) {
  return createHmac('sha256', secret).update(`public-checkout:v1:${orderId}:${expiresAtSeconds}`).digest('base64url');
}

export function signCheckoutToken(orderId: string, now = new Date(), secret = getSessionSecret()) {
  const expiresAtSeconds = Math.floor((now.getTime() + PUBLIC_CHECKOUT_TTL_MS) / 1000);
  return `${expiresAtSeconds.toString(36)}.${signature(orderId, expiresAtSeconds, secret)}`;
}

export type TokenCheck = { ok: true } | { ok: false; reason: 'INVALID' | 'EXPIRED' };

export function verifyCheckoutToken(orderId: string, token: string | null | undefined, now = new Date(), secret = getSessionSecret()): TokenCheck {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'INVALID' };
  const [rawExpiry, received, ...rest] = token.split('.');
  if (!rawExpiry || !received || rest.length > 0 || !/^[0-9a-z]{1,12}$/.test(rawExpiry)) return { ok: false, reason: 'INVALID' };
  const expiresAtSeconds = Number.parseInt(rawExpiry, 36);
  if (!Number.isSafeInteger(expiresAtSeconds)) return { ok: false, reason: 'INVALID' };

  const expected = Buffer.from(signature(orderId, expiresAtSeconds, secret), 'utf8');
  const given = Buffer.from(received, 'utf8');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: 'INVALID' };
  // La firma se valida antes del vencimiento: un token ajeno nunca dice "expirado".
  if (expiresAtSeconds * 1000 < now.getTime()) return { ok: false, reason: 'EXPIRED' };
  return { ok: true };
}

function baseUrl() {
  return (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
}

/** URL publica del checkout. `result` es la marca de retorno de Mercado Pago. */
export function publicCheckoutUrl(orderId: string, options: { result?: 'success' | 'pending' | 'failure'; now?: Date; absolute?: boolean } = {}) {
  const params = new URLSearchParams({ t: signCheckoutToken(orderId, options.now) });
  if (options.result) params.set('r', options.result);
  const path = `/checkout/${encodeURIComponent(orderId)}?${params.toString()}`;
  return options.absolute === false ? path : `${baseUrl()}${path}`;
}

/** Unico selector permitido para salidas buyer-facing. Ignora URLs del provider. */
export function buyerFacingCheckoutUrl(checkout: { publicUrl: string; providerUrl?: string; checkoutUrl?: string }) {
  return checkout.publicUrl;
}

/** `cliente@dominio.com` → `cl•••@dominio.com`: basta para reconocerse, no para filtrar. */
export function maskEmail(email: string | null | undefined) {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at <= 0) return null;
  const local = email.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length))}•••${email.slice(at)}`;
}

/** Solo se redirige a Mercado Pago (o a la demo local, ruta relativa). */
export function isAllowedPaymentRedirect(url: string) {
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && /(^|\.)mercadopago\.(com|cl|com\.ar|com\.br|com\.mx|com\.co|com\.pe|com\.uy)$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}
