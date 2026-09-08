import { NextResponse } from 'next/server';
import { ingestWebhookEvent, processWebhookEvent } from '@/lib/whatsapp/inbound';
import { resolveVerification, verifyMetaSignature } from '@/lib/whatsapp/signature';

/**
 * Webhook publico de WhatsApp Cloud API.
 *
 * El GET es el handshake de verificacion de Meta. El POST hace lo minimo:
 * valida la firma, persiste el evento de forma idempotente y responde 200
 * rapido. No llama a OpenAI ni ejecuta secuencias largas: eso corre despues.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const verification = resolveVerification(searchParams);

  if (!verification.ok) {
    console.warn('whatsapp_webhook_verification_failed', { reason: verification.reason });
    return new NextResponse('Forbidden', { status: 403 });
  }

  // Meta espera el challenge crudo, no JSON.
  return new NextResponse(verification.challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

export async function POST(request: Request) {
  // La firma se calcula sobre el cuerpo CRUDO: parsear antes de verificar
  // cambiaria los bytes y la firma nunca coincidiria.
  const rawBody = await request.text();

  const verification = verifyMetaSignature({
    rawBody,
    signatureHeader: request.headers.get('x-hub-signature-256'),
  });

  if (!verification.valid) {
    console.warn('whatsapp_webhook_invalid_signature', { reason: verification.reason });
    return NextResponse.json({ message: 'Firma invalida' }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    // Se responde 200 igual: reintentar un cuerpo ilegible no lo va a arreglar.
    return NextResponse.json({ ok: true, ignored: 'cuerpo no es JSON' });
  }

  const ingest = await ingestWebhookEvent(rawBody, parsed);

  if (ingest.duplicate) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // Procesamiento en linea de forma provisional: la Fase 3 lo mueve a la cola
  // durable. El resultado no condiciona la respuesta — el evento ya esta a
  // salvo en la base y puede reprocesarse.
  try {
    await processWebhookEvent(ingest.eventId);
  } catch (error) {
    console.error('whatsapp_webhook_processing_failed', {
      eventId: ingest.eventId,
      error: error instanceof Error ? error.message : error,
    });
  }

  return NextResponse.json({ ok: true, events: ingest.events });
}
