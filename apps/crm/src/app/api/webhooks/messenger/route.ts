import { NextResponse } from 'next/server';
import { ingestMessengerWebhook } from '@/lib/messenger/inbound';
import { verifyMetaSignature } from '@/lib/whatsapp/signature';
import { resolveMetaWebhookHandshake } from '@/lib/meta/webhook-handshake';
import { enforce } from '@/lib/ops/rate-limit';

/**
 * Webhook publico de Messenger (Graph API). Misma app de Meta que WhatsApp/
 * Instagram (mismo App Secret para la firma), token de verificacion propio.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const verification = resolveMetaWebhookHandshake(searchParams, process.env.MESSENGER_VERIFY_TOKEN);

  if (!verification.ok) {
    console.warn('messenger_webhook_verification_failed', { reason: verification.reason });
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
    console.warn('messenger_webhook_invalid_signature', { reason: verification.reason });
    return NextResponse.json({ message: 'Firma invalida' }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, ignored: 'cuerpo no es JSON' });
  }

  const ingest = await ingestMessengerWebhook(parsed);
  return NextResponse.json({ ok: true, events: ingest.events });
}
