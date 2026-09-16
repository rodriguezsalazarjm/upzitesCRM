import { NextResponse } from 'next/server';
import { ingestTikTokWebhook } from '@/lib/tiktok/inbound';
import { verifyTikTokSignature } from '@/lib/tiktok/signature';
import { enforce } from '@/lib/ops/rate-limit';

/**
 * Webhook publico de TikTok Business Messaging. La firma SI sigue el esquema
 * documentado (TikTok-Signature); el resto del contrato (forma exacta del
 * cuerpo) queda pendiente de confirmar con una app real aprobada — ver
 * informe: "ACCION MANUAL TIKTOK REQUERIDA". No hay handshake GET: TikTok no
 * usa el protocolo hub.challenge de Meta.
 */
export async function POST(request: Request) {
  const limited = await enforce('webhook', request);
  if (limited) return limited;

  const rawBody = await request.text();
  const verification = verifyTikTokSignature({ rawBody, signatureHeader: request.headers.get('tiktok-signature') });
  if (!verification.valid) {
    console.warn('tiktok_webhook_invalid_signature', { reason: verification.reason });
    return NextResponse.json({ message: 'Firma invalida' }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, ignored: 'cuerpo no es JSON' });
  }

  const ingest = await ingestTikTokWebhook(parsed);
  return NextResponse.json({ ok: true, events: ingest.events });
}
