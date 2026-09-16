import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ALL_CAPABILITIES,
  CHANNEL_CAPABILITY_MATRIX,
  effectiveCapability,
  isCapabilityActive,
} from './capabilities';

describe('CHANNEL_CAPABILITY_MATRIX', () => {
  test('cubre las 17 capacidades para los 4 canales, sin huecos', () => {
    for (const channel of ['WHATSAPP', 'INSTAGRAM', 'MESSENGER', 'TIKTOK'] as const) {
      for (const capability of ALL_CAPABILITIES) {
        assert.ok(
          CHANNEL_CAPABILITY_MATRIX[channel][capability],
          `${channel} no declara ${capability}`,
        );
      }
    }
  });

  test('WhatsApp no tiene ninguna capacidad social (comentarios/stories/follow)', () => {
    const social: Array<keyof typeof CHANNEL_CAPABILITY_MATRIX.WHATSAPP> = [
      'COMMENT_TRIGGER',
      'STORY_REPLY_TRIGGER',
      'STORY_MENTION_TRIGGER',
      'FOLLOW_TRIGGER',
      'SHARE_TRIGGER',
      'LIVE_COMMENT_TRIGGER',
    ];
    for (const capability of social) {
      assert.equal(CHANNEL_CAPABILITY_MATRIX.WHATSAPP[capability], 'NOT_SUPPORTED');
    }
  });

  test('TikTok no declara ninguna capacidad como SUPPORTED sin aprobacion (todo requiere Business Messaging API)', () => {
    const values = Object.values(CHANNEL_CAPABILITY_MATRIX.TIKTOK);
    assert.ok(!values.includes('SUPPORTED'), 'TikTok no deberia tener capacidades SUPPORTED de fabrica');
  });

  test('Instagram Follow/Share-to-DM quedan PREPARED_BUT_EXTERNAL_APPROVAL, nunca SUPPORTED de fabrica', () => {
    assert.equal(CHANNEL_CAPABILITY_MATRIX.INSTAGRAM.FOLLOW_TRIGGER, 'PREPARED_BUT_EXTERNAL_APPROVAL');
    assert.equal(CHANNEL_CAPABILITY_MATRIX.INSTAGRAM.SHARE_TRIGGER, 'PREPARED_BUT_EXTERNAL_APPROVAL');
  });
});

describe('effectiveCapability', () => {
  test('NOT_SUPPORTED nunca cambia, conectado o no', () => {
    assert.equal(effectiveCapability('WHATSAPP', true, [], 'FOLLOW_TRIGGER'), 'NOT_SUPPORTED');
    assert.equal(effectiveCapability('WHATSAPP', false, [], 'FOLLOW_TRIGGER'), 'NOT_SUPPORTED');
  });

  test('SUPPORTED de fabrica exige que la conexion este conectada', () => {
    assert.equal(effectiveCapability('WHATSAPP', true, [], 'SEND_DM'), 'SUPPORTED');
    assert.equal(effectiveCapability('WHATSAPP', false, [], 'SEND_DM'), 'PREPARED_BUT_EXTERNAL_APPROVAL');
  });

  test('PREPARED_BUT_EXTERNAL_APPROVAL solo pasa a SUPPORTED si la conexion lo confirmo', () => {
    assert.equal(effectiveCapability('INSTAGRAM', true, [], 'FOLLOW_TRIGGER'), 'PREPARED_BUT_EXTERNAL_APPROVAL');
    assert.equal(
      effectiveCapability('INSTAGRAM', true, ['FOLLOW_TRIGGER'], 'FOLLOW_TRIGGER'),
      'SUPPORTED',
    );
  });

  test('una cuenta desconectada nunca reporta una capacidad beta como activa, aunque este en la lista', () => {
    assert.equal(
      effectiveCapability('INSTAGRAM', false, ['FOLLOW_TRIGGER'], 'FOLLOW_TRIGGER'),
      'PREPARED_BUT_EXTERNAL_APPROVAL',
    );
  });
});

describe('isCapabilityActive', () => {
  test('solo true cuando la capacidad esta realmente lista para usar', () => {
    assert.equal(isCapabilityActive('WHATSAPP', true, [], 'SEND_DM'), true);
    assert.equal(isCapabilityActive('TIKTOK', true, ['SEND_DM'], 'SEND_DM'), true);
    assert.equal(isCapabilityActive('TIKTOK', true, [], 'SEND_DM'), false);
    assert.equal(isCapabilityActive('WHATSAPP', true, [], 'FOLLOW_TRIGGER'), false);
  });
});
