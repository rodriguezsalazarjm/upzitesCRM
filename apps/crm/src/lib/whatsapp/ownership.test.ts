import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertWhatsAppChannelOwnership,
  isWhatsAppChannelOwnershipConflict,
  WhatsAppChannelOwnershipError,
} from './ownership';

test('permite crear un numero libre o actualizarlo desde el mismo workspace', () => {
  assert.doesNotThrow(() => assertWhatsAppChannelOwnership(null, 'workspace-a'));
  assert.doesNotThrow(() => assertWhatsAppChannelOwnership('workspace-a', 'workspace-a'));
});

test('rechaza que otro workspace actualice el numero ya registrado', () => {
  assert.throws(
    () => assertWhatsAppChannelOwnership('workspace-a', 'workspace-b'),
    WhatsAppChannelOwnershipError,
  );
});

test('trata la colision unique de una conexion simultanea como conflicto de ownership', () => {
  assert.equal(isWhatsAppChannelOwnershipConflict({ code: 'P2002' }), true);
  assert.equal(isWhatsAppChannelOwnershipConflict({ code: 'P2025' }), false);
});
