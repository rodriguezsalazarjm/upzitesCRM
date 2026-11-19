import test from 'node:test';
import assert from 'node:assert/strict';
import { choosePrivacy, interpretPublishStatus, tiktokError } from './tiktok-publish';
import { missingTikTokScopes, TIKTOK_OAUTH_SCOPES } from '../tiktok/oauth';

test('sin auditoria siempre privado; auditada pide publico si esta disponible', () => {
  const options = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'];
  assert.equal(choosePrivacy(options, false), 'SELF_ONLY');
  assert.equal(choosePrivacy(options, true), 'PUBLIC_TO_EVERYONE');
  assert.equal(choosePrivacy(['FOLLOWER_OF_CREATOR'], true), 'FOLLOWER_OF_CREATOR', 'cuenta privada: la unica opcion que da TikTok');
});

test('estado de publicacion: completo, privado, fallido, en bandeja y en proceso', () => {
  assert.deepEqual(interpretPublishStatus({ status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [7311] }, 'p1'), { ok: true, externalPostId: '7311', permalink: null });
  assert.deepEqual(interpretPublishStatus({ status: 'PUBLISH_COMPLETE' }, 'p1'), { ok: true, externalPostId: 'publish:p1', permalink: null });
  const failed = interpretPublishStatus({ status: 'FAILED', fail_reason: 'file_format_check_failed' }, 'p1');
  assert.ok(failed && !failed.ok && /file_format_check_failed/.test(failed.error) && !failed.retryable && failed.containerId === null);
  const inbox = interpretPublishStatus({ status: 'SEND_TO_USER_INBOX' }, 'p1');
  assert.ok(inbox && !inbox.ok && !inbox.retryable);
  assert.equal(interpretPublishStatus({ status: 'PROCESSING_DOWNLOAD' }, 'p1'), null);
});

test('errores de TikTok: texto claro y reintento solo cuando sirve', () => {
  assert.deepEqual(tiktokError('rate_limit_exceeded', ''), { error: 'TikTok limitó las publicaciones por ahora; se reintenta solo.', retryable: true, reauth: false });
  assert.equal(tiktokError('access_token_invalid', '').reauth, true);
  assert.equal(tiktokError('url_ownership_unverified', '').retryable, false);
  assert.equal(tiktokError('algo_nuevo', 'detalle', 503).retryable, true);
  assert.equal(tiktokError('algo_nuevo', 'detalle', 400).error, 'TikTok: detalle');
});

test('scopes concedidos de TikTok', () => {
  assert.deepEqual(missingTikTokScopes(TIKTOK_OAUTH_SCOPES.join(',')), []);
  assert.deepEqual(missingTikTokScopes('user.info.basic,video.list'), ['user.info.stats', 'video.publish']);
});
