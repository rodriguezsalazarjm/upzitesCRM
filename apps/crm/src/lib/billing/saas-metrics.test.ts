import assert from 'node:assert/strict';
import test from 'node:test';
import { BillingInterval, BillingSource, PlanCode, SubscriptionStatus } from '../../../generated/prisma/enums';
import { computeSaasMetrics, type MetricsRow } from './saas-metrics-calc';

const NOW = new Date('2026-09-28T12:00:00Z');
const DAY = 86_400_000;
const days = (n: number) => new Date(NOW.getTime() + n * DAY);

let counter = 0;
function ws(input: {
  plan: PlanCode;
  source: BillingSource;
  end?: Date | null;
  amountMinor?: number | null;
  currency?: string | null;
  internal?: boolean;
  interval?: BillingInterval;
}): MetricsRow {
  counter += 1;
  return {
    status: SubscriptionStatus.ACTIVE,
    billingSource: input.source,
    trialEndsAt: null,
    renewsAt: null,
    currentPeriodStart: days(-10),
    currentPeriodEnd: input.end === undefined ? days(20) : input.end,
    suspendedAt: null,
    mpPaymentId: null,
    currency: input.currency === undefined ? 'CLP' : input.currency,
    amountMinor: input.amountMinor === undefined ? 49990 : input.amountMinor,
    plan: { code: input.plan, key: input.plan.toLowerCase() },
    price: { interval: input.interval ?? BillingInterval.MONTH },
    workspace: { id: `ws-${counter}`, isInternal: input.internal ?? false },
  };
}

test('solo MANUAL y MERCADO_PAGO vigentes suman MRR; FREE, TRIAL, COMP e internos no', () => {
  const proManual = ws({ plan: PlanCode.PRO, source: BillingSource.MANUAL });
  const proMp = ws({ plan: PlanCode.PRO, source: BillingSource.MERCADO_PAGO });
  const proComp = ws({ plan: PlanCode.PRO, source: BillingSource.COMP, end: null, amountMinor: null, currency: null });
  const trial = ws({ plan: PlanCode.PRO, source: BillingSource.TRIAL, end: days(5), amountMinor: null, currency: null });
  const free = ws({ plan: PlanCode.FREE, source: BillingSource.FREE, end: null, amountMinor: null, currency: null });
  const internalComp = ws({ plan: PlanCode.SCALE, source: BillingSource.COMP, end: null, amountMinor: null, currency: null, internal: true });
  const internalPaid = ws({ plan: PlanCode.SCALE, source: BillingSource.MANUAL, amountMinor: 99990, internal: true });

  const metrics = computeSaasMetrics([proManual, proMp, proComp, trial, free, internalComp, internalPaid], NOW);

  assert.deepEqual(metrics.payingWorkspaceIds.sort(), [proManual.workspace.id, proMp.workspace.id].sort());
  assert.equal(metrics.payingCustomers, 2);
  assert.deepEqual(metrics.mrrByCurrency, { CLP: 49990 * 2 });
  assert.equal(metrics.comp, 1, 'solo el COMP no interno cuenta como COMP comercial');
  assert.equal(metrics.trials, 1);
  assert.equal(metrics.free, 1);
  assert.equal(metrics.internalWorkspaces, 2);
});

test('un interno con billing pagado por error jamas entra: ni MRR, ni clientes, ni churn, ni estados', () => {
  const active = ws({ plan: PlanCode.SCALE, source: BillingSource.MERCADO_PAGO, amountMinor: 99990, internal: true });
  const expired = ws({ plan: PlanCode.PRO, source: BillingSource.MANUAL, end: days(-30), internal: true });
  const metrics = computeSaasMetrics([active, expired], NOW);
  assert.equal(metrics.payingCustomers, 0);
  assert.deepEqual(metrics.mrrByCurrency, {});
  assert.equal(metrics.churned, 0);
  assert.deepEqual(metrics.byState, {});
  assert.equal(metrics.internalWorkspaces, 2);
});

test('pagado en GRACE sigue en MRR; pagado tras la gracia es churn, no MRR', () => {
  const grace = ws({ plan: PlanCode.PRO, source: BillingSource.MANUAL, end: days(-2) });
  const expired = ws({ plan: PlanCode.PRO, source: BillingSource.MERCADO_PAGO, end: days(-30) });
  const metrics = computeSaasMetrics([grace, expired], NOW);
  assert.deepEqual(metrics.payingWorkspaceIds, [grace.workspace.id]);
  assert.deepEqual(metrics.mrrByCurrency, { CLP: 49990 });
  assert.equal(metrics.churned, 1);
});

test('SUSPENDED no suma MRR aunque su periodo este pagado', () => {
  const suspended = { ...ws({ plan: PlanCode.PRO, source: BillingSource.MANUAL }), suspendedAt: days(-1) };
  const metrics = computeSaasMetrics([suspended], NOW);
  assert.equal(metrics.payingCustomers, 0);
  assert.deepEqual(metrics.mrrByCurrency, {});
});

test('MRR por moneda sin conversion; anual normalizado a mensual', () => {
  const clp = ws({ plan: PlanCode.START, source: BillingSource.MANUAL, amountMinor: 19990 });
  const usd = ws({ plan: PlanCode.PRO, source: BillingSource.MANUAL, amountMinor: 4900, currency: 'USD' });
  const yearly = ws({ plan: PlanCode.SCALE, source: BillingSource.MANUAL, amountMinor: 118800, currency: 'USD', interval: BillingInterval.YEAR, end: days(300) });
  const metrics = computeSaasMetrics([clp, usd, yearly], NOW);
  assert.deepEqual(metrics.mrrByCurrency, { CLP: 19990, USD: 4900 + 9900 });
});
