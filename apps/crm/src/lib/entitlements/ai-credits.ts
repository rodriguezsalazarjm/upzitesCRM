import { prisma } from '../prisma';
import type { Db } from '../domain/audit';
import { checkAllowance, currentPeriod, recordUsage } from '../billing/usage';
import { creditsFor, weightedTokens } from './credits';

export { creditsFor, weightedTokens };
import { getWorkspaceEntitlements } from './index';

/**
 * Creditos de IA (P0-C).
 *
 *   weightedTokens = input + output * 4
 *   credits        = ceil(weightedTokens * mult(proveedor) * mult(modelo) / 1000)
 *
 * Los factores viven en `AI_CREDITS` (config.ts), no repartidos por el codigo
 * (ver credits.ts). El contador se guarda en `UsageCounter` con metric
 * `ai_credits` y cantidad en CREDITOS enteros; la ventana es el mes calendario
 * (`YYYY-MM`), asi que un mes nuevo empieza en cero sin borrar nada.
 */

export const AI_CREDITS_METRIC = 'ai_credits';

export type AiCreditCheck = {
  allowed: boolean;
  reason: 'OK' | 'SUSPENDED' | 'NOT_CONSUMING' | 'NO_AI_IN_PLAN' | 'CREDITS_EXHAUSTED';
  limitCredits: number;
  usedCredits: number;
  remainingCredits: number;
  /** LEGACY usa su presupuesto `ai_cost_clp`; CATALOG usa creditos. */
  source: 'CATALOG' | 'LEGACY' | 'SUSPENDED';
};

/**
 * ¿Puede el workspace gastar IA ahora? Se llama ANTES de cada inferencia. El
 * limite mensual bloquea el consumo adicional: con el cupo agotado no se
 * inicia otra ejecucion (una ejecucion en curso puede cerrar algo por encima).
 */
export async function checkAiCredits(workspaceId: string, options: { now?: Date } = {}): Promise<AiCreditCheck> {
  const now = options.now ?? new Date();
  const ent = await getWorkspaceEntitlements(workspaceId, prisma, now);
  const limitCredits = ent.limit('ai.monthlyCredits');
  const base = { limitCredits, usedCredits: 0, remainingCredits: 0 };

  if (ent.state === 'SUSPENDED') return { ...base, allowed: false, reason: 'SUSPENDED', source: 'SUSPENDED' };
  if (!ent.canConsume) return { ...base, allowed: false, reason: 'NOT_CONSUMING', source: ent.source };

  if (ent.source === 'LEGACY') {
    // Hasta su clasificacion, un plan legacy conserva su presupuesto en pesos.
    const budget = await checkAllowance({ workspaceId, metric: 'ai_cost_clp', amount: 0, period: currentPeriod(now) });
    return {
      allowed: ent.can('ai') && budget.allowed,
      reason: !ent.can('ai') ? 'NO_AI_IN_PLAN' : budget.allowed ? 'OK' : 'CREDITS_EXHAUSTED',
      limitCredits,
      usedCredits: 0,
      remainingCredits: 0,
      source: 'LEGACY',
    };
  }

  if (!ent.can('ai') || limitCredits <= 0) return { ...base, allowed: false, reason: 'NO_AI_IN_PLAN', source: ent.source };

  const usedCredits = await ent.usage('ai.credits');
  const remainingCredits = Math.max(0, limitCredits - usedCredits);
  return {
    allowed: usedCredits < limitCredits,
    reason: usedCredits < limitCredits ? 'OK' : 'CREDITS_EXHAUSTED',
    limitCredits,
    usedCredits,
    remainingCredits,
    source: ent.source,
  };
}

/** Registra el consumo de una inferencia en creditos (detalle + contador). */
export async function recordAiCredits(
  input: {
    workspaceId: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    referenceType?: string | null;
    referenceId?: string | null;
    occurredAt?: Date;
  },
  db: Db = prisma,
) {
  const weighted = weightedTokens(input);
  const credits = creditsFor(input);
  await recordUsage(
    {
      workspaceId: input.workspaceId,
      provider: input.provider,
      metric: AI_CREDITS_METRIC,
      // Creditos enteros, ya redondeados hacia arriba por inferencia.
      quantity: credits,
      // El costo en pesos ya lo lleva el registro `ai_cost_clp`: aqui 0 para
      // no contarlo dos veces en el total del periodo.
      costClp: 0,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      occurredAt: input.occurredAt,
    },
    db,
  );
  return { weighted, credits };
}
