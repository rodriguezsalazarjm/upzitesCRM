import { SubscriptionStatus } from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import type { Db } from '../domain/audit';
import {
  ALLOWANCE_KIND,
  ALLOWANCE_LABEL,
  planTerms,
  type AllowanceMetric,
  type PlanCapability,
  type PlanTerms,
} from './plans';

/**
 * Consumo y limites.
 *
 * El consumo se guarda dos veces a proposito: `UsageRecord` es el detalle
 * auditable (que run, que mensaje, cuanto costo) y `UsageCounter` es el total
 * del periodo. Comprobar un limite antes de cada inferencia o cada email tiene
 * que costar la lectura de UNA fila; sumar un mes de registros en cada envio
 * convertiria el control de consumo en el cuello de botella del producto.
 */

export function currentPeriod(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

export type RecordUsageInput = {
  workspaceId: string;
  provider: string;
  metric: string;
  quantity: number;
  costClp?: number;
  referenceType?: string | null;
  referenceId?: string | null;
  occurredAt?: Date;
};

/**
 * Registra consumo: detalle y contador, en una transaccion.
 *
 * Si se separaran, un fallo entre ambas escrituras dejaria un cliente que
 * consumio sin que el contador lo sepa —es decir, sin limite— o al reves.
 */
export async function recordUsage(input: RecordUsageInput, db: Db = prisma) {
  const occurredAt = input.occurredAt ?? new Date();
  const period = currentPeriod(occurredAt);
  const costClp = input.costClp ?? 0;

  const write = async (tx: Db) => {
    await tx.usageRecord.create({
      data: {
        workspaceId: input.workspaceId,
        provider: input.provider,
        metric: input.metric,
        quantity: input.quantity,
        costEstimate: costClp,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        occurredAt,
      },
    });

    await tx.usageCounter.upsert({
      where: {
        workspaceId_period_metric: {
          workspaceId: input.workspaceId,
          period,
          metric: input.metric,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        period,
        metric: input.metric,
        quantity: input.quantity,
        costClp,
      },
      update: {
        quantity: { increment: input.quantity },
        costClp: { increment: costClp },
      },
    });
  };

  // Si ya viene una transaccion, se reusa: anidar transacciones en Prisma
  // lanza, y varios llamadores (el runner del agente) ya vienen dentro de una.
  if (db === prisma) {
    await prisma.$transaction((tx) => write(tx));
  } else {
    await write(db);
  }

  return { period, metric: input.metric, quantity: input.quantity, costClp };
}

// --- Limites -----------------------------------------------------------------

export type WorkspaceEntitlements = {
  plan: PlanTerms;
  status: SubscriptionStatus;
  /** Un plan vencido conserva las capacidades pero no deja consumir mas. */
  active: boolean;
};

/**
 * Plan vigente del workspace.
 *
 * Devuelve null cuando no hay suscripcion: el llamador decide si eso bloquea.
 * Inventar un plan por defecto aqui seria regalar capacidades a quien no pago.
 */
export async function getEntitlements(
  workspaceId: string,
  db: Db = prisma,
): Promise<WorkspaceEntitlements | null> {
  const subscription = await db.workspaceSubscription.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    include: { plan: true },
  });

  if (!subscription) return null;

  const active =
    subscription.status === SubscriptionStatus.ACTIVE ||
    (subscription.status === SubscriptionStatus.TRIAL &&
      (!subscription.trialEndsAt || subscription.trialEndsAt > new Date()));

  return { plan: planTerms(subscription.plan), status: subscription.status, active };
}

export async function hasCapability(
  workspaceId: string,
  capability: PlanCapability,
  db: Db = prisma,
) {
  const entitlements = await getEntitlements(workspaceId, db);
  return entitlements?.plan.capabilities.includes(capability) ?? false;
}

export type AllowanceCheck = {
  metric: AllowanceMetric;
  label: string;
  limit: number;
  used: number;
  remaining: number;
  /** Hay cupo para lo que se quiere hacer. */
  allowed: boolean;
  /** Se paso del cupo pero el plan admite excedente. */
  overage: boolean;
  /**
   * No queda margen.
   *
   * Una existencia esta agotada solo si se PASO del tope: tener 1 numero de 1
   * permitido es el estado normal de quien compro uno. Un consumo del mes lo
   * esta al llegar al tope, porque ya no queda nada que gastar.
   *
   * Se calcula aqui y no en cada llamador para que los avisos y la interfaz no
   * puedan discrepar sobre que significa "agotado".
   */
  exhausted: boolean;
  percent: number;
};

/**
 * Cuanto lleva usado el workspace en una metrica.
 *
 * Las de tipo `stock` se cuentan en vivo —un contacto borrado libera cupo— y
 * las de tipo `flow` se leen del contador del periodo.
 */
export async function usedFor(
  workspaceId: string,
  metric: AllowanceMetric,
  period = currentPeriod(),
  db: Db = prisma,
): Promise<number> {
  if (ALLOWANCE_KIND[metric] === 'stock') {
    switch (metric) {
      case 'contacts':
        return db.contact.count({ where: { workspaceId } });
      case 'users':
        return db.user.count({ where: { workspaceId } });
      case 'whatsapp_numbers':
        return db.whatsAppChannel.count({ where: { workspaceId } });
      default:
        return 0;
    }
  }

  const counter = await db.usageCounter.findUnique({
    where: { workspaceId_period_metric: { workspaceId, period, metric } },
    select: { quantity: true, costClp: true },
  });

  if (!counter) return 0;
  // El costo de IA se mide en pesos, no en unidades.
  return metric === 'ai_cost_clp' ? counter.costClp : counter.quantity;
}

/**
 * Decide si cabe `amount` mas en una metrica.
 *
 * Sin suscripcion o con una vencida no cabe nada: quedarse sin plan no puede
 * significar consumo libre.
 */
export async function checkAllowance(
  input: {
    workspaceId: string;
    metric: AllowanceMetric;
    amount?: number;
    period?: string;
  },
  db: Db = prisma,
): Promise<AllowanceCheck> {
  const amount = input.amount ?? 1;
  const period = input.period ?? currentPeriod();
  const label = ALLOWANCE_LABEL[input.metric];

  const entitlements = await getEntitlements(input.workspaceId, db);

  if (!entitlements || !entitlements.active) {
    return {
      metric: input.metric,
      label,
      limit: 0,
      used: 0,
      remaining: 0,
      allowed: false,
      overage: false,
      exhausted: true,
      percent: 100,
    };
  }

  // Metrica no declarada = no permitida. La spec prohibe lo ilimitado, y un
  // cupo ausente es mas probable que sea un olvido que una concesion.
  const limit = entitlements.plan.allowances[input.metric] ?? 0;
  const used = await usedFor(input.workspaceId, input.metric, period, db);
  const remaining = Math.max(0, limit - used);
  const fits = used + amount <= limit;
  const overagePrice = entitlements.plan.overages[input.metric];

  return {
    metric: input.metric,
    label,
    limit,
    used,
    remaining,
    allowed: fits || (overagePrice !== undefined && limit > 0),
    overage: !fits && overagePrice !== undefined && limit > 0,
    exhausted: ALLOWANCE_KIND[input.metric] === 'stock' ? used > limit : used >= limit,
    percent: limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100)),
  };
}

/** Estado de todos los cupos. Es lo que alimenta la pagina de uso. */
export async function usageSummary(workspaceId: string, period = currentPeriod()) {
  const entitlements = await getEntitlements(workspaceId);
  if (!entitlements) return null;

  const metrics = Object.keys(entitlements.plan.allowances) as AllowanceMetric[];

  const checks = await Promise.all(
    metrics.map((metric) => checkAllowance({ workspaceId, metric, amount: 0, period })),
  );

  const counters = await prisma.usageCounter.findMany({
    where: { workspaceId, period },
    orderBy: { metric: 'asc' },
  });

  return {
    period,
    plan: entitlements.plan,
    status: entitlements.status,
    active: entitlements.active,
    allowances: checks,
    /** Costo estimado del periodo, sumando todo lo que tenga precio. */
    costClp: counters.reduce((sum, counter) => sum + counter.costClp, 0),
    counters: counters.map((counter) => ({
      metric: counter.metric,
      quantity: counter.quantity,
      costClp: counter.costClp,
    })),
  };
}
