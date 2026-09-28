import assert from 'node:assert/strict';
import test from 'node:test';
import { BillingInterval } from '../../../generated/prisma/enums';
import { addInterval, formatMoney, toMajorUnits } from './money';

test('CLP usa exponente 0: 19990 = $19.990', () => {
  assert.equal(toMajorUnits(19990, 'CLP'), 19990);
  assert.equal(formatMoney(19990, 'CLP'), '$19.990');
});

test('USD usa exponente 2: 1900 = 19.00', () => {
  assert.equal(toMajorUnits(1900, 'USD'), 19);
  assert.equal(formatMoney(4900, 'USD'), '$49.00');
});

test('moneda no soportada falla en vez de adivinar el exponente', () => {
  assert.throws(() => toMajorUnits(100, 'EUR'), /no soportada/);
});

test('un mes calendario, sin desbordar a marzo', () => {
  assert.equal(addInterval(new Date('2026-01-31T12:00:00Z')).toISOString(), '2026-02-28T12:00:00.000Z');
  assert.equal(addInterval(new Date('2028-01-31T12:00:00Z')).toISOString(), '2028-02-29T12:00:00.000Z');
  assert.equal(addInterval(new Date('2026-09-26T00:00:00Z')).toISOString(), '2026-10-26T00:00:00.000Z');
});

test('un ano = 12 meses; varios periodos se acumulan', () => {
  assert.equal(addInterval(new Date('2026-02-28T00:00:00Z'), BillingInterval.YEAR).toISOString(), '2027-02-28T00:00:00.000Z');
  assert.equal(addInterval(new Date('2026-01-15T00:00:00Z'), BillingInterval.MONTH, 3).toISOString(), '2026-04-15T00:00:00.000Z');
});
