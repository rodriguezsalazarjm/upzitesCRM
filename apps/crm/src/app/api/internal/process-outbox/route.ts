import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { processOutbox } from '@/lib/whatsapp/outbound';

/**
 * Worker del outbox. NO es publico: requiere INTERNAL_WORKER_SECRET.
 *
 * Provisional hasta la Fase 3, que lo reemplaza por un consumidor de cola.
 */
function isAuthorized(request: Request) {
  const secret = process.env.INTERNAL_WORKER_SECRET;
  if (!secret) return false;

  const header = request.headers.get('x-internal-secret') ?? '';
  const a = Buffer.from(header);
  const b = Buffer.from(secret);

  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
  }

  const result = await processOutbox(50);
  return NextResponse.json({ data: result });
}
