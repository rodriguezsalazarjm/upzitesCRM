import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createMetaOAuthState, verifyMetaOAuthState } from './meta-oauth-state';

const secret = 'test-secret-32-bytes-minimum-ok';

test('un state recien creado es valido y trae de vuelta workspaceId/userId/nonce/channel', () => {
  const { state, nonce } = createMetaOAuthState(
    { workspaceId: 'ws_1', userId: 'user_1', channel: 'INSTAGRAM' },
    secret,
  );
  const result = verifyMetaOAuthState(state, secret, 'INSTAGRAM');
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.equal(result.payload.workspaceId, 'ws_1');
  assert.equal(result.payload.userId, 'user_1');
  assert.equal(result.payload.channel, 'INSTAGRAM');
  assert.equal(result.payload.nonce, nonce);
});

test('un state emitido para Instagram se rechaza en el callback de Messenger', () => {
  const { state } = createMetaOAuthState({ workspaceId: 'ws_1', userId: 'user_1', channel: 'INSTAGRAM' }, secret);
  const result = verifyMetaOAuthState(state, secret, 'MESSENGER');
  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.equal(result.reason, 'state emitido para otro canal');
});

test('un state firmado con otro secreto se rechaza', () => {
  const { state } = createMetaOAuthState({ workspaceId: 'ws_1', userId: 'user_1', channel: 'MESSENGER' }, secret);
  const result = verifyMetaOAuthState(state, 'otro-secreto-distinto-32-bytes', 'MESSENGER');
  assert.equal(result.valid, false);
});

test('un payload alterado con la misma firma se rechaza', () => {
  const { state } = createMetaOAuthState({ workspaceId: 'ws_1', userId: 'user_1', channel: 'MESSENGER' }, secret);
  const [, signature] = state.split('.');
  const tampered = `${Buffer.from(JSON.stringify({ workspaceId: 'ws_ATTACKER', userId: 'user_1', channel: 'MESSENGER', nonce: 'x', exp: Date.now() + 60_000 })).toString('base64url')}.${signature}`;
  const result = verifyMetaOAuthState(tampered, secret, 'MESSENGER');
  assert.equal(result.valid, false);
});

test('un state vencido se rechaza aunque la firma sea correcta', () => {
  const body = Buffer.from(
    JSON.stringify({ workspaceId: 'ws_1', userId: 'user_1', channel: 'INSTAGRAM', nonce: 'x', exp: Date.now() - 1000 }),
  ).toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  const result = verifyMetaOAuthState(`${body}.${signature}`, secret, 'INSTAGRAM');
  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.equal(result.reason, 'state vencido');
});

test('un state malformado (sin punto separador) se rechaza sin lanzar', () => {
  const result = verifyMetaOAuthState('no-es-un-state-valido', secret, 'INSTAGRAM');
  assert.equal(result.valid, false);
});

test('dos states para el mismo workspace nunca comparten nonce', () => {
  const a = createMetaOAuthState({ workspaceId: 'ws_1', userId: 'user_1', channel: 'INSTAGRAM' }, secret);
  const b = createMetaOAuthState({ workspaceId: 'ws_1', userId: 'user_1', channel: 'INSTAGRAM' }, secret);
  assert.notEqual(a.nonce, b.nonce);
});
