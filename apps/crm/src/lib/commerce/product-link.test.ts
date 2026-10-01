import assert from 'node:assert/strict';
import test from 'node:test';
import { productCheckoutUrl, signProductKey, verifyProductKey } from './product-link';
import { coverBelongsTo, coverKey, CoverError, inspectCover, readCover } from './product-studio/cover';

const SECRET = 'a'.repeat(48);

test('enlace de compra: firma estable, atada al producto y al secreto', () => {
  const key = signProductKey('prod_1', SECRET);
  assert.equal(key, signProductKey('prod_1', SECRET), 'deterministica: el enlace no cambia');
  assert.equal(verifyProductKey('prod_1', key, SECRET), true);
  assert.equal(verifyProductKey('prod_2', key, SECRET), false, 'no sirve para otro producto');
  assert.equal(verifyProductKey('prod_1', signProductKey('prod_1', 'b'.repeat(48)), SECRET), false);
  for (const bad of [null, undefined, '', 'x', `${key}x`, key.slice(1)]) assert.equal(verifyProductKey('prod_1', bad, SECRET), false);
});

test('enlace de compra: ruta publica /comprar con la firma', () => {
  process.env.CRM_SESSION_SECRET ??= SECRET;
  const path = productCheckoutUrl('prod_1', { absolute: false });
  assert.match(path, /^\/comprar\/prod_1\?k=[A-Za-z0-9_-]{32}$/);
});

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);

test('portada: el tipo lo deciden los bytes; SVG/HTML y archivos grandes se rechazan', () => {
  assert.equal(inspectCover(PNG), 'image/png');
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.throws(() => inspectCover(svg), (error) => error instanceof CoverError && error.code === 'UNSUPPORTED');
  assert.throws(() => inspectCover(new TextEncoder().encode('<html><script></script></html>')), CoverError);
  assert.throws(() => inspectCover(new Uint8Array()), (error) => error instanceof CoverError && error.code === 'EMPTY');
  const big = new Uint8Array(5 * 1024 * 1024 + 1);
  big.set(PNG);
  assert.throws(() => inspectCover(big), (error) => error instanceof CoverError && error.code === 'TOO_LARGE');
});

test('portada: clave del servidor dentro de la carpeta del workspace y producto', () => {
  const key = coverKey('ws1', 'p1', 'image/png');
  assert.match(key, /^products\/ws1\/p1\/[0-9a-f-]{36}\.png$/);
  const cover = { key, mimeType: 'image/png', size: 1, uploadedAt: 'x' };
  assert.equal(coverBelongsTo(cover, 'ws1', 'p1'), true);
  assert.equal(coverBelongsTo(cover, 'ws2', 'p1'), false);
  assert.equal(readCover({ cover })?.key, key);
  assert.equal(readCover({ cover: { ...cover, mimeType: 'image/svg+xml' } }), null, 'un tipo no permitido en metadata no se sirve');
  assert.equal(readCover(null), null);
});
