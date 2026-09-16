/**
 * Handshake GET generico de un webhook de Meta (WhatsApp/Instagram/Messenger
 * comparten el mismo protocolo: hub.mode + hub.verify_token + hub.challenge).
 *
 * src/lib/whatsapp/signature.ts ya tiene su propia `resolveVerification` atada
 * a WHATSAPP_VERIFY_TOKEN especificamente — no se toca ese archivo (codigo ya
 * probado). Esta version generica acepta el token esperado como parametro,
 * para que cada producto (Instagram, Messenger) use su propia variable de
 * entorno sin duplicar la logica de comparacion.
 */
export function resolveMetaWebhookHandshake(searchParams: URLSearchParams, expectedToken: string | undefined) {
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (!expectedToken) return { ok: false as const, reason: 'verify token no configurado' };
  if (mode !== 'subscribe') return { ok: false as const, reason: 'hub.mode invalido' };
  if (token !== expectedToken) return { ok: false as const, reason: 'hub.verify_token invalido' };
  if (!challenge) return { ok: false as const, reason: 'falta hub.challenge' };

  return { ok: true as const, challenge };
}
