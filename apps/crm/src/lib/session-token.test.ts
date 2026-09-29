import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken, readSessionToken, sessionVersionMatches, signSessionPayload } from './session-token';

const NOW = 1_800_000_000;

test('cookie v2: se lee con workspace activo y sin soporte', () => {
  const token = createSessionToken({ userId: 'u1', activeWorkspaceId: 'w1', sessionVersion: 0 }, NOW);
  assert.deepEqual(readSessionToken(token, NOW), {
    version: 2,
    userId: 'u1',
    activeWorkspaceId: 'w1',
    supportSessionId: null,
    sessionVersion: 0,
    exp: NOW + 60 * 60 * 24 * 7,
  });
});

test('cookie v2: conserva la SupportSession', () => {
  const token = createSessionToken({ userId: 'u1', activeWorkspaceId: 'w2', supportSessionId: 's1', sessionVersion: 0 }, NOW);
  assert.equal(readSessionToken(token, NOW)?.supportSessionId, 's1');
});

test('cookie v1 heredada: su workspace pasa a ser el activo (sin logout)', () => {
  const token = signSessionPayload({ userId: 'u1', workspaceId: 'w1', role: 'OWNER', exp: NOW + 60 });
  const session = readSessionToken(token, NOW);
  assert.equal(session?.version, 1);
  assert.equal(session?.userId, 'u1');
  assert.equal(session?.activeWorkspaceId, 'w1');
  assert.equal(session?.supportSessionId, null);
  assert.equal(session?.sessionVersion, 0);
});

test('cookie v1 sin workspace se rechaza', () => {
  const token = signSessionPayload({ userId: 'u1', exp: NOW + 60 });
  assert.equal(readSessionToken(token, NOW), null);
});

test('firma invalida se rechaza', () => {
  const token = createSessionToken({ userId: 'u1', activeWorkspaceId: 'w1', sessionVersion: 0 }, NOW);
  const [body] = token.split('.');
  assert.equal(readSessionToken(`${body}.firma-falsa`, NOW), null);

  // Cuerpo alterado con la firma original: tampoco pasa.
  const forged = Buffer.from(JSON.stringify({ v: 2, userId: 'u1', activeWorkspaceId: 'OTRO', exp: NOW + 60 })).toString('base64url');
  assert.equal(readSessionToken(`${forged}.${token.split('.')[1]}`, NOW), null);
});

test('sesion expirada se rechaza', () => {
  const token = createSessionToken({ userId: 'u1', activeWorkspaceId: 'w1', sessionVersion: 0 }, NOW - 60 * 60 * 24 * 8);
  assert.equal(readSessionToken(token, NOW), null);
});

test('token vacio o mal formado se rechaza', () => {
  assert.equal(readSessionToken(undefined, NOW), null);
  assert.equal(readSessionToken('', NOW), null);
  assert.equal(readSessionToken('sin-punto', NOW), null);
});

// --- sessionVersion ----------------------------------------------------------

test('cookie v2 legacy (sin sv) = version 0: valida para User.sessionVersion=0, sin logout masivo', () => {
  const legacy = signSessionPayload({ v: 2, userId: 'u1', activeWorkspaceId: 'w1', exp: NOW + 60 });
  const session = readSessionToken(legacy, NOW)!;
  assert.equal(session.sessionVersion, 0);
  assert.equal(sessionVersionMatches(session, { sessionVersion: 0 }), true);
  assert.equal(sessionVersionMatches(session, { sessionVersion: 1 }), false);
});

test('cookie nueva lleva la version emitida y solo vale con esa version', () => {
  const v0 = readSessionToken(createSessionToken({ userId: 'u1', activeWorkspaceId: 'w1', sessionVersion: 0 }, NOW), NOW)!;
  const v1 = readSessionToken(createSessionToken({ userId: 'u1', activeWorkspaceId: 'w1', sessionVersion: 1 }, NOW), NOW)!;
  assert.equal(sessionVersionMatches(v0, { sessionVersion: 0 }), true);
  assert.equal(sessionVersionMatches(v0, { sessionVersion: 1 }), false);
  assert.equal(sessionVersionMatches(v1, { sessionVersion: 1 }), true);
  assert.equal(sessionVersionMatches(v1, { sessionVersion: 2 }), false);
});

test('sv invalido (negativo, texto, decimal) se rechaza', () => {
  for (const sv of [-1, '1', 1.5, null]) {
    assert.equal(readSessionToken(signSessionPayload({ v: 2, userId: 'u1', activeWorkspaceId: 'w1', sv, exp: NOW + 60 }), NOW), null, String(sv));
  }
});
