import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { createMercadoPagoOAuthState, verifyMercadoPagoOAuthState } from './mercado-pago-oauth-state';

const SECRET = 'client-secret-de-prueba';

test('un state recien creado es valido y trae el workspace/usuario correctos', () => {
  const { state, nonce } = createMercadoPagoOAuthState({ workspaceId: 'ws-a', userId: 'user-a' }, SECRET);
  const result = verifyMercadoPagoOAuthState(state, SECRET);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.payload.workspaceId, 'ws-a');
    assert.equal(result.payload.userId, 'user-a');
    assert.equal(result.payload.nonce, nonce);
  }
});

test('un state firmado con un secreto distinto es invalido', () => {
  const { state } = createMercadoPagoOAuthState({ workspaceId: 'ws-a', userId: 'user-a' }, SECRET);
  const result = verifyMercadoPagoOAuthState(state, 'otro-secreto');
  assert.equal(result.valid, false);
});

test('un state manipulado (payload distinto a la firma) es invalido', () => {
  const { state } = createMercadoPagoOAuthState({ workspaceId: 'ws-a', userId: 'user-a' }, SECRET);
  const [body, signature] = state.split('.');
  const tamperedPayload = Buffer.from(
    JSON.stringify({ workspaceId: 'ws-b', userId: 'user-a', nonce: 'x', exp: Date.now() + 60_000 }),
  ).toString('base64url');
  const result = verifyMercadoPagoOAuthState(`${tamperedPayload}.${signature}`, SECRET);
  assert.equal(result.valid, false);
  assert.notEqual(body, tamperedPayload);
});

test('un state vencido es invalido aunque la firma sea correcta', () => {
  const past = Date.now() - 1000;
  const payload = { workspaceId: 'ws-a', userId: 'user-a', nonce: 'nonce-1', exp: past };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', SECRET).update(body).digest('base64url');
  const result = verifyMercadoPagoOAuthState(`${body}.${signature}`, SECRET);
  assert.deepEqual(result, { valid: false, reason: 'state vencido' });
});

test('un state con formato invalido (sin punto) se rechaza sin lanzar', () => {
  const result = verifyMercadoPagoOAuthState('esto-no-es-un-state', SECRET);
  assert.equal(result.valid, false);
});

test('dos states para el mismo workspace nunca comparten nonce', () => {
  const first = createMercadoPagoOAuthState({ workspaceId: 'ws-a', userId: 'user-a' }, SECRET);
  const second = createMercadoPagoOAuthState({ workspaceId: 'ws-a', userId: 'user-a' }, SECRET);
  assert.notEqual(first.nonce, second.nonce);
});
