import test from 'node:test';
import assert from 'node:assert/strict';
import { isIgnoredIgChange, isIgnoredIgMessaging } from './inbound';

const ACCOUNT = 'ig_business';

test('DM real de un cliente se procesa', () => {
  assert.equal(isIgnoredIgMessaging(ACCOUNT, { sender: { id: 'cliente' }, message: { text: 'hola' } }), false);
  assert.equal(isIgnoredIgMessaging(ACCOUNT, { sender: { id: 'cliente' }, story_mention: { id: 's1' } }), false);
});

test('eco de lo que envio la cuenta y eventos sin mensaje se ignoran', () => {
  assert.equal(isIgnoredIgMessaging(ACCOUNT, { sender: { id: ACCOUNT }, message: { text: 'respuesta del bot' } }), true);
  assert.equal(isIgnoredIgMessaging(ACCOUNT, { sender: { id: 'cliente' }, message: { text: 'x', is_echo: true } }), true);
  assert.equal(isIgnoredIgMessaging(ACCOUNT, { sender: { id: 'cliente' } }), true); // read / reaction
  assert.equal(isIgnoredIgMessaging(ACCOUNT, {}), true);
});

test('comentarios: se procesan los de terceros, no las respuestas propias ni otros campos', () => {
  assert.equal(isIgnoredIgChange(ACCOUNT, { field: 'comments', value: { id: 'c1', from: { id: 'cliente' } } }), false);
  assert.equal(isIgnoredIgChange(ACCOUNT, { field: 'live_comments', value: { id: 'c2', from: { id: 'cliente' } } }), false);
  assert.equal(isIgnoredIgChange(ACCOUNT, { field: 'comments', value: { id: 'c3', from: { id: ACCOUNT } } }), true);
  assert.equal(isIgnoredIgChange(ACCOUNT, { field: 'mentions', value: { id: 'c4', from: { id: 'cliente' } } }), true);
});
