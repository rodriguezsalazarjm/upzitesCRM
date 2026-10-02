import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { StorageNotConfiguredError, resolveStorage, storageStatus } from './index';
import { LOCAL_MEDIA_DIR } from './filesystem';

/**
 * El almacenamiento guarda archivos de clientes. Dos cosas se prueban aqui: que
 * una clave manipulada no pueda salir del directorio, y que la falta de
 * configuracion se note en vez de fingir que el archivo quedo guardado.
 */

const original = { ...process.env };
const LOCAL_ROOT = join(process.cwd(), LOCAL_MEDIA_DIR);

function withEnv(values: Record<string, string | undefined>) {
  for (const key of [
    'MEDIA_STORAGE_DRIVER',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'MEDIA_STORAGE_BUCKET',
    'NODE_ENV',
  ]) {
    delete process.env[key];
  }
  Object.assign(process.env, values);
}

function localEnv() {
  withEnv({ MEDIA_STORAGE_DRIVER: 'filesystem', NODE_ENV: 'test' });
}

/** Cada prueba escribe bajo su propio prefijo para no pisarse con las demas. */
function scratchKey(name: string) {
  return `pruebas/${randomUUID()}/${name}`;
}

test.afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in original)) delete process.env[key];
  }
  Object.assign(process.env, original);
});

test.after(async () => {
  await rm(join(LOCAL_ROOT, 'pruebas'), { recursive: true, force: true });
});

test('el disco local guarda, devuelve y borra el mismo contenido', async () => {
  localEnv();

  const storage = await resolveStorage();
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  const key = scratchKey('archivo.bin');

  await storage.put(key, bytes, 'application/octet-stream');

  const stored = await storage.get(key);
  assert.deepEqual(stored?.bytes, bytes);

  // Quedo donde decia, no en otro lado.
  assert.deepEqual(new Uint8Array(await readFile(join(LOCAL_ROOT, key))), bytes);

  await storage.remove(key);
  assert.equal(await storage.get(key), null);
});

test('una clave que intenta salir del directorio no se escribe', async () => {
  localEnv();

  const storage = await resolveStorage();
  const hostiles = [
    '../fuera.bin',
    'workspaces/../../fuera.bin',
    '/etc/passwd',
    'workspaces//doble.bin',
    'workspaces/ws-1/archivo con espacio.bin',
  ];

  for (const key of hostiles) {
    await assert.rejects(
      () => storage.put(key, new Uint8Array([0]), 'application/octet-stream'),
      key,
    );
  }
});

test('leer algo que no existe devuelve null, no un error', async () => {
  localEnv();

  assert.equal(await (await resolveStorage()).get(scratchKey('no-esta.bin')), null);
});

test('en produccion el disco local no cuenta como almacenamiento', async () => {
  withEnv({ MEDIA_STORAGE_DRIVER: 'filesystem', NODE_ENV: 'production' });

  const status = storageStatus();
  assert.equal(status.configured, false);
  // El motivo tiene que servirle a quien configura el sistema.
  assert.match(status.reason ?? '', /efimero/i);
  await assert.rejects(() => resolveStorage(), StorageNotConfiguredError);
});

test('sin configuracion en produccion se falla y se dice que falta', () => {
  withEnv({ NODE_ENV: 'production' });

  const status = storageStatus();
  assert.equal(status.configured, false);
  assert.match(status.reason ?? '', /SUPABASE_SERVICE_ROLE_KEY/);
});

test('con las variables de Supabase se elige ese destino', async () => {
  withEnv({
    NODE_ENV: 'production',
    SUPABASE_URL: 'https://proyecto.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'clave-de-prueba',
  });

  assert.equal(storageStatus().driver, 'supabase');
  assert.equal((await resolveStorage()).name, 'supabase');
});

test('pedir Supabase sin sus claves no cae en silencio al disco', () => {
  withEnv({ NODE_ENV: 'production', MEDIA_STORAGE_DRIVER: 'supabase' });

  const status = storageStatus();
  assert.equal(status.configured, false);
  assert.match(status.reason ?? '', /SUPABASE_URL/);
});

test('Supabase: un objeto inexistente llega como 400 NoSuchKey y se trata como "no existe"', async () => {
  const { isMissingObject } = await import('./index');
  const notFound400 = new Response(JSON.stringify({ statusCode: '404', error: 'not_found', message: 'Object not found', code: 'NoSuchKey' }), { status: 400 });
  assert.equal(await isMissingObject(notFound400), true);
  assert.equal(await isMissingObject(new Response(null, { status: 404 })), true);
  // Otros 400 (p. ej. tipo no permitido por el bucket) siguen siendo errores.
  assert.equal(await isMissingObject(new Response(JSON.stringify({ statusCode: '415', error: 'invalid_mime_type' }), { status: 400 })), false);
  assert.equal(await isMissingObject(new Response('no json', { status: 400 })), false);
  assert.equal(await isMissingObject(new Response(null, { status: 500 })), false);
});

test('Supabase: leer o borrar un objeto que ya no existe no lanza', async () => {
  withEnv({ SUPABASE_URL: 'https://proyecto.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'clave-de-prueba', MEDIA_STORAGE_BUCKET: 'media', NODE_ENV: 'test' });
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ statusCode: '404', code: 'NoSuchKey' }), { status: 400 })) as typeof fetch;
  try {
    const storage = await resolveStorage();
    assert.equal(storage.name, 'supabase');
    assert.equal(await storage.get('products/ws/p/x.png'), null);
    await storage.remove('products/ws/p/x.png');
  } finally {
    globalThis.fetch = original;
  }
});

test('Supabase: SUPABASE_URL con ruta (/rest/v1/) se reduce al origen del proyecto', async () => {
  const { supabaseOrigin } = await import('./index');
  assert.equal(supabaseOrigin('https://ref.supabase.co/rest/v1/'), 'https://ref.supabase.co');
  assert.equal(supabaseOrigin(' https://ref.supabase.co/ '), 'https://ref.supabase.co');
  assert.equal(supabaseOrigin('https://ref.supabase.co'), 'https://ref.supabase.co');
  assert.equal(supabaseOrigin('no es una url'), undefined);
  assert.equal(supabaseOrigin(''), undefined);

  withEnv({ SUPABASE_URL: 'https://ref.supabase.co/rest/v1/', SUPABASE_SERVICE_ROLE_KEY: 'clave-de-prueba', MEDIA_STORAGE_BUCKET: 'media', NODE_ENV: 'test' });
  const original = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    seen.push(String(input));
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  try {
    await (await resolveStorage()).put('products/ws/p/x.png', new Uint8Array([1]), 'image/png');
    assert.equal(seen[0], 'https://ref.supabase.co/storage/v1/object/media/products/ws/p/x.png');
  } finally {
    globalThis.fetch = original;
  }
});
