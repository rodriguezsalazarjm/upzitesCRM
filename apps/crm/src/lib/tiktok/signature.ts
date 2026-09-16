import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verificacion de TikTok-Signature.
 *
 * Formato confirmado en la documentacion vigente de TikTok for Developers:
 * header `t=<timestamp>,s=<hmac-sha256 hex>`, firma = HMAC-SHA256(client
 * secret, "<timestamp>.<raw_body>"). Se verifica sobre el cuerpo CRUDO —
 * igual que Meta/Shopify, cualquier parseo intermedio invalida la firma.
 */
const DEFAULT_TOLERANCE_SECONDS = 300;

export type TikTokSignatureVerification = { valid: true } | { valid: false; reason: string };

export function verifyTikTokSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  clientSecret?: string;
  toleranceSeconds?: number;
  now?: number;
}): TikTokSignatureVerification {
  const clientSecret = input.clientSecret ?? process.env.TIKTOK_CLIENT_SECRET;
  if (!clientSecret) return { valid: false, reason: 'TIKTOK_CLIENT_SECRET no configurado' };
  if (!input.signatureHeader) return { valid: false, reason: 'falta el header TikTok-Signature' };

  const parts = Object.fromEntries(
    input.signatureHeader.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key?.trim(), value?.trim()];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.s;
  if (!timestamp || !signature) return { valid: false, reason: 'formato de firma no reconocido' };

  const expected = createHmac('sha256', clientSecret).update(`${timestamp}.${input.rawBody}`).digest('hex');
  const receivedBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) {
    return { valid: false, reason: 'firma invalida' };
  }

  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const now = input.now ?? Date.now();
  const driftSeconds = Math.abs(now / 1000 - Number(timestamp));
  if (!Number.isFinite(driftSeconds) || driftSeconds > tolerance) {
    return { valid: false, reason: 'timestamp fuera de tolerancia (posible repeticion)' };
  }

  return { valid: true };
}
