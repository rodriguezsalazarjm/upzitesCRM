import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSessionSecret } from '../session-token';

/**
 * Enlace de compra de un PRODUCTO: `/comprar/[productId]?k=<firma>`.
 *
 * Es la puerta de entrada al checkout canonico del Punto 1: el comprador elige
 * variante y deja sus datos, el servidor crea el pedido con el precio del
 * catalogo y lo redirige a `/checkout/[orderId]?t=...` (publicUrl). No es un
 * segundo checkout: aqui no se cobra nada.
 *
 * La firma es deterministica (el enlace no cambia y se puede imprimir o pegar
 * en una bio) y esta atada al id: no se pueden enumerar productos de otros
 * negocios cambiando el id. Quien decide si se puede comprar es el ESTADO del
 * producto (solo ACTIVE), no el enlace: despublicar lo corta al instante.
 */

function signature(productId: string, secret: string) {
  return createHmac('sha256', secret).update(`product-checkout:v1:${productId}`).digest('base64url').slice(0, 32);
}

export function signProductKey(productId: string, secret = getSessionSecret()) {
  return signature(productId, secret);
}

export function verifyProductKey(productId: string, key: string | null | undefined, secret = getSessionSecret()) {
  if (!key || typeof key !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(key)) return false;
  const expected = Buffer.from(signature(productId, secret), 'utf8');
  const given = Buffer.from(key, 'utf8');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function baseUrl() {
  return (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
}

/** Enlace publico de compra (el que se copia y comparte). */
export function productCheckoutUrl(productId: string, options: { absolute?: boolean } = {}) {
  const path = `/comprar/${encodeURIComponent(productId)}?k=${signProductKey(productId)}`;
  return options.absolute === false ? path : `${baseUrl()}${path}`;
}

/** Portada servida al comprador (solo si el producto esta publicado). */
export function publicCoverUrl(productId: string, version: string) {
  return `/api/products/${encodeURIComponent(productId)}/cover?k=${signProductKey(productId)}&v=${encodeURIComponent(version)}`;
}
