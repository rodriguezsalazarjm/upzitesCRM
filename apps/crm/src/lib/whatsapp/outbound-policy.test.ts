import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inferOutboundOrigin,
  isOriginCompatibleWithSender,
  pausesOnHumanTakeover,
  shouldCancelAutomaticSend,
} from './outbound-policy';

test('clasifica payloads nuevos y conserva una política segura para SYSTEM antiguo', () => {
  assert.equal(inferOutboundOrigin({ origin: 'TRANSACTIONAL' }, 'SYSTEM'), 'TRANSACTIONAL');
  assert.equal(inferOutboundOrigin({}, 'AI'), 'AI');
  assert.equal(inferOutboundOrigin({}, 'SYSTEM'), 'AUTOMATION');
  assert.equal(inferOutboundOrigin({}, 'USER'), 'HUMAN');
});

test('la procedencia no puede disfrazar una respuesta automática como humana', () => {
  assert.equal(isOriginCompatibleWithSender('HUMAN', 'AI'), false);
  assert.equal(isOriginCompatibleWithSender('AI', 'AI'), true);
  assert.equal(isOriginCompatibleWithSender('TRANSACTIONAL', 'SYSTEM'), true);
  assert.equal(isOriginCompatibleWithSender('HUMAN', 'USER'), true);
});

test('la toma humana pausa IA, journeys y automatizaciones', () => {
  assert.equal(pausesOnHumanTakeover('AI'), true);
  assert.equal(pausesOnHumanTakeover('JOURNEY'), true);
  assert.equal(pausesOnHumanTakeover('AUTOMATION'), true);
  assert.equal(pausesOnHumanTakeover('HUMAN'), false);
  assert.equal(pausesOnHumanTakeover('TRANSACTIONAL'), false);
});

test('cancela una salida automática generada antes o durante takeover', () => {
  assert.equal(
    shouldCancelAutomaticSend({
      origin: 'AI',
      queuedLockVersion: 3,
      currentLockVersion: 4,
      conversationMode: 'AI_ACTIVE',
    }),
    true,
  );
  assert.equal(
    shouldCancelAutomaticSend({
      origin: 'JOURNEY',
      queuedLockVersion: 4,
      currentLockVersion: 4,
      conversationMode: 'HUMAN_ACTIVE',
    }),
    true,
  );
});

test('permite una salida automática vigente y no bloquea humano ni transaccional', () => {
  assert.equal(
    shouldCancelAutomaticSend({
      origin: 'AUTOMATION',
      queuedLockVersion: 5,
      currentLockVersion: 5,
      conversationMode: 'AI_ACTIVE',
    }),
    false,
  );
  for (const origin of ['HUMAN', 'TRANSACTIONAL'] as const) {
    assert.equal(
      shouldCancelAutomaticSend({
        origin,
        queuedLockVersion: 1,
        currentLockVersion: 9,
        conversationMode: 'HUMAN_ACTIVE',
      }),
      false,
    );
  }
});
