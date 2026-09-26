import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyPayment, SAAS_SUBSCRIPTION_KIND } from './payment-class';

test('pedido marcado explicitamente → commerce', () => {
  assert.equal(classifyPayment({ kind: 'order', orderId: 'o1' }), 'order');
});

test('suscripcion SaaS marcada explicitamente → billing SaaS', () => {
  assert.equal(classifyPayment({ kind: SAAS_SUBSCRIPTION_KIND }), 'saas_subscription');
});

test('fail-closed: sin marca, marca vieja o metadata vacia → desconocido', () => {
  assert.equal(classifyPayment({ planKey: 'monthly' }), 'unknown');
  assert.equal(classifyPayment({ kind: 'subscription' }), 'unknown');
  assert.equal(classifyPayment({ kind: 'otra-cosa' }), 'unknown');
  assert.equal(classifyPayment({}), 'unknown');
  assert.equal(classifyPayment(null), 'unknown');
  assert.equal(classifyPayment(undefined), 'unknown');
});

test('preferencia SaaS legacy conocida → billing SaaS', () => {
  assert.equal(classifyPayment({ kind: 'subscription' }, { knownLegacySaasPreference: true }), 'saas_subscription');
  assert.equal(classifyPayment(null, { knownLegacySaasPreference: true }), 'saas_subscription');
});

test('un pedido nunca se reclasifica como SaaS, aunque la preferencia coincida', () => {
  assert.equal(classifyPayment({ kind: 'order' }, { knownLegacySaasPreference: true }), 'order');
});
