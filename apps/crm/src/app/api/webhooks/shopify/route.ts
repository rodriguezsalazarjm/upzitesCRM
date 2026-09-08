import { NextResponse } from 'next/server';
import { JobType } from '../../../../../generated/prisma/client';
import { enqueue } from '@/lib/jobs/queue';
import { getShopifyConfig, verifyWebhookHmac } from '@/lib/shopify/oauth';
import { ingestShopifyWebhook } from '@/lib/shopify/webhooks';

export const dynamic = 'force-dynamic';

/**
 * Webhook publico de Shopify.
 *
 * Mismo patron que el de Meta: valida la firma sobre el cuerpo crudo, persiste
 * de forma idempotente, encola y responde 200. No procesa nada en linea.
 */
export async function POST(request: Request) {
  const config = getShopifyConfig();
  if (!config) {
    // Sin secreto no se puede verificar nada. 200 para que Shopify no reintente
    // indefinidamente algo que no se va a arreglar solo.
    console.error('shopify_webhook_not_configured');
    return NextResponse.json({ ok: true, ignored: 'no configurado' });
  }

  // La firma va sobre los bytes exactos recibidos.
  const rawBody = await request.text();

  const signature = verifyWebhookHmac({
    rawBody,
    header: request.headers.get('x-shopify-hmac-sha256'),
    secret: config.apiSecret,
  });

  if (!signature.valid) {
    console.warn('shopify_webhook_invalid_hmac', { reason: signature.reason });
    return NextResponse.json({ message: 'Firma invalida' }, { status: 401 });
  }

  const topic = request.headers.get('x-shopify-topic') ?? '';
  const shop = (request.headers.get('x-shopify-shop-domain') ?? '').toLowerCase();

  if (!topic || !shop) {
    return NextResponse.json({ ok: true, ignored: 'faltan cabeceras' });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, ignored: 'cuerpo no es JSON' });
  }

  const ingest = await ingestShopifyWebhook({ topic, shop, payload });

  if (ingest.duplicate) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  await enqueue({
    type: JobType.PROCESS_SHOPIFY_EVENT,
    payload: { eventId: ingest.eventId },
    dedupeKey: `shopify-event:${ingest.eventId}`,
    priority: 10,
  });

  return NextResponse.json({ ok: true, queued: true });
}
