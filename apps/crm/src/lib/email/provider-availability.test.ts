import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { PROVIDER_UNAVAILABLE } from './provider';
import { createResendProvider } from './resend';
import { clearScriptedOutbox, createScriptedProvider, scriptedEmailAllowed, scriptedOutbox } from './scripted';

const env = process.env as Record<string, string | undefined>;
const original = { NODE_ENV: env.NODE_ENV, EMAIL_PROVIDER: env.EMAIL_PROVIDER, RESEND_API_KEY: env.RESEND_API_KEY };

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  clearScriptedOutbox();
});

const mail = { from: 'hola@tienda.test', to: 'cliente@tienda.test', subject: 'Tu compra', html: '<p>ok</p>', text: 'ok', idempotencyKey: 'msg-1' };

test('produccion sin proveedor: el guionado no reporta envio y no deja nada en el outbox', async () => {
  // Es lo que devuelve defaultProvider()/providerFor(SCRIPTED) sin RESEND_API_KEY.
  // El camino completo por sendEmail (EmailMessage FAILED) lo cubre smoke-commerce-ledger.
  env.NODE_ENV = 'production';
  const provider = createScriptedProvider();
  assert.equal(provider.configured, false);
  const result = await provider.send(mail);
  assert.deepEqual(result, { ok: false, error: PROVIDER_UNAVAILABLE, retryable: true });
  assert.equal(scriptedOutbox().length, 0);
});

test('produccion: el guionado tampoco verifica dominios ni acepta webhooks', async () => {
  env.NODE_ENV = 'production';
  const provider = createScriptedProvider();
  assert.equal((await provider.verifyDomain('tienda.test')).status, 'FAILED');
  assert.equal(provider.verifySignature('{}', new Headers()).valid, false);
});

test('produccion con Resend sin API key: FAILED / PROVIDER_UNAVAILABLE, reintentable', async () => {
  env.NODE_ENV = 'production';
  const result = await createResendProvider('').send(mail);
  assert.deepEqual(result, { ok: false, error: PROVIDER_UNAVAILABLE, retryable: true });
});

test('dev/test: el guionado sigue enviando de forma determinista', async () => {
  env.NODE_ENV = 'test';
  assert.equal(scriptedEmailAllowed(), true);
  const provider = createScriptedProvider();
  const first = await provider.send(mail);
  const second = await provider.send(mail);
  assert.equal(first.ok, true);
  assert.deepEqual(first, second);
  assert.equal(scriptedOutbox().length, 2);
});

test('scriptedEmailAllowed depende solo del entorno de ejecucion', () => {
  assert.equal(scriptedEmailAllowed({ NODE_ENV: 'development' }), true);
  assert.equal(scriptedEmailAllowed({ NODE_ENV: 'test' }), true);
  assert.equal(scriptedEmailAllowed({}), true);
  assert.equal(scriptedEmailAllowed({ NODE_ENV: 'production' }), false);
});
