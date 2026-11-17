import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assetFilePath, libraryKey, libraryMimeFor, signLibraryIntent, verifyAssetKey, verifyLibraryFile, verifyLibraryIntent } from './library';

const secret = 'x'.repeat(32);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const mp4 = new Uint8Array([0, 0, 0, 0x18, ...Buffer.from('ftypisom')]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('P22: solo JPG y MP4, decidido por los bytes', () => {
  assert.equal(libraryMimeFor('image/jpeg', 'a.jpg'), 'image/jpeg');
  assert.equal(libraryMimeFor('', 'clip.MP4'), 'video/mp4');
  assert.equal(libraryMimeFor('image/png', 'a.png'), null);
  assert.deepEqual(verifyLibraryFile(jpeg, 1000, 'image/jpeg'), { ok: true });
  assert.deepEqual(verifyLibraryFile(mp4, 1000, 'video/mp4'), { ok: true });
  assert.equal(verifyLibraryFile(png, 1000, 'image/jpeg').ok, false, 'un PNG renombrado a .jpg se rechaza');
  assert.equal(verifyLibraryFile(jpeg, 9 * 1024 * 1024, 'image/jpeg').ok, false);
  assert.equal(verifyLibraryFile(jpeg, 0, 'image/jpeg').ok, false);
});

test('P22: la intención de subida es del workspace, vence y no se falsifica', () => {
  const key = libraryKey('ws1', 'image/jpeg');
  assert.match(key, /^content\/ws1\/[0-9a-f-]{36}\.jpg$/);
  const token = signLibraryIntent({ workspaceId: 'ws1', key, contentType: 'image/jpeg' }, secret, 1_000);
  assert.equal(verifyLibraryIntent(token, 'ws1', secret, 2_000)?.key, key);
  assert.equal(verifyLibraryIntent(token, 'ws2', secret, 2_000), null, 'otro workspace');
  assert.equal(verifyLibraryIntent(token, 'ws1', secret, 1_000 + 16 * 60_000), null, 'vencida');
  assert.equal(verifyLibraryIntent(token, 'ws1', 'y'.repeat(32), 2_000), null, 'otra firma');
  const forged = signLibraryIntent({ workspaceId: 'ws1', key: 'content/ws2/a.jpg', contentType: 'image/jpeg' }, secret, 1_000);
  assert.equal(verifyLibraryIntent(forged, 'ws1', secret, 2_000), null, 'clave fuera de su carpeta');
});

test('P22: la URL pública lleva la firma de esa pieza', () => {
  const path = assetFilePath('asset1', secret);
  const k = new URL(`http://x${path}`).searchParams.get('k');
  assert.equal(verifyAssetKey('asset1', k, secret), true);
  assert.equal(verifyAssetKey('asset2', k, secret), false);
  assert.equal(verifyAssetKey('asset1', null, secret), false);
});
