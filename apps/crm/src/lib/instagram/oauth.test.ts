import test from 'node:test';
import assert from 'node:assert/strict';
import { INSTAGRAM_OAUTH_SCOPES, missingInstagramScopes, parseGrantedScopes } from './oauth';

test('permisos concedidos: acepta array o texto con comas; sin dato devuelve null', () => {
  assert.deepEqual(parseGrantedScopes(['a', 'b']), ['a', 'b']);
  assert.deepEqual(parseGrantedScopes('a, b,'), ['a', 'b']);
  assert.equal(parseGrantedScopes(undefined), null);
});

test('detecta el permiso que el usuario desmarco al autorizar', () => {
  assert.deepEqual(missingInstagramScopes(INSTAGRAM_OAUTH_SCOPES.join(',')), []);
  const sinComentarios = INSTAGRAM_OAUTH_SCOPES.filter((s) => s !== 'instagram_business_manage_comments').join(',');
  assert.deepEqual(missingInstagramScopes(sinComentarios), ['instagram_business_manage_comments']);
  assert.equal(missingInstagramScopes(null).length, INSTAGRAM_OAUTH_SCOPES.length);
});
