import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BillingSource, PlanCode, SubscriptionStatus } from '../../../generated/prisma/enums';
import { GRACE_PERIOD_DAYS, resolveLifecycle, type SubscriptionRow } from './subscription-state';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const DAY = 1000 * 60 * 60 * 24;
const days = (n: number) => new Date(NOW.getTime() + n * DAY);

function row(overrides: Partial<SubscriptionRow> & { code?: PlanCode | null; key?: string } = {}): SubscriptionRow {
  const { code = PlanCode.PRO, key = 'pro', ...rest } = overrides;
  return {
    status: SubscriptionStatus.ACTIVE,
    billingSource: BillingSource.MANUAL,
    trialEndsAt: null,
    renewsAt: null,
    currentPeriodStart: days(-20),
    currentPeriodEnd: days(10),
    suspendedAt: null,
    mpPaymentId: null,
    currency: 'CLP',
    amountMinor: 49990,
    plan: { code, key },
    ...rest,
  };
}

describe('resolveLifecycle (P0-B)', () => {
  test('FREE: no vence, acceso sin consumo pagado', () => {
    const state = resolveLifecycle(row({ code: PlanCode.FREE, key: 'free', billingSource: BillingSource.FREE, currentPeriodEnd: null }), days(3650));
    assert.equal(state.state, 'FREE');
    assert.equal(state.effectivePlan, PlanCode.FREE);
    assert.equal(state.hasAccess, true);
    assert.equal(state.canConsume, false);
  });

  test('pagado vigente: ACTIVE con el plan configurado', () => {
    const state = resolveLifecycle(row(), NOW);
    assert.equal(state.state, 'ACTIVE');
    assert.equal(state.configuredPlan, PlanCode.PRO);
    assert.equal(state.effectivePlan, PlanCode.PRO);
    assert.equal(state.canConsume, true);
    assert.equal(state.daysLeft, 10);
    assert.deepEqual(state.renewsAt, days(10));
    assert.deepEqual(state.price, { amountMinor: 49990, currency: 'CLP', interval: 'MONTH' });
  });

  test('pagado vencido dentro de la gracia: GRACE conserva el plan', () => {
    const state = resolveLifecycle(row({ currentPeriodEnd: days(-2) }), NOW);
    assert.equal(state.state, 'GRACE');
    assert.equal(state.effectivePlan, PlanCode.PRO);
    assert.equal(state.canConsume, true);
    assert.deepEqual(state.graceEndsAt, days(GRACE_PERIOD_DAYS - 2));
    assert.equal(state.daysLeft, GRACE_PERIOD_DAYS - 2);
  });

  test('tras la gracia: EXPIRED, FREE efectivo, plan configurado intacto', () => {
    const state = resolveLifecycle(row({ currentPeriodEnd: days(-(GRACE_PERIOD_DAYS + 1)) }), NOW);
    assert.equal(state.state, 'EXPIRED');
    assert.equal(state.configuredPlan, PlanCode.PRO);
    assert.equal(state.effectivePlan, PlanCode.FREE);
    assert.equal(state.hasAccess, true);
    assert.equal(state.canConsume, false);
  });

  test('el borde exacto de la gracia ya esta vencido', () => {
    assert.equal(resolveLifecycle(row({ currentPeriodEnd: days(-GRACE_PERIOD_DAYS) }), NOW).state, 'EXPIRED');
  });

  test('pagado sin fecha de fin se cierra hacia FREE', () => {
    const state = resolveLifecycle(row({ currentPeriodEnd: null }), NOW);
    assert.equal(state.state, 'EXPIRED');
    assert.equal(state.canConsume, false);
  });

  test('MERCADO_PAGO usa la misma gracia que MANUAL', () => {
    assert.equal(resolveLifecycle(row({ billingSource: BillingSource.MERCADO_PAGO, currentPeriodEnd: days(-1) }), NOW).state, 'GRACE');
  });

  test('TRIAL vigente y TRIAL vencido sin gracia', () => {
    const trial = row({ billingSource: BillingSource.TRIAL, currentPeriodEnd: days(3) });
    assert.equal(resolveLifecycle(trial, NOW).state, 'TRIAL');
    assert.equal(resolveLifecycle(trial, NOW).canConsume, true);
    const expired = resolveLifecycle({ ...trial, currentPeriodEnd: days(-1) }, NOW);
    assert.equal(expired.state, 'EXPIRED');
    assert.equal(expired.effectivePlan, PlanCode.FREE);
    assert.equal(expired.graceEndsAt, null);
  });

  test('TRIAL sin fecha de fin no es acceso pagado gratis', () => {
    assert.equal(resolveLifecycle(row({ billingSource: BillingSource.TRIAL, currentPeriodEnd: null }), NOW).state, 'EXPIRED');
  });

  test('COMP sin fin no vence; COMP con fin vencido pasa a FREE sin gracia', () => {
    const comp = row({ code: PlanCode.SCALE, key: 'scale', billingSource: BillingSource.COMP, currentPeriodEnd: null });
    const forever = resolveLifecycle(comp, days(3650));
    assert.equal(forever.state, 'ACTIVE');
    assert.equal(forever.effectivePlan, PlanCode.SCALE);
    assert.equal(forever.renewsAt, null);
    const ended = resolveLifecycle({ ...comp, currentPeriodEnd: days(-1) }, NOW);
    assert.equal(ended.state, 'EXPIRED');
    assert.equal(ended.effectivePlan, PlanCode.FREE);
    assert.equal(ended.graceEndsAt, null);
  });

  test('SUSPENDED: sin acceso ni consumo, y NO baja a FREE', () => {
    const state = resolveLifecycle(row({ suspendedAt: days(-1) }), NOW);
    assert.equal(state.state, 'SUSPENDED');
    assert.equal(state.effectivePlan, PlanCode.PRO);
    assert.equal(state.hasAccess, false);
    assert.equal(state.canConsume, false);
  });

  test('sin fila: funciona como FREE', () => {
    const state = resolveLifecycle(null, NOW);
    assert.equal(state.state, 'FREE');
    assert.equal(state.hasAccess, true);
    assert.equal(state.canConsume, false);
  });

  test('legacy: TRIAL sobre monthly escrito por codigo anterior (billingSource por defecto)', () => {
    const legacy = row({ code: null, key: 'monthly', status: SubscriptionStatus.TRIAL, billingSource: BillingSource.FREE, currentPeriodEnd: null, trialEndsAt: days(2) });
    const state = resolveLifecycle(legacy, NOW);
    assert.equal(state.state, 'TRIAL');
    assert.equal(state.configuredPlan, null);
    assert.equal(state.legacyPlanKey, 'monthly');
    assert.equal(state.effectivePlan, 'LEGACY');
    assert.equal(state.billingSource, BillingSource.TRIAL);
  });

  test('legacy: ACTIVE con renewsAt vencido hace meses (el bug de P0-A) no consume', () => {
    const legacy = row({ code: null, key: 'monthly', billingSource: BillingSource.FREE, currentPeriodEnd: null, renewsAt: days(-90) });
    const state = resolveLifecycle(legacy, NOW);
    assert.equal(state.state, 'EXPIRED');
    assert.equal(state.canConsume, false);
  });

  test('legacy CANCELED no da consumo aunque renewsAt sea futuro', () => {
    const state = resolveLifecycle(row({ code: null, key: 'monthly', status: SubscriptionStatus.CANCELED, renewsAt: days(20), currentPeriodEnd: null }), NOW);
    assert.equal(state.state, 'EXPIRED');
    assert.equal(state.canConsume, false);
  });

  test('invariante: consumir implica tener acceso y un plan efectivo distinto de FREE', () => {
    const cases: SubscriptionRow[] = [
      row(),
      row({ currentPeriodEnd: days(-3) }),
      row({ currentPeriodEnd: days(-40) }),
      row({ billingSource: BillingSource.TRIAL, currentPeriodEnd: days(2) }),
      row({ billingSource: BillingSource.TRIAL, currentPeriodEnd: days(-2) }),
      row({ suspendedAt: NOW }),
      row({ code: PlanCode.FREE, key: 'free', billingSource: BillingSource.FREE, currentPeriodEnd: null }),
    ];
    for (const item of cases) {
      const state = resolveLifecycle(item, NOW);
      if (state.canConsume) {
        assert.equal(state.hasAccess, true);
        assert.notEqual(state.effectivePlan, PlanCode.FREE);
      }
    }
  });
});
