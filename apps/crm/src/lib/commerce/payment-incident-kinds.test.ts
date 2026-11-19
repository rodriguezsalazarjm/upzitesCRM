import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceRows, INCIDENT_KIND } from './payment-incident-kinds';

const money = (minor: number, currency: string) => `${currency} ${minor}`;

test('cada tipo de incidencia del plan tiene etiqueta y acción requerida', () => {
  for (const kind of ['AMOUNT_MISMATCH', 'CURRENCY_MISMATCH', 'STALE_PREFERENCE', 'ORPHAN_PAYMENT', 'DUPLICATE_PAYMENT', 'REFUND', 'CHARGEBACK'] as const) {
    assert.ok(INCIDENT_KIND[kind].label.length > 3, kind);
    assert.ok(INCIDENT_KIND[kind].action.length > 20, kind);
  }
});

test('evidencia: solo claves conocidas con valor, montos con su moneda', () => {
  const rows = evidenceRows({
    validation: 'order.payment_amount_mismatch',
    expectedAmount: 15000, receivedAmount: 9000, expectedCurrency: 'CLP', receivedCurrency: 'USD',
    preferenceId: null, secretThing: 'x',
  }, money);
  assert.deepEqual(rows.map((r) => [r.key, r.value]), [
    ['expectedAmount', 'CLP 15000'],
    ['receivedAmount', 'USD 9000'],
    ['expectedCurrency', 'CLP'],
    ['receivedCurrency', 'USD'],
  ]);
  assert.deepEqual(evidenceRows(null, money), []);
  assert.deepEqual(evidenceRows([1, 2], money), []);
});
