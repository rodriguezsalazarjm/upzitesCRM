import { createHmac } from 'node:crypto';

/**
 * Reglas puras de la entrega digital: token, estados e intentos. Sin base ni
 * red, para poder probarlas aisladas (ver delivery-rules.test.ts).
 */

export type DeliveryState = 'AVAILABLE' | 'SENT' | 'FAILED' | 'ACCESSED' | 'REVOKED' | 'EXPIRED';

/**
 * Token del enlace de entrega. Se DERIVA del id de la entrega y su version con
 * HMAC del secreto del servidor: es impredecible sin el secreto (256 bits), la
 * base guarda solo su hash, y aun asi la pagina post-compra puede volver a
 * mostrarlo sin guardarlo en claro. Cambiar la version invalida el anterior.
 */
export function deriveDeliveryToken(deliveryId: string, version: number, secret: string) {
  return createHmac('sha256', secret).update(`digital-delivery:v1:${deliveryId}:${version}`).digest('base64url');
}

/** Forma de un token aceptable antes de tocar la base (los heredados son de 43 tambien). */
export function isWellFormedToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(token);
}

export type TransportOutcome = {
  whatsapp: boolean;
  email: boolean;
  failures?: string[];
  skipped?: string[];
};

/**
 * Como queda la entrega despues de un intento de envio.
 *
 *  - Algun canal lo envio → SENT.
 *  - Algun canal se intento y fallo (y ninguno funciono) → FAILED.
 *  - No habia ningun canal que intentar → el estado no cambia (AVAILABLE
 *    sigue siendo la verdad: el enlace existe y el comprador lo ve en la pagina
 *    post-compra) y queda el motivo.
 *
 * Nunca se marca SENT solo porque exista el registro.
 */
export function stateAfterAttempt(current: DeliveryState, outcome: TransportOutcome | { error: string }): { status: DeliveryState; error: string | null } {
  if ('error' in outcome) return { status: 'FAILED', error: outcome.error };
  if (outcome.whatsapp || outcome.email) return { status: 'SENT', error: null };
  if (outcome.failures && outcome.failures.length > 0) return { status: 'FAILED', error: outcome.failures.join(' ') };
  const reason = outcome.skipped && outcome.skipped.length > 0 ? outcome.skipped.join(' ') : 'No hay un canal de envío disponible.';
  return { status: current === 'SENT' || current === 'FAILED' ? current : 'AVAILABLE', error: `Sin envío automático: ${reason}` };
}

export type AccessCheck =
  | { ok: true }
  | { ok: false; reason: 'REVOKED' | 'EXPIRED' | 'LIMIT_REACHED' };

/**
 * Si una entrega da acceso. FAILED (o AVAILABLE sin envio) SI da acceso: el
 * fallo fue del aviso, no del producto, y el comprador ya pago. Revocada o
 * vencida, no.
 */
export function checkAccess(delivery: {
  status: DeliveryState;
  revokedAt?: Date | null;
  expiresAt: Date | null;
  downloadCount: number;
  maxDownloads: number;
  itemCount: number;
}, now = new Date()): AccessCheck {
  if (delivery.status === 'REVOKED' || delivery.revokedAt) return { ok: false, reason: 'REVOKED' };
  if (delivery.status === 'EXPIRED' || (delivery.expiresAt && delivery.expiresAt < now)) return { ok: false, reason: 'EXPIRED' };
  // Tope total: el de cada archivo por la cantidad de archivos.
  if (delivery.downloadCount >= delivery.maxDownloads * Math.max(1, delivery.itemCount)) return { ok: false, reason: 'LIMIT_REACHED' };
  return { ok: true };
}
