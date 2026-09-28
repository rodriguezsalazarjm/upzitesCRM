import { AgentVersionStatus, AutomationFlowStatus, ChannelAccountStatus, WhatsAppChannelStatus } from '../../../generated/prisma/enums';
import type { Prisma } from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { countActiveMembers } from '../membership';
import { planTerms } from '../billing/plans';
import { currentSubscription } from '../billing/subscription-access';
import { resolveLifecycle, type SubscriptionState } from '../billing/subscription-state';
import { currentPeriod } from '../billing/usage';
import {
  FEATURE_KEYS,
  FEATURE_LABEL,
  LIMIT_KEYS,
  LIMIT_LABEL,
  LIMIT_METRIC,
  type EntitlementValues,
  type FeatureKey,
  type LimitKey,
  type UsageMetric,
} from './config';
import {
  canWith,
  requiredPlanForFeature,
  requiredPlanForLimit,
  resolveEntitlementValues,
  type EntitlementSource,
} from './resolve';
import type { PlanCode } from '../../../generated/prisma/enums';

/**
 * API unica de entitlements (P0-C).
 *
 *   const ent = await getWorkspaceEntitlements(workspaceId);
 *   ent.can('commerce.orders');           // funcion incluida
 *   ent.limit('contacts.max');            // numero del plan
 *   await ent.usage('contacts');          // cuanto hay
 *   await ent.remaining('contacts.max');  // cuanto cabe
 *
 * El consumidor NUNCA pregunta por el nombre del plan. La seguridad real esta
 * en el servidor: `assertFeature` / `assertCanGrow` en cada endpoint y motor.
 */

/** Cliente o transaccion: los gates corren tambien dentro del lock (lock.ts). */
export type Db = Prisma.TransactionClient;

export type EntitlementErrorCode = 'PLAN_FEATURE' | 'PLAN_LIMIT' | 'WORKSPACE_SUSPENDED';

export class EntitlementError extends Error {
  constructor(
    readonly code: EntitlementErrorCode,
    message: string,
    readonly details: {
      key: FeatureKey | LimitKey;
      limit?: number;
      usage?: number;
      requiredPlan?: PlanCode | null;
    },
  ) {
    super(message);
    this.name = 'EntitlementError';
  }
}

/** Uso vivo de una metrica. Las existencias se cuentan; lo mensual se lee del contador. */
export async function usageFor(workspaceId: string, metric: UsageMetric, db: Db = prisma, now = new Date()): Promise<number> {
  switch (metric) {
    case 'users':
      return countActiveMembers(workspaceId, db);
    case 'contacts':
      return db.contact.count({ where: { workspaceId } });
    case 'channels': {
      // Agnostico de proveedor: WhatsApp + Instagram + Messenger + TikTok.
      // Cuenta lo conectado (tenga o no planLimitedAt): el limite frena el
      // crecimiento, no redefine lo que existe.
      const [whatsapp, accounts] = await Promise.all([
        db.whatsAppChannel.count({ where: { workspaceId, status: { not: WhatsAppChannelStatus.DISCONNECTED } } }),
        db.channelAccount.count({ where: { workspaceId, status: { not: ChannelAccountStatus.DISCONNECTED } } }),
      ]);
      return whatsapp + accounts;
    }
    case 'automations.active': {
      // Flujos publicados + reglas activas a medida. Las reglas de sistema
      // (presetKey) son internas y acotadas: no cuentan.
      const [flows, rules] = await Promise.all([
        db.automationFlow.count({ where: { workspaceId, status: AutomationFlowStatus.PUBLISHED } }),
        db.automationRule.count({ where: { workspaceId, isActive: true, presetKey: null } }),
      ]);
      return flows + rules;
    }
    case 'agents':
      return db.agentDefinition.count({
        where: { workspaceId, isActive: true, versions: { some: { status: AgentVersionStatus.PUBLISHED } } },
      });
    case 'ai.credits': {
      const counter = await db.usageCounter.findUnique({
        where: { workspaceId_period_metric: { workspaceId, period: currentPeriod(now), metric: 'ai_credits' } },
        select: { quantity: true },
      });
      return counter?.quantity ?? 0;
    }
    case 'conversations':
    case 'emails':
    case 'campaignContacts': {
      const legacyMetric = metric === 'campaignContacts' ? 'campaign_contacts' : metric;
      const counter = await db.usageCounter.findUnique({
        where: { workspaceId_period_metric: { workspaceId, period: currentPeriod(now), metric: legacyMetric } },
        select: { quantity: true },
      });
      return counter?.quantity ?? 0;
    }
  }
}

export type WorkspaceEntitlements = {
  workspaceId: string;
  state: SubscriptionState;
  source: EntitlementSource;
  /** Plan cuyos valores rigen (para mostrar), no para decidir. */
  planCode: PlanCode | null;
  canConsume: boolean;
  values: EntitlementValues;
  can(key: FeatureKey): boolean;
  limit(key: LimitKey): number;
  usage(key: UsageMetric | LimitKey): Promise<number>;
  remaining(key: LimitKey): Promise<number>;
};

function metricOf(key: UsageMetric | LimitKey): UsageMetric {
  return (LIMIT_KEYS as readonly string[]).includes(key) ? LIMIT_METRIC[key as LimitKey] : (key as UsageMetric);
}

export async function getWorkspaceEntitlements(workspaceId: string, db: Db = prisma, now = new Date()): Promise<WorkspaceEntitlements> {
  const row = await currentSubscription(workspaceId, db);
  const subscription = resolveLifecycle(row, now);
  const resolved = resolveEntitlementValues(
    subscription,
    subscription.effectivePlan === 'LEGACY' && row ? planTerms(row.plan) : null,
  );
  const values = resolved.values;
  return {
    workspaceId,
    state: subscription.state,
    source: resolved.source,
    planCode: resolved.planCode,
    canConsume: subscription.canConsume,
    values,
    can: (key) => canWith(values, key),
    limit: (key) => values.limits[key],
    usage: (key) => usageFor(workspaceId, metricOf(key), db, now),
    remaining: async (key) => Math.max(0, values.limits[key] - (await usageFor(workspaceId, LIMIT_METRIC[key], db, now))),
  };
}

function planLabel(code: PlanCode | null) {
  return code ? code.charAt(0) + code.slice(1).toLowerCase() : null;
}

function suspended(key: FeatureKey | LimitKey) {
  return new EntitlementError('WORKSPACE_SUSPENDED', 'El workspace esta suspendido: no se pueden hacer cambios.', { key });
}

/** Lanza si el plan no incluye la funcion. */
export async function assertFeature(workspaceId: string, key: FeatureKey, db: Db = prisma) {
  const ent = await getWorkspaceEntitlements(workspaceId, db);
  if (ent.state === 'SUSPENDED') throw suspended(key);
  if (!ent.can(key)) {
    const requiredPlan = requiredPlanForFeature(key);
    throw new EntitlementError(
      'PLAN_FEATURE',
      `${FEATURE_LABEL[key]} no está incluido en tu plan.${requiredPlan ? ` Disponible en ${planLabel(requiredPlan)}.` : ''}`,
      { key, requiredPlan },
    );
  }
  return ent;
}

/**
 * Lanza si sumar `amount` supera el limite. Para acciones que AUMENTAN el uso
 * (crear, importar, conectar, publicar, activar). Ver, editar y borrar no
 * pasan por aqui: sobre el limite los datos siguen accesibles (D3).
 */
export async function assertCanGrow(
  workspaceId: string,
  key: LimitKey,
  amount = 1,
  db: Db = prisma,
) {
  const ent = await getWorkspaceEntitlements(workspaceId, db);
  if (ent.state === 'SUSPENDED') throw suspended(key);
  const limit = ent.limit(key);
  const usage = await ent.usage(key);
  if (usage + amount > limit) {
    const requiredPlan = requiredPlanForLimit(key, usage + amount);
    throw new EntitlementError(
      'PLAN_LIMIT',
      `${LIMIT_LABEL[key]}: tu plan incluye ${limit} y ya tienes ${usage}.${requiredPlan ? ` Disponible en ${planLabel(requiredPlan)}.` : ''}`,
      { key, limit, usage, requiredPlan },
    );
  }
  return ent;
}

/**
 * Lanza si el plan no cubre alguno de los requisitos (ver requirements.ts).
 * Es lo que se valida al PUBLICAR/ACTIVAR una automatizacion, journey o regla.
 */
export async function assertRequirements(
  workspaceId: string,
  requirements: { feature: FeatureKey; where: string }[],
  what: string,
  db: Db = prisma,
) {
  const ent = await getWorkspaceEntitlements(workspaceId, db);
  if (ent.state === 'SUSPENDED') throw suspended(requirements[0]?.feature ?? 'automations.active.max');
  const seen = new Set<FeatureKey>();
  const missing = requirements.filter((req) => {
    if (seen.has(req.feature) || ent.can(req.feature)) return false;
    seen.add(req.feature);
    return true;
  });
  if (missing.length > 0) {
    const requiredPlan = requiredPlanForFeature(missing[0].feature);
    throw new EntitlementError(
      'PLAN_FEATURE',
      `Tu plan no permite ${what}: usa ${missing.map((m) => FEATURE_LABEL[m.feature]).join(', ')}.${requiredPlan ? ` Disponible en ${planLabel(requiredPlan)}.` : ''}`,
      { key: missing[0].feature, requiredPlan },
    );
  }
  return ent;
}

export function isEntitlementError(error: unknown): error is EntitlementError {
  return error instanceof EntitlementError;
}

// --- Snapshot serializable para la interfaz ----------------------------------

export type EntitlementSnapshot = {
  state: SubscriptionState;
  source: EntitlementSource;
  planCode: PlanCode | null;
  features: Record<FeatureKey, { allowed: boolean; requiredPlan: PlanCode | null }>;
  limits: Record<LimitKey, number>;
};

export async function entitlementSnapshot(workspaceId: string): Promise<EntitlementSnapshot> {
  const ent = await getWorkspaceEntitlements(workspaceId);
  return {
    state: ent.state,
    source: ent.source,
    planCode: ent.planCode,
    features: Object.fromEntries(
      FEATURE_KEYS.map((key) => [key, { allowed: ent.can(key), requiredPlan: requiredPlanForFeature(key) }]),
    ) as EntitlementSnapshot['features'],
    limits: { ...ent.values.limits },
  };
}

export { FEATURE_LABEL, LIMIT_LABEL };
export type { FeatureKey, LimitKey, UsageMetric };
