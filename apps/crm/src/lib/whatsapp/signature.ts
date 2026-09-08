import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Validacion de la firma X-Hub-Signature-256 de Meta.
 *
 * Meta firma el cuerpo CRUDO con el App Secret. Hay que verificar sobre el texto
 * exacto recibido: cualquier `JSON.parse` + `JSON.stringify` intermedio cambia
 * los bytes y la firma deja de coincidir.
 */
export type SignatureVerification = { valid: true } | { valid: false; reason: string };

export function verifyMetaSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  appSecret?: string;
}): SignatureVerification {
  const appSecret = input.appSecret ?? process.env.META_APP_SECRET;

  if (!appSecret) return { valid: false, reason: 'META_APP_SECRET no configurado' };
  if (!input.signatureHeader) return { valid: false, reason: 'falta el header x-hub-signature-256' };

  const [algorithm, received] = input.signatureHeader.split('=');
  if (algorithm !== 'sha256' || !received) {
    return { valid: false, reason: 'formato de firma no reconocido' };
  }

  const expected = createHmac('sha256', appSecret).update(input.rawBody, 'utf8').digest('hex');
  const receivedBuffer = Buffer.from(received, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  if (receivedBuffer.length !== expectedBuffer.length) {
    return { valid: false, reason: 'firma invalida' };
  }

  return timingSafeEqual(receivedBuffer, expectedBuffer)
    ? { valid: true }
    : { valid: false, reason: 'firma invalida' };
}

/**
 * Verificacion del webhook (handshake GET). Meta manda hub.mode, hub.verify_token
 * y hub.challenge; hay que devolver el challenge tal cual si el token coincide.
 */
export function resolveVerification(searchParams: URLSearchParams) {
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!expected) return { ok: false as const, reason: 'WHATSAPP_VERIFY_TOKEN no configurado' };
  if (mode !== 'subscribe') return { ok: false as const, reason: 'hub.mode invalido' };
  if (token !== expected) return { ok: false as const, reason: 'hub.verify_token invalido' };
  if (!challenge) return { ok: false as const, reason: 'falta hub.challenge' };

  return { ok: true as const, challenge };
}
