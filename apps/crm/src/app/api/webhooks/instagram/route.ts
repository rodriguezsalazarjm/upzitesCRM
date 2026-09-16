import { NextResponse } from 'next/server';
import { ingestInstagramWebhook } from '@/lib/instagram/inbound';
import { verifyMetaSignature } from '@/lib/whatsapp/signature';
import { resolveMetaWebhookHandshake } from '@/lib/meta/webhook-handshake';
import { enforce } from '@/lib/ops/rate-limit';

/**
 * Webhook publico de Instagram (Graph API). Mismo protocolo que WhatsApp
 * (X-Hub-Signature-256 firmado con el App Secret de la MISMA app de Meta),
 * pero un token de verificacion propio: cada suscripcion de webhook dentro de
 * la app puede usar un token distinto.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const verification = resolveMetaWebhookHandshake(searchParams, process.env.INSTAGRAM_VERIFY_TOKEN);

  if (!verification.ok) {
    console.warn('instagram_webhook_verification_failed', { reason: verification.reason });
    return new NextResponse('Forbidden', { status: 403 });
  }
  return new NextResponse(verification.challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

export async function POST(request: Request) {
  const limited = await enforce('webhook', request);
  if (limited) return limited;

  const rawBody = await request.text();
  const verification = verifyMetaSignature({ rawBody, signatureHeader: request.headers.get('x-hub-signature-256') });
  if (!verification.valid) {
    console.warn('instagram_webhook_invalid_signature', { reason: verification.reason });
    return NextResponse.json({ message: 'Firma invalida' }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, ignored: 'cuerpo no es JSON' });
  }

  // La normalizacion ya persiste cada evento idempotentemente y encola su
  // propio procesamiento (ver ingestInstagramWebhook / channels/ingest.ts):
  // a diferencia de WhatsApp, un solo webhook puede traer eventos de VARIAS
  // cuentas de Instagram conectadas a la vez, cada una con su propio job.
  const ingest = await ingestInstagramWebhook(parsed);
  return NextResponse.json({ ok: true, events: ingest.events });
}
