import {
  BillingInterval,
  BillingSource,
  PlanCode,
  SubscriptionStatus,
} from '../../../generated/prisma/enums';

/**
 * Ciclo de vida de la suscripcion (P0-B): la UNICA interpretacion del estado.
 *
 * La usan la UI, la API, los workers, el freno de consumo, el billing y los
 * entitlements. Es pura (sin base de datos) para probarla sin conexion; la
 * lectura vive en `subscription-access.ts` (`resolveSubscription`).
 *
 * El estado NO se guarda: se deriva de plan, medio de pago, periodo y
 * suspension. Asi no pueden convivir dos respuestas distintas a "esta al dia?".
 *
 *  - FREE:      plan FREE. No vence.
 *  - TRIAL:     prueba vigente del plan configurado.
 *  - ACTIVE:    pagado (MANUAL / MERCADO_PAGO) o COMP, dentro del periodo.
 *  - GRACE:     pagado y vencido hace menos de 7 dias. Conserva el plan.
 *  - SUSPENDED: suspension administrativa. No es un vencimiento: bloquea el
 *               acceso y el consumo, pero NO baja a FREE.
 *  - EXPIRED:   trial o COMP vencidos (sin gracia) o pagado tras la gracia.
 *               Funciona como FREE; no se borra nada y `configuredPlan` se
 *               conserva (para renovar el mismo plan).
 */
export const GRACE_PERIOD_DAYS = 7;

const DAY_MS = 1000 * 60 * 60 * 24;

export type SubscriptionState = 'FREE' | 'TRIAL' | 'ACTIVE' | 'GRACE' | 'SUSPENDED' | 'EXPIRED';

/** Plan cuyos terminos rigen hoy. 'LEGACY' = plan sin codigo (monthly, beta-*). */
export type EffectivePlan = PlanCode | 'LEGACY';

export type SubscriptionSnapshot = {
  state: SubscriptionState;
  /** Plan contratado. Se conserva aunque haya expirado. null = plan legacy o sin fila. */
  configuredPlan: PlanCode | null;
  /** Clave del plan legacy cuando `configuredPlan` es null. */
  legacyPlanKey: string | null;
  effectivePlan: EffectivePlan;
  billingSource: BillingSource;
  periodStart: Date | null;
  /** Fin del periodo pagado, del trial o del COMP. null = no vence. */
  periodEnd: Date | null;
  /** Solo para pagados vencidos (GRACE o EXPIRED tras gracia). */
  graceEndsAt: Date | null;
  /** Cuando hay que renovar (solo MANUAL / MERCADO_PAGO). */
  renewsAt: Date | null;
  price: { amountMinor: number; currency: string; interval: BillingInterval } | null;
  currency: string | null;
  /** Puede entrar a la aplicacion. Solo SUSPENDED lo niega. */
  hasAccess: boolean;
  /** Puede gastar recursos pagados (IA, mensajes, email). */
  canConsume: boolean;
  /** Alias de `periodEnd`, para la UI existente. */
  expiresAt: Date | null;
  /** Dias hasta el proximo corte (fin de periodo o de gracia). 0 si no aplica. */
  daysLeft: number;
};

export type SubscriptionRow = {
  status: SubscriptionStatus;
  billingSource: BillingSource;
  trialEndsAt: Date | null;
  renewsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  suspendedAt: Date | null;
  mpPaymentId: string | null;
  currency: string | null;
  amountMinor: number | null;
  createdAt?: Date | null;
  plan: { code: PlanCode | null; key: string };
  price?: { interval: BillingInterval } | null;
};

const PAID_SOURCES = new Set<BillingSource>([BillingSource.MANUAL, BillingSource.MERCADO_PAGO]);

export function isPaidSource(source: BillingSource) {
  return PAID_SOURCES.has(source);
}

function daysUntil(date: Date, now: Date) {
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / DAY_MS));
}

/**
 * Filas escritas por codigo anterior a P0-B quedan con `billingSource` FREE
 * (el default) aunque su plan no sea FREE. Se deduce el medio como en la
 * migracion; nunca se deduce el plan.
 */
function effectiveSource(row: SubscriptionRow): BillingSource {
  if (row.billingSource !== BillingSource.FREE || row.plan.code === PlanCode.FREE) return row.billingSource;
  if (row.mpPaymentId) return BillingSource.MERCADO_PAGO;
  if (row.status === SubscriptionStatus.TRIAL) return BillingSource.TRIAL;
  return BillingSource.MANUAL;
}

/** Workspace sin fila de suscripcion: funciona como FREE. */
export const NO_SUBSCRIPTION: SubscriptionSnapshot = {
  state: 'FREE',
  configuredPlan: null,
  legacyPlanKey: null,
  effectivePlan: PlanCode.FREE,
  billingSource: BillingSource.FREE,
  periodStart: null,
  periodEnd: null,
  graceEndsAt: null,
  renewsAt: null,
  price: null,
  currency: null,
  hasAccess: true,
  canConsume: false,
  expiresAt: null,
  daysLeft: 0,
};

export function resolveLifecycle(row: SubscriptionRow | null, now = new Date()): SubscriptionSnapshot {
  if (!row) return NO_SUBSCRIPTION;

  const source = effectiveSource(row);
  const configuredPlan = row.plan.code;
  const configured: EffectivePlan = configuredPlan ?? 'LEGACY';
  const periodStart = row.currentPeriodStart ?? row.createdAt ?? null;
  const periodEnd = row.currentPeriodEnd ?? row.renewsAt ?? row.trialEndsAt ?? null;
  const price =
    row.amountMinor !== null && row.currency
      ? { amountMinor: row.amountMinor, currency: row.currency, interval: row.price?.interval ?? BillingInterval.MONTH }
      : null;

  const base = {
    configuredPlan,
    legacyPlanKey: configuredPlan ? null : row.plan.key,
    billingSource: source,
    periodStart,
    periodEnd,
    price,
    currency: row.currency,
    expiresAt: periodEnd,
  };

  const snap = (
    state: SubscriptionState,
    effectivePlan: EffectivePlan,
    opts: { graceEndsAt?: Date | null; cutoff?: Date | null } = {},
  ): SubscriptionSnapshot => {
    const inForce = state === 'TRIAL' || state === 'ACTIVE' || state === 'GRACE';
    return {
      ...base,
      state,
      effectivePlan,
      graceEndsAt: opts.graceEndsAt ?? null,
      renewsAt: isPaidSource(source) && periodEnd ? periodEnd : null,
      hasAccess: state !== 'SUSPENDED',
      canConsume: inForce && effectivePlan !== PlanCode.FREE,
      daysLeft: inForce && opts.cutoff ? daysUntil(opts.cutoff, now) : 0,
    };
  };

  // Suspension administrativa: manda sobre todo y no baja el plan a FREE.
  if (row.suspendedAt) return snap('SUSPENDED', configured);

  if (configuredPlan === PlanCode.FREE) return snap('FREE', PlanCode.FREE);

  // Plan legacy cancelado: cerrado (como antes de P0-B).
  if (!configuredPlan && row.status === SubscriptionStatus.CANCELED) return snap('EXPIRED', PlanCode.FREE);

  if (source === BillingSource.TRIAL) {
    // Sin fecha de fin no hay prueba: un trial sin techo seria acceso pagado gratis.
    if (periodEnd && periodEnd > now) return snap('TRIAL', configured, { cutoff: periodEnd });
    return snap('EXPIRED', PlanCode.FREE);
  }

  if (source === BillingSource.COMP) {
    if (!periodEnd || periodEnd > now) return snap('ACTIVE', configured, { cutoff: periodEnd });
    return snap('EXPIRED', PlanCode.FREE);
  }

  if (isPaidSource(source)) {
    if (!periodEnd) return snap('EXPIRED', PlanCode.FREE);
    if (periodEnd > now) return snap('ACTIVE', configured, { cutoff: periodEnd });
    const graceEndsAt = new Date(periodEnd.getTime() + GRACE_PERIOD_DAYS * DAY_MS);
    if (graceEndsAt > now) return snap('GRACE', configured, { graceEndsAt, cutoff: graceEndsAt });
    return snap('EXPIRED', PlanCode.FREE, { graceEndsAt });
  }

  // BillingSource.FREE con un plan pagado ya se deduce arriba; cualquier otro
  // caso desconocido se cierra hacia FREE (nunca regala capacidades).
  return snap('EXPIRED', PlanCode.FREE);
}
