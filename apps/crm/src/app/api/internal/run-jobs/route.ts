import { NextResponse } from 'next/server';
import { isInternalRequest } from '@/lib/internal-auth';
import { runJobs } from '@/lib/jobs/runner';
import { queueStats } from '@/lib/jobs/queue';

export const dynamic = 'force-dynamic';
// La funcion tiene que poder correr un lote completo sin cortarse.
export const maxDuration = 60;

/**
 * Consumidor de la cola. Lo llama el cron (Vercel Cron o pg_cron + pg_net).
 * Protegido con INTERNAL_WORKER_SECRET: no es un endpoint publico.
 */
export async function POST(request: Request) {
  if (!isInternalRequest(request)) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get('limit') ?? 20);

  const result = await runJobs({
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 20,
    withRecurring: searchParams.get('recurring') !== 'false',
  });

  return NextResponse.json({ data: result, queue: await queueStats() });
}

/** Vercel Cron invoca con GET. Se delega para no duplicar logica. */
export async function GET(request: Request) {
  return POST(request);
}
