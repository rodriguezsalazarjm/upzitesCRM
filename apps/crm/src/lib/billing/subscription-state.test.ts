import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SubscriptionStatus } from '../../../generated/prisma/client';
import { GRACE_PERIOD_DAYS, resolveSubscriptionState } from './subscription-state';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const DAY = 1000 * 60 * 60 * 24;
const days = (n: number) => new Date(NOW.getTime() + n * DAY);

function sub(status: SubscriptionStatus, dates: { trialEndsAt?: Date | null; renewsAt?: Date | null }) {
  return { status, trialEndsAt: dates.trialEndsAt ?? null, renewsAt: dates.renewsAt ?? null };
}

describe('resolveSubscriptionState', () => {
  test('ACTIVE vigente: acceso y consumo', () => {
    const state = resolveSubscriptionState(sub(SubscriptionStatus.ACTIVE, { renewsAt: days(10) }), NOW);
    assert.equal(state.state, 'ACTIVE');
    assert.equal(state.hasAccess, true);
    assert.equal(state.canConsume, true);
    assert.equal(state.daysLeft, 10);
    assert.equal(state.graceEndsAt, null);
  });

  test('ACTIVE vencido dentro de la gracia: GRACE conserva acceso y consumo', () => {
    const state = resolveSubscriptionState(sub(SubscriptionStatus.ACTIVE, { renewsAt: days(-2) }), NOW);
    assert.equal(state.state, 'GRACE');
    assert.equal(state.hasAccess, true);
    assert.equal(state.canConsume, true);
    assert.deepEqual(state.graceEndsAt, days(GRACE_PERIOD_DAYS - 2));
    assert.equal(state.daysLeft, GRACE_PERIOD_DAYS - 2);
  });

  test('ACTIVE vencido fuera de la gracia: EXPIRED sin acceso ni consumo', () => {
    const state = resolveSubscriptionState(
      sub(SubscriptionStatus.ACTIVE, { renewsAt: days(-(GRACE_PERIOD_DAYS + 1)) }),
      NOW,
    );
    assert.equal(state.state, 'EXPIRED');
    assert.equal(state.hasAccess, false);
    assert.equal(state.canConsume, false);
    assert.equal(state.daysLeft, 0);
  });

  test('ACTIVE vencido hace meses (el caso que antes seguia consumiendo): EXPIRED', () => {
    const state = resolveSubscriptionState(sub(SubscriptionStatus.ACTIVE, { renewsAt: days(-90) }), NOW);
    assert.equal(state.canConsume, false);
  });

  test('el borde exacto de la gracia ya esta vencido', () => {
    const state = resolveSubscriptionState(
      sub(SubscriptionStatus.ACTIVE, { renewsAt: days(-GRACE_PERIOD_DAYS) }),
      NOW,
    );
    assert.equal(state.state, 'EXPIRED');
  });

  test('ACTIVE sin renewsAt se cierra por defecto', () => {
    const state = resolveSubscriptionState(sub(SubscriptionStatus.ACTIVE, {}), NOW);
    assert.equal(state.state, 'EXPIRED');
    assert.equal(state.canConsume, false);
  });

  test('PAST_DUE se trata como pagado: gracia desde renewsAt', () => {
    assert.equal(
      resolveSubscriptionState(sub(SubscriptionStatus.PAST_DUE, { renewsAt: days(-1) }), NOW).state,
      'GRACE',
    );
    assert.equal(
      resolveSubscriptionState(sub(SubscriptionStatus.PAST_DUE, { renewsAt: days(-30) }), NOW).state,
      'EXPIRED',
    );
  });

  test('TRIAL vigente', () => {
    const state = resolveSubscriptionState(sub(SubscriptionStatus.TRIAL, { trialEndsAt: days(3) }), NOW);
    assert.equal(state.state, 'TRIAL');
    assert.equal(state.canConsume, true);
    assert.equal(state.daysLeft, 3);
  });

  test('TRIAL vencido no tiene gracia', () => {
    const state = resolveSubscriptionState(sub(SubscriptionStatus.TRIAL, { trialEndsAt: days(-1) }), NOW);
    assert.equal(state.state, 'EXPIRED');
    assert.equal(state.hasAccess, false);
    assert.equal(state.graceEndsAt, null);
  });

  test('TRIAL sin fecha de fin no es acceso gratis para siempre', () => {
    const state = resolveSubscriptionState(sub(SubscriptionStatus.TRIAL, {}), NOW);
    assert.equal(state.state, 'EXPIRED');
    assert.equal(state.canConsume, false);
  });

  test('CANCELED no da acceso aunque renewsAt sea futuro', () => {
    const state = resolveSubscriptionState(sub(SubscriptionStatus.CANCELED, { renewsAt: days(20) }), NOW);
    assert.equal(state.state, 'EXPIRED');
    assert.equal(state.hasAccess, false);
  });

  test('sin suscripcion: NONE', () => {
    const state = resolveSubscriptionState(null, NOW);
    assert.equal(state.state, 'NONE');
    assert.equal(state.hasAccess, false);
    assert.equal(state.canConsume, false);
  });

  test('acceso y consumo nunca discrepan (la causa del bug original)', () => {
    const cases = [
      sub(SubscriptionStatus.ACTIVE, { renewsAt: days(5) }),
      sub(SubscriptionStatus.ACTIVE, { renewsAt: days(-3) }),
      sub(SubscriptionStatus.ACTIVE, { renewsAt: days(-40) }),
      sub(SubscriptionStatus.TRIAL, { trialEndsAt: days(2) }),
      sub(SubscriptionStatus.TRIAL, { trialEndsAt: days(-2) }),
      sub(SubscriptionStatus.CANCELED, { renewsAt: days(5) }),
    ];
    for (const item of cases) {
      const state = resolveSubscriptionState(item, NOW);
      assert.equal(state.hasAccess, state.canConsume, `${item.status} ${item.renewsAt ?? item.trialEndsAt}`);
    }
  });
});
