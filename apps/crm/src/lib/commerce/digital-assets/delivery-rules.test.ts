import assert from 'node:assert/strict';
import test from 'node:test';
import { checkAccess, deriveDeliveryToken, isWellFormedToken, stateAfterAttempt } from './delivery-rules';

const SECRET = 'secreto-de-prueba-de-32-caracteres!!';

test('el token es largo, impredecible sin el secreto y cambia con la version', () => {
  const token = deriveDeliveryToken('entrega-1', 1, SECRET);
  assert.equal(token.length, 43);
  assert.equal(isWellFormedToken(token), true);
  assert.equal(deriveDeliveryToken('entrega-1', 1, SECRET), token, 'determinista para la misma entrega y version');
  assert.notEqual(deriveDeliveryToken('entrega-1', 2, SECRET), token, 'otra version, otro token');
  assert.notEqual(deriveDeliveryToken('entrega-2', 1, SECRET), token, 'otra entrega, otro token');
  assert.notEqual(deriveDeliveryToken('entrega-1', 1, 'otro-secreto-de-32-caracteres!!!!!'), token, 'sin el secreto no se reproduce');
});

test('tokens mal formados ni siquiera llegan a la base', () => {
  for (const bad of [undefined, '', 'corto', 'a'.repeat(200), '../../etc', 'token con espacios que es largo xxxxxxxx', 'abc$%&'.repeat(10)]) {
    assert.equal(isWellFormedToken(bad), false, String(bad));
  }
});

test('estado tras un intento: SENT solo si un canal lo envio', () => {
  assert.deepEqual(stateAfterAttempt('AVAILABLE', { whatsapp: false, email: true }), { status: 'SENT', error: null });
  assert.deepEqual(stateAfterAttempt('FAILED', { whatsapp: true, email: false }), { status: 'SENT', error: null }, 'un reintento exitoso recupera');
  const failed = stateAfterAttempt('AVAILABLE', { whatsapp: false, email: false, failures: ['El email no se pudo enviar.'] });
  assert.equal(failed.status, 'FAILED');
  assert.match(failed.error ?? '', /email/);
  assert.equal(stateAfterAttempt('AVAILABLE', { error: 'boom' }).status, 'FAILED');
  const noChannel = stateAfterAttempt('AVAILABLE', { whatsapp: false, email: false, skipped: ['Email no enviado (NO_IDENTIFIER).'] });
  assert.equal(noChannel.status, 'AVAILABLE', 'sin canal no se finge envio ni fallo');
  assert.match(noChannel.error ?? '', /Sin envío automático/);
  assert.equal(stateAfterAttempt('SENT', { whatsapp: false, email: false, skipped: [] }).status, 'SENT', 'un reenvio sin canal no borra que antes se envio');
});

const live = { status: 'AVAILABLE' as const, revokedAt: null, expiresAt: new Date(Date.now() + 86_400_000), downloadCount: 0, maxDownloads: 20, itemCount: 3 };

test('acceso: revocada o vencida bloquea; FAILED no (el comprador ya pago)', () => {
  assert.deepEqual(checkAccess(live), { ok: true });
  assert.deepEqual(checkAccess({ ...live, status: 'FAILED' }), { ok: true });
  assert.deepEqual(checkAccess({ ...live, status: 'SENT' }), { ok: true });
  assert.deepEqual(checkAccess({ ...live, status: 'REVOKED' }), { ok: false, reason: 'REVOKED' });
  assert.deepEqual(checkAccess({ ...live, revokedAt: new Date() }), { ok: false, reason: 'REVOKED' });
  assert.deepEqual(checkAccess({ ...live, expiresAt: new Date(Date.now() - 1000) }), { ok: false, reason: 'EXPIRED' });
  assert.deepEqual(checkAccess({ ...live, downloadCount: 60 }), { ok: false, reason: 'LIMIT_REACHED' }, 'tope = 20 por archivo x 3');
  assert.deepEqual(checkAccess({ ...live, downloadCount: 59 }), { ok: true });
});
