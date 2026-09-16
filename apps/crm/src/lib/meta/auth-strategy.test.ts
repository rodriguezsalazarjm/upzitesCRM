import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metaAuthorizationSchema, metaAuthRequirements } from './auth-strategy';
test('Instagram Login does not require a Page and cannot authorize Messenger', () => {
  assert.equal(metaAuthRequirements('INSTAGRAM').pageRequired, false);
  assert.equal(metaAuthRequirements('MESSENGER').tokenType, 'PAGE');
  assert.throws(() => metaAuthRequirements('MESSENGER', 'INSTAGRAM_LOGIN'));
  assert.equal(metaAuthorizationSchema.safeParse({ mechanism: 'INSTAGRAM_LOGIN', channel: 'INSTAGRAM', tokenType: 'INSTAGRAM_USER', instagramAccountId: 'ig' }).success, true);
  assert.equal(metaAuthorizationSchema.safeParse({ mechanism: 'FACEBOOK_LOGIN', channel: 'INSTAGRAM', tokenType: 'PAGE', pageId: 'page' }).success, false);
});
