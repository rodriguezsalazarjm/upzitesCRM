import assert from 'node:assert/strict';
import test from 'node:test';
import { providerAmountToMinor, toMajorUnits } from '../billing/money';
import { exponentOf, formatMinor, majorText, priceView, textMentionsPrice } from './money';
import { parseMoneyInput } from './product-studio/rules';

/**
 * Dinero de Commerce: `ProductVariant.priceMinor`, `OrderLine.unitPrice/total`,
 * `CustomerOrder.total` y `Payment.amount` son enteros en unidades MENORES de
 * su moneda. Estas pruebas fijan CLP (exponente 0, sin division por 100) y
 * USD (exponente 2) para que ningun consumidor vuelva a suponer CLP.
 */

test('CLP: 19.990 + 2.990 = 22.980, sin division por 100 en ningun paso', () => {
  const main = parseMoneyInput('19.990', 'CLP');
  const bump = parseMoneyInput('2.990', 'CLP');
  assert.equal(main, 19990);
  assert.equal(bump, 2990);
  const total = main! + bump!;
  assert.equal(total, 22980);
  assert.equal(exponentOf('CLP'), 0);
  assert.equal(formatMinor(total, 'CLP'), '$22.980');
  assert.equal(majorText(total, 'CLP'), '22980');
  assert.equal(toMajorUnits(total, 'CLP'), 22980, 'a Mercado Pago van los mismos pesos');
  assert.equal(providerAmountToMinor(22980, 'CLP'), 22980, 'del webhook vuelven los mismos pesos');
});

test('USD: 19.99 + 2.99 = 22.98, guardado en centavos (2298)', () => {
  const main = parseMoneyInput('19.99', 'USD');
  const bump = parseMoneyInput('2.99', 'USD');
  assert.equal(main, 1999);
  assert.equal(bump, 299);
  const total = main! + bump!;
  assert.equal(total, 2298);
  assert.equal(exponentOf('USD'), 2);
  assert.equal(formatMinor(total, 'USD'), '$22.98');
  assert.equal(majorText(total, 'USD'), '22.98');
  assert.equal(toMajorUnits(total, 'USD'), 22.98);
  assert.equal(providerAmountToMinor(22.98, 'USD'), 2298, 'redondeo seguro de floats del proveedor');
  assert.equal(providerAmountToMinor(0.1 + 0.2, 'USD'), 30);
});

test('un precio viaja siempre con su moneda (agente y vistas)', () => {
  assert.deepEqual(priceView(1999, 'USD'), { amountMinor: 1999, currency: 'USD', display: '$19.99' });
  assert.deepEqual(priceView(5900, 'CLP'), { amountMinor: 5900, currency: 'CLP', display: '$5.900' });
});

test('mencionar un precio: formato visible o unidades mayores, nunca centavos como si fueran dolares', () => {
  assert.equal(textMentionsPrice('Demo: Curso, 1 unidad, $5.900.', 5900, 'CLP'), true);
  assert.equal(textMentionsPrice('Son 5900 pesos', 5900, 'CLP'), true);
  assert.equal(textMentionsPrice('Cuesta $19.99', 1999, 'USD'), true);
  assert.equal(textMentionsPrice('Cuesta 19.99 dólares', 1999, 'USD'), true);
  assert.equal(textMentionsPrice('Cuesta 1999', 1999, 'USD'), false, '1999 centavos no es US$1999');
  assert.equal(textMentionsPrice('Cuesta $6.900', 5900, 'CLP'), false);
});
