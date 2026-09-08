import { randomUUID } from 'node:crypto';
import { JobStatus, JobType, type Prisma } from '../../../generated/prisma/client';
import { prisma } from '../prisma';

/**
 * Cola durable sobre Postgres.
 *
 * Se eligio una tabla propia en vez de pgmq (la primera preferencia de la spec)
 * por tres razones concretas:
 *
 *   1. El repositorio ya usa este patron dos veces (WebhookEvent, OutboxEvent);
 *      una tercera cola con la misma forma es coherente y no agrega conceptos.
 *   2. La pagina de Ops debe mostrar profundidad y antiguedad de cola POR
 *      workspace. Con pgmq los mensajes viven en otro schema como JSONB opaco y
 *      cruzarlos con datos del tenant exige SQL crudo.
 *   3. Prisma la tipa, las pruebas la consultan y la migracion viaja con el
 *      resto del esquema. No depende de una extension habilitada a mano.
 *
 * La garantia importante —un solo consumidor por trabajo— la da
 * `FOR UPDATE SKIP LOCKED`, no la extension.
 */

/** Espera creciente entre reintentos: 30 s, 2 min, 5 min, 15 min, 1 h. */
const BACKOFF_SECONDS = [30, 120, 300, 900, 3600];

export type EnqueueInput = {
  type: JobType;
  payload: Prisma.InputJsonValue;
  workspaceId?: string | null;
  runAt?: Date;
  priority?: number;
  maxAttempts?: number;
  /** Si se repite, no se encola un segundo trabajo. */
  dedupeKey?: string | null;
};

/**
 * Encola un trabajo. Con `dedupeKey`, encolar dos veces el mismo hecho deja un
 * solo trabajo: es la primera linea de defensa contra el doble disparo.
 */
export async function enqueue(input: EnqueueInput) {
  const data = {
    type: input.type,
    payload: input.payload,
    workspaceId: input.workspaceId ?? null,
    runAt: input.runAt ?? new Date(),
    priority: input.priority ?? 100,
    maxAttempts: input.maxAttempts ?? 5,
    dedupeKey: input.dedupeKey ?? null,
  };

  if (!data.dedupeKey) return prisma.job.create({ data });

  const existing = await prisma.job.findUnique({
    where: { dedupeKey: data.dedupeKey },
    select: { id: true, status: true },
  });

  if (existing) return existing;

  try {
    return await prisma.job.create({ data });
  } catch {
    // Carrera: otro proceso lo encolo entre el findUnique y el create.
    const raced = await prisma.job.findUnique({
      where: { dedupeKey: data.dedupeKey },
      select: { id: true, status: true },
    });
    if (raced) return raced;
    throw new Error('No se pudo encolar el trabajo.');
  }
}

export type ClaimedJob = {
  id: string;
  type: JobType;
  payload: unknown;
  workspaceId: string | null;
  attempts: number;
  maxAttempts: number;
};

/**
 * Toma hasta `limit` trabajos vencidos y los marca PROCESSING de forma atomica.
 *
 * `SKIP LOCKED` hace que dos workers concurrentes tomen conjuntos distintos en
 * vez de bloquearse o pisarse. Es la pieza que permite escalar a varios
 * consumidores sin coordinacion externa.
 */
export async function claimJobs(limit = 10, workerId = randomUUID()): Promise<ClaimedJob[]> {
  const rows = await prisma.$queryRaw<
    { id: string; type: JobType; payload: unknown; workspace_id: string | null; attempts: number; max_attempts: number }[]
  >`
    WITH claimed AS (
      SELECT id FROM jobs
      WHERE status = 'PENDING' AND run_at <= now()
      ORDER BY priority ASC, run_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE jobs j
       SET status = 'PROCESSING',
           attempts = j.attempts + 1,
           locked_at = now(),
           locked_by = ${workerId},
           updated_at = now()
      FROM claimed
     WHERE j.id = claimed.id
    RETURNING j.id, j.type, j.payload, j.workspace_id, j.attempts, j.max_attempts;
  `;

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    payload: row.payload,
    workspaceId: row.workspace_id,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
  }));
}

export async function completeJob(jobId: string) {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: JobStatus.DONE, processedAt: new Date(), lastError: null, lockedBy: null },
  });
}

/**
 * Marca el fallo de un trabajo.
 *
 * Reintenta con espera creciente mientras queden intentos; al agotarlos pasa a
 * DEAD, que es un estado terminal visible en Ops. No se reintenta para siempre:
 * un trabajo que falla cinco veces no se arregla a la sexta.
 */
export async function failJob(job: ClaimedJob, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const exhausted = job.attempts >= job.maxAttempts;

  if (exhausted) {
    await prisma.job.update({
      where: { id: job.id },
      data: { status: JobStatus.DEAD, lastError: message, processedAt: new Date(), lockedBy: null },
    });
    return { dead: true, message };
  }

  const delay = BACKOFF_SECONDS[Math.min(job.attempts - 1, BACKOFF_SECONDS.length - 1)];

  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: JobStatus.PENDING,
      runAt: new Date(Date.now() + delay * 1000),
      lastError: message,
      lockedBy: null,
    },
  });

  return { dead: false, message, retryInSeconds: delay };
}

/**
 * Devuelve a PENDING los trabajos que quedaron PROCESSING demasiado tiempo.
 *
 * Cubre el caso de un worker que muere a mitad de camino: sin esto el trabajo
 * quedaria bloqueado para siempre.
 */
export async function requeueStaleJobs(olderThanMinutes = 10) {
  const threshold = new Date(Date.now() - olderThanMinutes * 60_000);

  const result = await prisma.job.updateMany({
    where: { status: JobStatus.PROCESSING, lockedAt: { lt: threshold } },
    data: { status: JobStatus.PENDING, lockedBy: null, lastError: 'Reencolado: el worker no respondio.' },
  });

  return result.count;
}

/** Metricas para el endpoint de salud y la pagina de Ops. */
export async function queueStats() {
  const [pending, processing, dead, oldest] = await Promise.all([
    prisma.job.count({ where: { status: JobStatus.PENDING } }),
    prisma.job.count({ where: { status: JobStatus.PROCESSING } }),
    prisma.job.count({ where: { status: JobStatus.DEAD } }),
    prisma.job.findFirst({
      where: { status: JobStatus.PENDING, runAt: { lte: new Date() } },
      orderBy: { runAt: 'asc' },
      select: { runAt: true },
    }),
  ]);

  return {
    pending,
    processing,
    dead,
    oldestPendingAgeSeconds: oldest ? Math.round((Date.now() - oldest.runAt.getTime()) / 1000) : 0,
  };
}
