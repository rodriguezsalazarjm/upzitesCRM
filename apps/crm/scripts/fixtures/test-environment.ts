import 'dotenv/config';
import { Client } from 'pg';
import {
  assertDifferentDatabase,
  assertSameTestDatabase,
  assertTestDatabaseMarker,
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

const verifier = new Client({
  connectionString: parsed.toString(),
  ...(ca && isSupabase ? { ssl: { ca, rejectUnauthorized: true } } : {}),
});

try {
  await verifier.connect();
  const result = await verifier.query<{ marker: string | null }>(`
    select obj_description(oid, 'pg_database') as marker
    from pg_database
    where datname = current_database()
  `);
  assertTestDatabaseMarker(result.rows[0]?.marker);
} catch (error) {
  const message = error instanceof Error ? error.message : 'error desconocido';
  const detail = message.includes('CRM_UPZITES_ISOLATED_TEST_DATABASE_V1')
    ? message
    : 'revisa conectividad, TLS y el marcador de la base';
  throw new Error(`No se pudo autorizar la base aislada de pruebas: ${detail}`);
} finally {
  await verifier.end().catch(() => undefined);
}

// Solo despues de comparar destinos y comprobar el marcador se sustituye la
// conexion. Los imports posteriores de Prisma ya no pueden capturar produccion.
process.env.DATABASE_URL = testUrl;
process.env.DIRECT_URL = testDirectUrl;

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
]) {
  delete process.env[key];
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const value = input instanceof Request ? input.url : String(input);
  const url = new URL(value);
  const permitted =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '::1' ||
    url.hostname.endsWith('.test');

  if (!permitted) {
    throw new Error(`Red externa bloqueada durante smoke test (${url.hostname}).`);
  }

  return realFetch(input, init);
};
