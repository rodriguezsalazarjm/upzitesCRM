import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  assertDifferentDatabase,
  assertSameTestDatabase,
} from '../../src/lib/testing/database-policy';

const testUrl = process.env.TEST_DATABASE_URL?.trim();
if (!testUrl) {
  throw new Error(
    'TEST_DATABASE_URL es obligatoria para las operaciones de prueba. DATABASE_URL nunca se usa como respaldo.',
  );
}

assertDifferentDatabase(testUrl, [process.env.DATABASE_URL, process.env.DIRECT_URL]);

const testDirectUrl = process.env.TEST_DIRECT_URL?.trim() || testUrl;
assertDifferentDatabase(testDirectUrl, [process.env.DATABASE_URL, process.env.DIRECT_URL]);
assertSameTestDatabase(testUrl, testDirectUrl);

const ca = process.env.SUPABASE_CA_CERT?.trim();
const parsed = new URL(testUrl);
const isSupabase =
  parsed.hostname.endsWith('.supabase.co') || parsed.hostname.endsWith('.pooler.supabase.com');
if (ca && isSupabase) {
  for (const parameter of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) {
    parsed.searchParams.delete(parameter);
  }
}

// ESM evalua otros imports mientras un modulo espera un top-level await.
// La verificacion sincrona impide que Prisma capture DATABASE_URL antes del cerco.
const verification = spawnSync(process.execPath, [
  fileURLToPath(new URL('./verify-test-database.mjs', import.meta.url)),
], {
  input: JSON.stringify({
    connectionString: parsed.toString(),
    ...(ca && isSupabase ? { ssl: { ca, rejectUnauthorized: true } } : {}),
  }),
  encoding: 'utf8',
  timeout: 15_000,
  windowsHide: true,
});
if (verification.status !== 0) {
  throw new Error(
    'No se pudo autorizar la base aislada de pruebas: revisa conectividad, TLS y el marcador CRM_UPZITES_ISOLATED_TEST_DATABASE_V1.',
  );
}

// Solo despues de comparar destinos y comprobar el marcador se sustituye la
// conexion. Los imports posteriores de Prisma ya no pueden capturar produccion.
process.env.DATABASE_URL = testUrl;
process.env.DIRECT_URL = testDirectUrl;
process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.CRM_SESSION_SECRET = randomBytes(32).toString('hex');
process.env.META_APP_SECRET = randomBytes(32).toString('hex');

// Los smoke tests usan proveedores guionados o fetchers inyectados. Se retiran
// credenciales reales para que una omision futura falle de forma cerrada.
process.env.EMAIL_PROVIDER = 'SCRIPTED';
process.env.OPENAI_API_KEY = 'test-provider-disabled';
for (const key of [
  'EMAIL_WEBHOOK_SECRET',
  'MERCADO_PAGO_ACCESS_TOKEN',
  'MERCADO_PAGO_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'SHOPIFY_API_KEY',
  'SHOPIFY_API_SECRET',
  'WHATSAPP_SYSTEM_ACCESS_TOKEN',
  'VAPID_PRIVATE_KEY',
  'VAPID_PUBLIC_KEY',
  'VAPID_SUBJECT',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_URL',
]) {
  delete process.env[key];
}

if (!isSupabase) delete process.env.SUPABASE_CA_CERT;
process.env.MEDIA_STORAGE_DRIVER = 'filesystem';
// Next usa esta implementacion al crear contextos de peticion en las pruebas.
Object.assign(globalThis, { AsyncLocalStorage });

// Los proveedores se simulan en memoria. Bloquear tambien http(s) cubre
// web-push, que no usa fetch; ni siquiera .test debe llegar a DNS o a la red.
const blockedRequest = () => {
  throw new Error('Red HTTP bloqueada durante smoke test. Usa un proveedor simulado.');
};
http.request = blockedRequest;
http.get = blockedRequest;
https.request = blockedRequest;
https.get = blockedRequest;
syncBuiltinESMExports();
globalThis.fetch = async () => blockedRequest();
