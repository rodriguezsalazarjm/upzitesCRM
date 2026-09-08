import { NextResponse } from 'next/server';
import { JobStatus, OutboxStatus, WebhookEventStatus } from '../../../../../generated/prisma/client';
import { isEncryptionConfigured } from '@/lib/crypto';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Salud del sistema. NO expone secretos ni datos personales (spec, seccion 16):
 * solo dice si cada pieza esta configurada, nunca con que valor.
 */
export async function GET() {
  const startedAt = Date.now();

  try {
    const [pending, processing, dead, oldest, failedOutbox, failedWebhooks] = await Promise.all([
      prisma.job.count({ where: { status: JobStatus.PENDING } }),
      prisma.job.count({ where: { status: JobStatus.PROCESSING } }),
      prisma.job.count({ where: { status: JobStatus.DEAD } }),
      prisma.job.findFirst({
        where: { status: JobStatus.PENDING, runAt: { lte: new Date() } },
        orderBy: { runAt: 'asc' },
        select: { runAt: true },
      }),
      prisma.outboxEvent.count({ where: { status: OutboxStatus.FAILED } }),
      prisma.webhookEvent.count({ where: { status: WebhookEventStatus.FAILED } }),
    ]);

    const oldestPendingAgeSeconds = oldest
      ? Math.round((Date.now() - oldest.runAt.getTime()) / 1000)
      : 0;

    // Una cola atascada es un problema aunque la base responda: si el trabajo
    // mas viejo lleva mas de 10 minutos esperando, el cron no esta corriendo.
    const queueStalled = oldestPendingAgeSeconds > 600;

    return NextResponse.json(
      {
        ok: !queueStalled,
        database: 'ok',
        latencyMs: Date.now() - startedAt,
        queue: { pending, processing, dead, oldestPendingAgeSeconds, stalled: queueStalled },
        outbox: { failed: failedOutbox },
        webhooks: { failed: failedWebhooks },
        config: {
          encryption: isEncryptionConfigured(),
          internalWorker: Boolean(process.env.INTERNAL_WORKER_SECRET),
          whatsapp: Boolean(process.env.META_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN),
          mercadoPago: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN && process.env.MERCADO_PAGO_WEBHOOK_SECRET),
        },
        checkedAt: new Date().toISOString(),
      },
      { status: queueStalled ? 503 : 200 },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        database: 'error',
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
