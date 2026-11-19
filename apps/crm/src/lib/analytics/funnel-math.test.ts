import test from 'node:test';
import assert from 'node:assert/strict';
import { funnelRates, funnelStages, groupSales, rate, type FunnelCounts } from './funnel-math';

const counts: FunnelCounts = {
  adConversations: 4, leads: 10, conversations: 8, conversationsWithCheckout: 3, checkouts: 4, sales: 2, revenue: 30_000,
  bumpShown: 3, bumpAccepted: 1, bumpRevenue: 5_000, upsellAccepted: 0, upsellRevenue: 0, recoveredSales: 1, recoveryRevenue: 10_000,
};

test('tasas: sin base es null (sin datos), no 0 %', () => {
  assert.equal(rate(1, 3), 33.3);
  assert.equal(rate(0, 0), null);
  assert.deepEqual(funnelRates(counts), { conversationToCheckout: 37.5, checkoutToSale: 50, bumpTakeRate: 33.3, averageOrder: 15_000 });
  assert.equal(funnelRates({ ...counts, sales: 0, revenue: 0 }).averageOrder, null);
});

test('etapas en el orden del plan', () => {
  assert.deepEqual(funnelStages(counts).map((s) => s.key), ['ad', 'lead', 'conversation', 'checkout', 'payment', 'bump', 'recovery']);
  assert.equal(funnelStages(counts).find((s) => s.key === 'bump')!.hint, 'de 3 mostrados');
});

test('desglose: agrupa, suma y ordena por ingresos', () => {
  const rows = groupSales(
    [{ c: 'a', t: 100 }, { c: 'b', t: 500 }, { c: 'a', t: 300 }, { c: 'c', t: 400 }],
    (r) => ({ key: r.c, label: r.c.toUpperCase() }),
    (r) => r.t,
  );
  assert.deepEqual(rows, [
    { key: 'b', label: 'B', sales: 1, revenue: 500 },
    { key: 'a', label: 'A', sales: 2, revenue: 400 },
    { key: 'c', label: 'C', sales: 1, revenue: 400 },
  ]);
});
