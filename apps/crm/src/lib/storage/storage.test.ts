import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { StorageNotConfiguredError, resolveStorage, storageStatus } from './index';

/**
 * El almacenamiento guarda archivos de clientes. Dos cosas se prueban aqui: que
 * una clave manipulada no pueda salir del directorio, y que la falta de
 * configuracion se note en vez de fingir que el archivo quedo guardado.
 */

const original = { ...process.env };

function withEnv(values: Record<string, string | undefined>) {
  for (const key of ['MEDIA_STORAGE_DRIVER', 'MEDIA_STORAGE_DIR', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NODE_ENV']) {
    delete process.env[key];
  }
  Object.assign(process.env, values);
}

test.afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in original)) delete process.env[key];
  }
  Object.assign(process.env, original);
});

test('el disco local guarda, devuelve y borra el mismo contenido', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'crm-media-'));
  withEnv({ MEDIA_STORAGE_DRIVER: 'filesystem', MEDIA_STORAGE_DIR: dir, NODE_ENV: 'test' });

  const storage = resolveStorage();
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  const key = 'workspaces/ws-1/whatsapp/2026/09/archivo.bin';

  await storage.put(key, bytes, 'application/octet-stream');

  const stored = await storage.get(key);
  assert.deepEqual(stored?.bytes, bytes);

  // Quedo donde decia, no en otro lado.
  assert.deepEqual(new Uint8Array(await readFile(join(dir, key))), bytes);

  await storage.remove(key);
  assert.equal(await storage.get(key), null);

  await rm(dir, { recursive: true, force: true });
});

test('una clave que intenta salir del directorio no se escribe', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'crm-media-'));
  withEnv({ MEDIA_STORAGE_DRIVER: 'filesystem', MEDIA_STORAGE_DIR: dir, NODE_ENV: 'test' });

  const storage = resolveStorage();
  const hostiles = [
    '../fuera.bin',
    'workspaces/../../fuera.bin',
    '/etc/passwd',
    'workspaces//doble.bin',
    'workspaces/ws-1/archivo con espacio.bin',
  ];

  for (const key of hostiles) {
    await assert.rejects(() => storage.put(key, new Uint8Array([0]), 'application/octet-stream'), key);
  }

  await rm(dir, { recursive: true, force: true });
});

test('leer algo que no existe devuelve null, no un error', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'crm-media-'));
  withEnv({ MEDIA_STORAGE_DRIVER: 'filesystem', MEDIA_STORAGE_DIR: dir, NODE_ENV: 'test' });

  assert.equal(await resolveStorage().get('workspaces/ws-1/no-esta.bin'), null);

  await rm(dir, { recursive: true, force: true });
});

test('en produccion el disco local no cuenta como almacenamiento', () => {
  withEnv({ MEDIA_STORAGE_DRIVER: 'filesystem', NODE_ENV: 'production' });

  const status = storageStatus();
  assert.equal(status.configured, false);
  // El motivo tiene que servirle a quien configura el sistema.
  assert.match(status.reason ?? '', /efimero/i);
  assert.throws(() => resolveStorage(), StorageNotConfiguredError);
});

test('sin configuracion en produccion se falla y se dice que falta', () => {
  withEnv({ NODE_ENV: 'production' });

  const status = storageStatus();
  assert.equal(status.configured, false);
  assert.match(status.reason ?? '', /SUPABASE_SERVICE_ROLE_KEY/);
});

test('con las variables de Supabase se elige ese destino', () => {
  withEnv({
    NODE_ENV: 'production',
    SUPABASE_URL: 'https://proyecto.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'clave-de-prueba',
  });

  assert.equal(storageStatus().driver, 'supabase');
  assert.equal(resolveStorage().name, 'supabase');
});

test('pedir Supabase sin sus claves no cae en silencio al disco', () => {
  withEnv({ NODE_ENV: 'production', MEDIA_STORAGE_DRIVER: 'supabase' });

  const status = storageStatus();
  assert.equal(status.configured, false);
  assert.match(status.reason ?? '', /SUPABASE_URL/);
});
