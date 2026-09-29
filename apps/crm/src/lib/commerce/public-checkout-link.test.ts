import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PUBLIC_CHECKOUT_TTL_MS,
  buyerFacingCheckoutUrl,
  isAllowedPaymentRedirect,
  maskEmail,
  publicCheckoutUrl,
  signCheckoutToken,
  verifyCheckoutToken,
} from './public-checkout-link';

const SECRET = 'x'.repeat(64);
const now = new Date('2026-09-29T12:00:00Z');

test('un token firmado vale solo para su pedido y hasta su vencimiento', () => {
  const token = signCheckoutToken('order-a', now, SECRET);
  assert.deepEqual(verifyCheckoutToken('order-a', token, now, SECRET), { ok: true });
  assert.deepEqual(verifyCheckoutToken('order-b', token, now, SECRET), { ok: false, reason: 'INVALID' });
  assert.deepEqual(verifyCheckoutToken('order-a', token, now, 'y'.repeat(64)), { ok: false, reason: 'INVALID' });
  const later = new Date(now.getTime() + PUBLIC_CHECKOUT_TTL_MS + 1000);
  assert.deepEqual(verifyCheckoutToken('order-a', token, later, SECRET), { ok: false, reason: 'EXPIRED' });
});

test('tokens mal formados o manipulados se rechazan sin revelar vencimiento', () => {
  const token = signCheckoutToken('order-a', now, SECRET);
  const [expiry, sig] = token.split('.');
  const extended = `${(Number.parseInt(expiry, 36) + 86_400).toString(36)}.${sig}`;
  const flipped = `${expiry}.${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`;
  for (const bad of [null, undefined, '', 'abc', `${expiry}.`, `.${sig}`, `${token}.x`, extended, flipped]) {
    assert.deepEqual(verifyCheckoutToken('order-a', bad, now, SECRET), { ok: false, reason: 'INVALID' }, String(bad));
  }
  // Firma ajena + vencido: INVALID, no EXPIRED.
  const later = new Date(now.getTime() + PUBLIC_CHECKOUT_TTL_MS * 2);
  assert.deepEqual(verifyCheckoutToken('order-b', token, later, SECRET), { ok: false, reason: 'INVALID' });
});

test('la URL publica lleva token y marca de retorno r (no "status", que agrega Mercado Pago)', () => {
  const previous = process.env.CRM_SESSION_SECRET;
  process.env.CRM_SESSION_SECRET = SECRET;
  try {
    const url = new URL(publicCheckoutUrl('order-a', { result: 'failure', now }), 'http://localhost');
    assert.equal(url.pathname, '/checkout/order-a');
    assert.equal(url.searchParams.get('r'), 'failure');
    assert.equal(url.searchParams.has('status'), false);
    assert.deepEqual(verifyCheckoutToken('order-a', url.searchParams.get('t'), now, SECRET), { ok: true });
  } finally {
    if (previous === undefined) delete process.env.CRM_SESSION_SECRET;
    else process.env.CRM_SESSION_SECRET = previous;
  }
});

test('solo se redirige a Mercado Pago o a una ruta relativa propia', () => {
  assert.equal(isAllowedPaymentRedirect('https://www.mercadopago.cl/checkout/v1/redirect?pref_id=1'), true);
  assert.equal(isAllowedPaymentRedirect('https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=1'), true);
  assert.equal(isAllowedPaymentRedirect('/demo-checkout/abc'), true);
  assert.equal(isAllowedPaymentRedirect('//evil.test/x'), false);
  assert.equal(isAllowedPaymentRedirect('http://www.mercadopago.cl/x'), false);
  assert.equal(isAllowedPaymentRedirect('https://mercadopago.cl.evil.test/x'), false);
  assert.equal(isAllowedPaymentRedirect('https://evilmercadopago.cl/x'), false);
  assert.equal(isAllowedPaymentRedirect('javascript:alert(1)'), false);
});

test('el email del comprador se muestra enmascarado', () => {
  assert.equal(maskEmail('cliente@tienda.test'), 'cl•••@tienda.test');
  assert.equal(maskEmail('a@b.test'), 'a•••@b.test');
  assert.equal(maskEmail(null), null);
  assert.equal(maskEmail('sin-arroba'), null);
});

test('agente y automatizaciones seleccionan siempre publicUrl, nunca init_point/providerUrl', () => {
  const publicUrl = 'https://crm.upzites.test/checkout/order-a?t=firmado';
  assert.equal(
    buyerFacingCheckoutUrl({
      publicUrl,
      checkoutUrl: 'https://www.mercadopago.cl/checkout/v1/redirect?pref_id=legacy',
      providerUrl: 'https://www.mercadopago.cl/checkout/v1/redirect?pref_id=internal',
    }),
    publicUrl,
  );
});
