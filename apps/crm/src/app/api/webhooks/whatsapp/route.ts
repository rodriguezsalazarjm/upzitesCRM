import { NextResponse } from 'next/server';
import { JobType } from '../../../../../generated/prisma/client';
import { enqueue } from '@/lib/jobs/queue';
import { ingestWebhookEvent } from '@/lib/whatsapp/inbound';
import { resolveVerification, verifyMetaSignature } from '@/lib/whatsapp/signature';
import { enforce } from '@/lib/ops/rate-limit';

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
  // Fase 10: Limite alto: un proveedor legitimo manda rafagas y cortarle el webhook
  // a Meta pierde mensajes. Esto frena el abuso evidente, no a Meta.
  const limited = await enforce('webhook', request);
  if (limited) return limited;

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

  // El evento ya esta a salvo en la base. El procesamiento va a la cola: el
  // webhook responde 200 sin esperar a que corran las automatizaciones.
  await enqueue({
    type: JobType.PROCESS_WEBHOOK_EVENT,
    payload: { eventId: ingest.eventId },
    dedupeKey: `webhook-event:${ingest.eventId}`,
    priority: 10,
  });

  return NextResponse.json({ ok: true, events: ingest.events, queued: true });
}
