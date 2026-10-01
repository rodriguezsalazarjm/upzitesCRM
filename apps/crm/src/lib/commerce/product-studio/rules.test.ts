import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bumpProblem,
  chooseVariant,
  copyName,
  formatMinor,
  isBlockingBumpIssue,
  minorToInput,
  normalizeSku,
  parseMoneyInput,
  priceFrom,
  productInputSchema,
  publishBlockers,
  sellableVariants,
  skuProblem,
  type BumpCandidate,
} from './rules';

/**
 * Reglas puras del Product Sales Studio. El servidor las usa como autoridad:
 * si una de estas falla, un request manipulado podria vender a otro precio,
 * otra variante u otro producto adicional.
 */

const valid = { name: 'Camiseta', type: 'PHYSICAL', currency: 'CLP', basePrice: 12990 };

test('dinero: CLP sin decimales, USD con centavos, nunca floats en el resultado', () => {
  assert.equal(parseMoneyInput('19990', 'CLP'), 19990);
  assert.equal(parseMoneyInput('19.990', 'CLP'), 19990);
  assert.equal(parseMoneyInput('$ 1.234.567', 'CLP'), 1234567);
  assert.equal(parseMoneyInput('19,5', 'CLP'), null, 'CLP no admite decimales');
  assert.equal(parseMoneyInput('19.99', 'USD'), 1999);
  assert.equal(parseMoneyInput('19,99', 'USD'), 1999);
  assert.equal(parseMoneyInput('0.1', 'USD'), 10);
  assert.equal(parseMoneyInput('1,234.50', 'USD'), 123450);
  assert.equal(parseMoneyInput('1.234,50', 'USD'), 123450);
  assert.equal(parseMoneyInput('19.999', 'USD'), 1999900, 'tres digitos tras el punto = miles');
  for (const bad of ['', 'abc', '-5', '1e5', '12.34.5', '19.9.9', '1,2,3']) assert.equal(parseMoneyInput(bad, 'USD'), null, bad);
  assert.equal(parseMoneyInput('99999999999', 'CLP'), null, 'sobre el tope');
  assert.equal(minorToInput(1999, 'USD'), '19.99');
  assert.equal(minorToInput(19990, 'CLP'), '19990');
  assert.equal(minorToInput(5, 'USD'), '0.05');
  assert.match(formatMinor(19990, 'CLP'), /19\.990/);
  assert.match(formatMinor(1999, 'USD'), /19\.99/);
});

test('SKU: opcional, normalizado y con caracteres seguros', () => {
  assert.equal(normalizeSku('  cam s  '), 'CAM-S');
  assert.equal(normalizeSku(''), null);
  assert.equal(normalizeSku(null), null);
  assert.equal(skuProblem(null), null);
  assert.equal(skuProblem('CAM-S'), null);
  assert.ok(skuProblem('<SCRIPT>'));
  assert.ok(skuProblem('A'.repeat(65)));
});

test('payload: whitelist estricta, sin claves extra ni montos invalidos', () => {
  assert.ok(productInputSchema.safeParse(valid).success);
  const extra = productInputSchema.safeParse({ ...valid, status: 'ACTIVE' });
  assert.equal(extra.success, false, 'el estado no se cambia por el editor');
  assert.equal(productInputSchema.safeParse({ ...valid, workspaceId: 'otro' }).success, false);
  assert.equal(productInputSchema.safeParse({ ...valid, metadata: { orderBump: { variantId: 'x' } } }).success, false);
  assert.equal(productInputSchema.safeParse({ ...valid, basePrice: 10.5 }).success, false, 'precio entero (unidades menores)');
  assert.equal(productInputSchema.safeParse({ ...valid, basePrice: -1 }).success, false);
  assert.equal(productInputSchema.safeParse({ ...valid, currency: 'EUR' }).success, false, 'moneda no soportada');
  assert.equal(productInputSchema.safeParse({ ...valid, type: 'SUBSCRIPTION' }).success, false);
  assert.equal(productInputSchema.safeParse({ ...valid, name: '   ' }).success, false);
  assert.equal(productInputSchema.safeParse({ ...valid, variants: [{ name: 'M', price: 100, isActive: true, inventory: 5 }] }).success, false, 'sin inventario');
  const parsed = productInputSchema.parse({ ...valid, description: '  <b>hola</b>  ', sku: ' cam ' });
  assert.equal(parsed.description, '<b>hola</b>', 'la descripcion se guarda como texto (se renderiza escapada)');
  assert.equal(parsed.sku, 'CAM');
  assert.deepEqual(parsed.orderBump, { enabled: false });
});

test('payload: variantes con nombre y SKU unicos; bump activo exige producto', () => {
  const dupName = productInputSchema.safeParse({ ...valid, variants: [{ name: 'M', price: 1, isActive: true }, { name: 'm', price: 1, isActive: true }] });
  assert.equal(dupName.success, false);
  const dupSku = productInputSchema.safeParse({ ...valid, sku: 'X', variants: [{ name: 'M', sku: 'x', price: 1, isActive: true }] });
  assert.equal(dupSku.success, false);
  const bumpWithout = productInputSchema.safeParse({ ...valid, orderBump: { enabled: true } });
  assert.equal(bumpWithout.success, false);
  const tooMany = productInputSchema.safeParse({ ...valid, variants: Array.from({ length: 51 }, (_, i) => ({ name: `V${i}`, price: 1, isActive: true })) });
  assert.equal(tooMany.success, false);
});

const base = { id: 'd', isDefault: true, isActive: true, price: 10000 };
const s = { id: 's', isDefault: false, isActive: true, price: 9000 };
const m = { id: 'm', isDefault: false, isActive: true, price: 11000 };
const off = { id: 'x', isDefault: false, isActive: false, price: 12000 };

test('variantes: sin variantes se vende la por defecto; con variantes hay que elegir una activa', () => {
  assert.deepEqual(sellableVariants([base]), { needsChoice: false, variants: [base] });
  const withOptions = [{ ...base, isActive: false }, s, m, off];
  assert.equal(sellableVariants(withOptions).needsChoice, true);
  assert.deepEqual(sellableVariants(withOptions).variants.map((v) => v.id), ['s', 'm']);

  assert.deepEqual(chooseVariant([base], null), { ok: true, variant: base });
  assert.deepEqual(chooseVariant([base], 'd'), { ok: true, variant: base });
  assert.deepEqual(chooseVariant([base], 'otro'), { ok: false, reason: 'INVALID_VARIANT' }, 'id ajeno en producto simple');
  assert.deepEqual(chooseVariant(withOptions, null), { ok: false, reason: 'CHOOSE_VARIANT' });
  assert.deepEqual(chooseVariant(withOptions, 'm'), { ok: true, variant: m });
  assert.deepEqual(chooseVariant(withOptions, 'x'), { ok: false, reason: 'INVALID_VARIANT' }, 'variante desactivada');
  assert.deepEqual(chooseVariant(withOptions, 'd'), { ok: false, reason: 'INVALID_VARIANT' }, 'la por defecto no es opcion');
  assert.deepEqual(chooseVariant(withOptions, 'variante-de-otro-producto'), { ok: false, reason: 'INVALID_VARIANT' });
  assert.deepEqual(chooseVariant([{ ...base, price: 0 }], null), { ok: false, reason: 'UNAVAILABLE' });
  assert.equal(priceFrom(withOptions), 9000);
  assert.equal(priceFrom([base]), 10000);
});

test('publicacion: precio > 0 y algo vendible', () => {
  assert.deepEqual(publishBlockers({ name: 'P', currency: 'CLP', variants: [base] }), []);
  assert.equal(publishBlockers({ name: 'P', currency: 'CLP', variants: [{ ...base, price: 0 }] }).length, 1);
  assert.equal(publishBlockers({ name: '', currency: 'CLP', variants: [base] }).length, 1);
  assert.equal(publishBlockers({ name: 'P', currency: 'EUR', variants: [base] }).length, 1);
  assert.deepEqual(publishBlockers({ name: 'P', currency: 'USD', variants: [{ ...base, isActive: false }, s] }), []);
  assert.equal(publishBlockers({ name: 'P', currency: 'CLP', variants: [{ ...base, isActive: false }, off] }).length, 1, 'todas las variantes pausadas');
  assert.equal(publishBlockers({ name: 'P', currency: 'CLP', variants: [{ ...base, isActive: false }, { ...s, price: 0 }] }).length, 1);
  // Variantes con ventas quitadas quedan inactivas: el producto vuelve a venderse con su precio.
  assert.deepEqual(publishBlockers({ name: 'P', currency: 'CLP', variants: [base, off] }), []);
});

const candidate = (patch: Partial<BumpCandidate> = {}): BumpCandidate => ({ productId: 'bump', workspaceId: 'ws-a', status: 'ACTIVE', currency: 'CLP', variantActive: true, price: 2990, ...patch });

test('order bump: sin self-bump, sin cross-tenant, misma moneda, activo y con precio', () => {
  const check = (c: BumpCandidate | null, mainProductId: string | null = 'main') => bumpProblem({ mainProductId, workspaceId: 'ws-a', currency: 'CLP', candidate: c });
  assert.equal(check(candidate()), null);
  assert.equal(check(candidate({ productId: 'main' })), 'SELF');
  assert.equal(check(candidate({ workspaceId: 'ws-b' })), 'OTHER_WORKSPACE');
  assert.equal(check(null), 'MISSING');
  assert.equal(check(candidate({ status: 'ARCHIVED' })), 'ARCHIVED');
  assert.equal(check(candidate({ currency: 'USD' })), 'CURRENCY');
  assert.equal(check(candidate({ variantActive: false })), 'INACTIVE');
  assert.equal(check(candidate({ price: 0 })), 'NO_PRICE');
  assert.equal(check(candidate({ status: 'DRAFT' })), 'NOT_PUBLISHED');
  assert.equal(isBlockingBumpIssue('NOT_PUBLISHED'), false, 'un borrador se puede preparar como adicional');
  for (const issue of ['SELF', 'OTHER_WORKSPACE', 'MISSING', 'ARCHIVED', 'CURRENCY', 'INACTIVE', 'NO_PRICE'] as const) assert.equal(isBlockingBumpIssue(issue), true, issue);
  assert.equal(isBlockingBumpIssue(null), false);
});

test('duplicar: el nombre de la copia respeta el maximo', () => {
  assert.equal(copyName('Curso'), 'Curso (copia)');
  assert.equal(copyName('x'.repeat(120)).length, 120);
});
