import { claimJobs, completeJob, failJob, requeueStaleJobs, type ClaimedJob } from './queue';
import { enqueueRecurringJobs, handlerFor } from './handlers';

/**
 * Consumidor de la cola. Lo invoca el cron; tambien puede llamarse a mano desde
 * Ops. Procesa un lote acotado y devuelve el resultado para poder observarlo.
 */
export type RunResult = {
  claimed: number;
  done: number;
  retried: number;
  dead: number;
  requeuedStale: number;
  byType: Record<string, number>;
  errors: { jobId: string; type: string; error: string }[];
};

export type RunOptions = {
  limit?: number;
  /** Encola los trabajos recurrentes antes de procesar. Lo usa el cron. */
  withRecurring?: boolean;
  /** Corta el lote si se acerca el limite de tiempo de la funcion serverless. */
  budgetMs?: number;
};

export async function runJobs(options: RunOptions = {}): Promise<RunResult> {
  const limit = options.limit ?? 20;
  const budgetMs = options.budgetMs ?? 25_000;
  const startedAt = Date.now();

  const result: RunResult = {
    claimed: 0,
    done: 0,
    retried: 0,
    dead: 0,
    requeuedStale: 0,
    byType: {},
    errors: [],
  };

  // Rescata primero lo que quedo bloqueado por un worker caido.
  result.requeuedStale = await requeueStaleJobs();

  if (options.withRecurring) await enqueueRecurringJobs();

  const jobs = await claimJobs(limit);
  result.claimed = jobs.length;

  for (const job of jobs) {
    if (Date.now() - startedAt > budgetMs) {
      // Se acabo el presupuesto: los que quedan siguen PROCESSING y el
      // rescate de trabajos vencidos los devolvera a PENDING.
      break;
    }

    await runSingleJob(job, result);
  }

  return result;
}

async function runSingleJob(job: ClaimedJob, result: RunResult) {
  result.byType[job.type] = (result.byType[job.type] ?? 0) + 1;

  try {
    const handler = handlerFor(job.type);
    await handler((job.payload ?? {}) as Record<string, unknown>, job.workspaceId);
    await completeJob(job.id);
    result.done += 1;
  } catch (error) {
    const outcome = await failJob(job, error);
    if (outcome.dead) {
      result.dead += 1;
    } else {
      result.retried += 1;
    }
    result.errors.push({ jobId: job.id, type: job.type, error: outcome.message });
  }
}
