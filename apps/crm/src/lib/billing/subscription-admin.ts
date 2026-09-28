import {
  BillingInterval,
  BillingSource,
  PlanCode,
  SubscriptionStatus,
} from '../../../generated/prisma/enums';
import type { Prisma } from '../../../generated/prisma/client';
import { recordAudit } from '../domain/audit';
import { prisma } from '../prisma';
import { ensurePlanCatalog } from './plan-catalog';
import { addInterval, getCurrentPrice } from './price-book';
import { reconcileSafely } from '../entitlements/reconcile';
import { resolveSubscription } from './subscription-access';
import { GRACE_PERIOD_DAYS } from './subscription-state';

/**
 * Operaciones server-side sobre la suscripcion SaaS (P0-B). Son las unicas que
 * la modifican: el CLI administrativo, el webhook de Mercado Pago y (en P0-D)
 * Platform Admin llaman a estas funciones, nunca escriben la fila a mano.
 *
 * Reglas:
 *  - Una fila por workspace (upsert por workspaceId). El historial financiero
 *    va a SubscriptionPayment y el de cambios a AuditLog (+ PlatformAuditLog
 *    cuando actua la plataforma).
 *  - Plan y medio de pago son independientes: PRO + MANUAL, SCALE + COMP...
 *  - Los importes salen del Price Book salvo que se pacte otro (manual).
 *  - Nada de esto toca Payment ni CustomerOrder (commerce del workspace).
 */

const DAY_MS = 1000 * 60 * 60 * 24;

export type AdminActor = {
  /** Usuario que ejecuta (null para CLI/sistema). */
  actorId?: string | null;
  /** Origen de la operacion, queda en la auditoria. */
  via?: 'cli' | 'platform' | 'webhook' | 'system';
  reason?: string | null;
};

type Tx = Prisma.TransactionClient;

export class SubscriptionAdminError extends Error {
  constructor(
    readonly code:
      | 'NO_SUBSCRIPTION'
      | 'NO_PRICE'
      | 'FREE_NOT_PAYABLE'
      | 'INVALID_PERIOD'
      | 'NOT_SUSPENDED'
      | 'REASON_REQUIRED'
      | 'IDEMPOTENCY_CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'SubscriptionAdminError';
  }
}

async function planIdFor(code: PlanCode) {
  const plans = await ensurePlanCatalog();
  return plans[code].id;
}

async function priceSnapshot(
  planCode: PlanCode,
  currency: string,
  interval: BillingInterval = BillingInterval.MONTH,
) {
  const price = await getCurrentPrice({ planCode, currency, interval });
  if (!price)
    throw new SubscriptionAdminError(
      'NO_PRICE',
      `No hay precio vigente para ${planCode} en ${currency}.`,
    );
  return price;
}

/** Campos legacy que se siguen escribiendo para codigo que aun los lea. */
function legacyColumns(source: BillingSource, periodEnd: Date | null) {
  return {
    status: source === BillingSource.TRIAL ? SubscriptionStatus.TRIAL : SubscriptionStatus.ACTIVE,
    trialEndsAt: source === BillingSource.TRIAL ? periodEnd : null,
    renewsAt:
      source === BillingSource.MANUAL || source === BillingSource.MERCADO_PAGO ? periodEnd : null,
  };
}

async function audit(
  tx: Tx,
  workspaceId: string,
  action: string,
  actor: AdminActor,
  metadata: Record<string, unknown>,
) {
  const meta = {
    ...metadata,
    via: actor.via ?? 'system',
    reason: actor.reason ?? null,
  } as Prisma.InputJsonObject;
  await recordAudit(
    {
      workspaceId,
      actorId: actor.actorId ?? null,
      action,
      entity: 'WorkspaceSubscription',
      entityId: workspaceId,
      metadata: meta,
    },
    tx,
  );
  if (actor.via !== 'webhook') {
    await tx.platformAuditLog.create({
      data: {
        actorUserId: actor.actorId ?? null,
        action,
        targetWorkspaceId: workspaceId,
        metadata: meta,
      },
    });
  }
}

type SubscriptionWrite = {
  planId: string;
  billingSource: BillingSource;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  priceId?: string | null;
  currency?: string | null;
  amountMinor?: number | null;
  notes?: string | null;
  mpPaymentId?: string | null;
};

async function writeSubscription(
  tx: Tx,
  workspaceId: string,
  data: SubscriptionWrite,
  actor: AdminActor,
) {
  const values = {
    ...data,
    ...legacyColumns(data.billingSource, data.currentPeriodEnd),
    updatedById: actor.actorId ?? null,
  };
  return tx.workspaceSubscription.upsert({
    where: { workspaceId },
    create: { workspaceId, ...values },
    update: values,
  });
}

/**
 * Inicio del siguiente periodo: si se paga antes de terminar la gracia, el
 * periodo nuevo empieza donde termino el anterior (continuidad); si no, desde
 * la fecha de pago.
 */
function nextPeriodStart(currentEnd: Date | null, paidAt: Date) {
  if (currentEnd && paidAt.getTime() < currentEnd.getTime() + GRACE_PERIOD_DAYS * DAY_MS)
    return currentEnd;
  return paidAt;
}

/**
 * Idempotencia de operaciones de billing SaaS: la clave es unica en todo el
 * libro (`subscription_payments.idempotency_key`). Si ya existe, la operacion
 * no se repite (ni el pago ni la extension del periodo). La referencia
 * bancaria NO sirve para esto: dos transferencias pueden compartirla y un
 * doble click no la cambia.
 *
 * Una clave usada por OTRO workspace es un error de quien llama, no un replay.
 */
async function paymentForKey(workspaceId: string, key: string | null | undefined) {
  if (!key) return null;
  const found = await prisma.subscriptionPayment.findUnique({
    where: { idempotencyKey: key },
    select: { id: true, workspaceId: true },
  });
  if (found && found.workspaceId !== workspaceId) {
    throw new SubscriptionAdminError(
      'IDEMPOTENCY_CONFLICT',
      'La clave de idempotencia ya se uso en otro workspace.',
    );
  }
  return found;
}

async function runOnce(
  workspaceId: string,
  key: string | null | undefined,
  run: () => Promise<unknown>,
) {
  if (await paymentForKey(workspaceId, key)) return { alreadyProcessed: true };
  try {
    await run();
  } catch (error) {
    // Carrera (doble click simultaneo): el indice unico ya gano en la otra.
    if (await paymentForKey(workspaceId, key)) return { alreadyProcessed: true };
    throw error;
  }
  return { alreadyProcessed: false };
}

// --- Operaciones -------------------------------------------------------------

/**
 * Estado final de una operacion: primero se reconcilian los recursos con el
 * plan vigente (P0-C: upgrade libera, downgrade limita; nunca borra) y luego
 * se devuelve el snapshot. Una falla de reconciliacion no revierte la
 * operacion de billing: la repara el barrido periodico.
 */
async function settled(workspaceId: string) {
  await reconcileSafely(workspaceId);
  return resolveSubscription(workspaceId);
}

/**
 * Cambia el plan conservando el medio de pago y el periodo en curso. El precio
 * acordado se actualiza al del Price Book del plan nuevo. Pasar a FREE deja
 * medio FREE y sin vencimiento.
 */
export async function assignPlan(
  input: { workspaceId: string; planCode: PlanCode; currency?: string } & AdminActor,
) {
  const current = await prisma.workspaceSubscription.findUnique({
    where: { workspaceId: input.workspaceId },
  });
  const planId = await planIdFor(input.planCode);
  const toFree = input.planCode === PlanCode.FREE;
  const currency = input.currency ?? current?.currency ?? 'CLP';
  const price = toFree ? null : await priceSnapshot(input.planCode, currency);

  await prisma.$transaction(async (tx) => {
    await writeSubscription(
      tx,
      input.workspaceId,
      {
        planId,
        billingSource: toFree
          ? BillingSource.FREE
          : (current?.billingSource ?? BillingSource.MANUAL),
        currentPeriodStart: toFree ? new Date() : (current?.currentPeriodStart ?? new Date()),
        currentPeriodEnd: toFree ? null : (current?.currentPeriodEnd ?? null),
        priceId: price?.id ?? null,
        currency: price ? currency : null,
        amountMinor: price?.amountMinor ?? null,
      },
      input,
    );
    await audit(tx, input.workspaceId, 'subscription.plan_changed', input, {
      from: current ? current.planId : null,
      planCode: input.planCode,
      priceId: price?.id ?? null,
    });
  });
  return settled(input.workspaceId);
}

export type ManualPaymentInput = {
  workspaceId: string;
  planCode: PlanCode;
  currency?: string;
  /** Importe pactado en unidades menores. Por defecto, el del Price Book. */
  amountMinor?: number;
  paidAt?: Date;
  periodStart?: Date;
  periodEnd?: Date;
  interval?: BillingInterval;
  reference?: string | null;
  notes?: string | null;
  /** Clave de la operacion (p. ej. un id por envio del formulario). */
  idempotencyKey?: string | null;
} & AdminActor;

/** Activa una suscripcion pagada fuera de Mercado Pago (transferencia, factura). */
export async function activateManualSubscription(input: ManualPaymentInput) {
  if (input.planCode === PlanCode.FREE)
    throw new SubscriptionAdminError('FREE_NOT_PAYABLE', 'FREE no se cobra.');
  const currency = (input.currency ?? 'CLP').toUpperCase();
  const interval = input.interval ?? BillingInterval.MONTH;
  const price = await priceSnapshot(input.planCode, currency, interval);
  const paidAt = input.paidAt ?? new Date();
  const periodStart = input.periodStart ?? paidAt;
  const periodEnd = input.periodEnd ?? addInterval(periodStart, interval);
  if (periodEnd <= periodStart)
    throw new SubscriptionAdminError('INVALID_PERIOD', 'El periodo termina antes de empezar.');
  const amountMinor = input.amountMinor ?? price.amountMinor;
  const planId = await planIdFor(input.planCode);

  const { alreadyProcessed } = await runOnce(input.workspaceId, input.idempotencyKey, () =>
    prisma.$transaction(async (tx) => {
      const subscription = await writeSubscription(
        tx,
        input.workspaceId,
        {
          planId,
          billingSource: BillingSource.MANUAL,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          priceId: price.id,
          currency,
          amountMinor,
          notes: input.notes ?? null,
        },
        input,
      );
      await tx.subscriptionPayment.create({
        data: {
          workspaceId: input.workspaceId,
          subscriptionId: subscription.id,
          planCode: input.planCode,
          planKey: input.planCode.toLowerCase(),
          source: BillingSource.MANUAL,
          currency,
          amountMinor,
          paidAt,
          periodStart,
          periodEnd,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          priceId: price.id,
          recordedById: input.actorId ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });
      await audit(tx, input.workspaceId, 'subscription.manual_activated', input, {
        planCode: input.planCode,
        currency,
        amountMinor,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        reference: input.reference ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      });
    }),
  );
  return { ...(await settled(input.workspaceId)), alreadyProcessed };
}

/** Registra otro periodo pagado del plan configurado (MANUAL). */
export async function renewManualSubscription(
  input: {
    workspaceId: string;
    currency?: string;
    amountMinor?: number;
    paidAt?: Date;
    periods?: number;
    reference?: string | null;
    notes?: string | null;
    idempotencyKey?: string | null;
  } & AdminActor,
) {
  const current = await prisma.workspaceSubscription.findUnique({
    where: { workspaceId: input.workspaceId },
    include: { plan: true, price: true },
  });
  if (!current)
    throw new SubscriptionAdminError('NO_SUBSCRIPTION', 'El workspace no tiene suscripcion.');
  const planCode = current.plan.code;
  if (!planCode || planCode === PlanCode.FREE) {
    throw new SubscriptionAdminError(
      'FREE_NOT_PAYABLE',
      'Solo se renueva un plan pagado del catalogo.',
    );
  }
  const currency = (input.currency ?? current.currency ?? 'CLP').toUpperCase();
  const interval = current.price?.interval ?? BillingInterval.MONTH;
  const price = await priceSnapshot(planCode, currency, interval);
  const amountMinor = input.amountMinor ?? price.amountMinor;
  const paidAt = input.paidAt ?? new Date();
  const periodStart = nextPeriodStart(current.currentPeriodEnd, paidAt);
  const periodEnd = addInterval(periodStart, interval, input.periods ?? 1);

  const { alreadyProcessed } = await runOnce(input.workspaceId, input.idempotencyKey, () =>
    prisma.$transaction(async (tx) => {
      await writeSubscription(
        tx,
        input.workspaceId,
        {
          planId: current.planId,
          billingSource: BillingSource.MANUAL,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          priceId: price.id,
          currency,
          amountMinor,
        },
        input,
      );
      await tx.subscriptionPayment.create({
        data: {
          workspaceId: input.workspaceId,
          subscriptionId: current.id,
          planCode,
          planKey: current.plan.key,
          source: BillingSource.MANUAL,
          currency,
          amountMinor,
          paidAt,
          periodStart,
          periodEnd,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          priceId: price.id,
          recordedById: input.actorId ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });
      await audit(tx, input.workspaceId, 'subscription.manual_renewed', input, {
        planCode,
        currency,
        amountMinor,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        reference: input.reference ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      });
    }),
  );
  return { ...(await settled(input.workspaceId)), alreadyProcessed };
}

/** Cortesia (negocios propios, QA, acuerdos). Sin fecha de fin = no vence. */
export async function assignCompSubscription(
  input: { workspaceId: string; planCode: PlanCode; periodEnd?: Date | null } & AdminActor,
) {
  if (!input.reason?.trim())
    throw new SubscriptionAdminError('REASON_REQUIRED', 'COMP requiere un motivo.');
  const planId = await planIdFor(input.planCode);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await writeSubscription(
      tx,
      input.workspaceId,
      {
        planId,
        billingSource: BillingSource.COMP,
        currentPeriodStart: now,
        currentPeriodEnd: input.periodEnd ?? null,
        priceId: null,
        currency: null,
        amountMinor: null,
      },
      input,
    );
    await audit(tx, input.workspaceId, 'subscription.comp_assigned', input, {
      planCode: input.planCode,
      periodEnd: input.periodEnd?.toISOString() ?? null,
    });
  });
  return settled(input.workspaceId);
}

/** Prueba explicita de un plan (campanas, promociones). Nunca automatica. */
export async function startTrial(
  input: { workspaceId: string; planCode: PlanCode; days: number } & AdminActor,
) {
  if (input.planCode === PlanCode.FREE || input.days <= 0) {
    throw new SubscriptionAdminError(
      'INVALID_PERIOD',
      'El trial necesita un plan pagado y una duracion.',
    );
  }
  const planId = await planIdFor(input.planCode);
  const now = new Date();
  const periodEnd = new Date(now.getTime() + input.days * DAY_MS);
  await prisma.$transaction(async (tx) => {
    await writeSubscription(
      tx,
      input.workspaceId,
      {
        planId,
        billingSource: BillingSource.TRIAL,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        priceId: null,
        currency: null,
        amountMinor: null,
      },
      input,
    );
    await audit(tx, input.workspaceId, 'subscription.trial_started', input, {
      planCode: input.planCode,
      days: input.days,
      periodEnd: periodEnd.toISOString(),
    });
  });
  return settled(input.workspaceId);
}

/** Suspension administrativa: bloquea acceso y consumo, no baja el plan. */
export async function suspendSubscription(input: { workspaceId: string } & AdminActor) {
  if (!input.reason?.trim())
    throw new SubscriptionAdminError('REASON_REQUIRED', 'Suspender requiere un motivo.');
  await prisma.$transaction(async (tx) => {
    const updated = await tx.workspaceSubscription.updateMany({
      where: { workspaceId: input.workspaceId },
      data: {
        suspendedAt: new Date(),
        suspendedReason: input.reason,
        updatedById: input.actorId ?? null,
      },
    });
    if (updated.count === 0)
      throw new SubscriptionAdminError('NO_SUBSCRIPTION', 'El workspace no tiene suscripcion.');
    await audit(tx, input.workspaceId, 'subscription.suspended', input, {});
  });
  return settled(input.workspaceId);
}

export async function resumeSubscription(input: { workspaceId: string } & AdminActor) {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.workspaceSubscription.updateMany({
      where: { workspaceId: input.workspaceId, suspendedAt: { not: null } },
      data: { suspendedAt: null, suspendedReason: null, updatedById: input.actorId ?? null },
    });
    if (updated.count === 0)
      throw new SubscriptionAdminError('NOT_SUSPENDED', 'La suscripcion no esta suspendida.');
    await audit(tx, input.workspaceId, 'subscription.resumed', input, {});
  });
  return settled(input.workspaceId);
}

/**
 * Marca un workspace como propio (o de QA). Solo afecta el reporting de
 * plataforma: no cambia aislamiento, permisos ni billing.
 */
export async function setWorkspaceInternal(
  input: { workspaceId: string; isInternal: boolean } & AdminActor,
) {
  await prisma.$transaction(async (tx) => {
    await tx.workspace.update({
      where: { id: input.workspaceId },
      data: { isInternal: input.isInternal },
    });
    await tx.platformAuditLog.create({
      data: {
        actorUserId: input.actorId ?? null,
        action: input.isInternal ? 'workspace.marked_internal' : 'workspace.unmarked_internal',
        targetWorkspaceId: input.workspaceId,
        metadata: { via: input.via ?? 'system', reason: input.reason ?? null },
      },
    });
  });
}

/**
 * Pago SaaS confirmado por Mercado Pago. Idempotente por `idempotencyKey`
 * (por defecto `mp:<id de pago>`) y por `externalPaymentId`: un reintento
 * del webhook no duplica ni extiende dos veces. Solo toca la suscripcion y el
 * libro SaaS; jamas Payment ni CustomerOrder.
 */
export async function recordSaasPayment(input: {
  workspaceId: string;
  plan: { id: string; code: PlanCode | null; key: string };
  price: { id: string; interval: BillingInterval } | null;
  currency: string;
  amountMinor: number;
  externalPaymentId: string;
  paidAt?: Date;
  idempotencyKey?: string | null;
}): Promise<{ alreadyProcessed: boolean }> {
  const key = input.idempotencyKey ?? `mp:${input.externalPaymentId}`;
  const byExternalId = () =>
    prisma.subscriptionPayment.findUnique({
      where: { externalPaymentId: input.externalPaymentId },
      select: { id: true },
    });
  if (await byExternalId()) return { alreadyProcessed: true };

  const current = await prisma.workspaceSubscription.findUnique({
    where: { workspaceId: input.workspaceId },
  });
  const paidAt = input.paidAt ?? new Date();
  const interval = input.price?.interval ?? BillingInterval.MONTH;
  // Mismo plan: continuidad del periodo. Plan distinto: periodo nuevo desde hoy.
  const samePlan = current?.planId === input.plan.id;
  const periodStart = samePlan
    ? nextPeriodStart(current?.currentPeriodEnd ?? null, paidAt)
    : paidAt;
  const periodEnd = addInterval(periodStart, interval);
  const actor: AdminActor = { via: 'webhook' };

  const outcome = await runOnce(input.workspaceId, key, () =>
    prisma.$transaction(async (tx) => {
      const subscription = await writeSubscription(
        tx,
        input.workspaceId,
        {
          planId: input.plan.id,
          billingSource: BillingSource.MERCADO_PAGO,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          priceId: input.price?.id ?? null,
          currency: input.currency,
          amountMinor: input.amountMinor,
          mpPaymentId: input.externalPaymentId,
        },
        actor,
      );
      await tx.subscriptionPayment.create({
        data: {
          workspaceId: input.workspaceId,
          subscriptionId: subscription.id,
          planCode: input.plan.code,
          planKey: input.plan.key,
          source: BillingSource.MERCADO_PAGO,
          currency: input.currency,
          amountMinor: input.amountMinor,
          paidAt,
          periodStart,
          periodEnd,
          externalPaymentId: input.externalPaymentId,
          priceId: input.price?.id ?? null,
          idempotencyKey: key,
        },
      });
      await audit(tx, input.workspaceId, 'billing.payment_confirmed', actor, {
        planCode: input.plan.code,
        planKey: input.plan.key,
        paymentId: input.externalPaymentId,
        currency: input.currency,
        amountMinor: input.amountMinor,
        periodEnd: periodEnd.toISOString(),
      });
    }),
  ).catch(async (error) => {
    // Carrera con otra entrega del mismo webhook por el unique de externalPaymentId.
    if (await byExternalId()) return { alreadyProcessed: true };
    throw error;
  });
  if (!outcome.alreadyProcessed) await reconcileSafely(input.workspaceId);
  return outcome;
}
