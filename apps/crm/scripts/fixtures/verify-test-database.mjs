import { readFileSync } from 'node:fs';
import { Client } from 'pg';

// La conexion entra por stdin; no aparece en argumentos ni en errores impresos.
const client = new Client(JSON.parse(readFileSync(0, 'utf8')));
try {
  await client.connect();
  const result = await client.query(`
    select shobj_description(oid, 'pg_database') as marker
    from pg_database where datname = current_database()
  `);
  if (result.rows[0]?.marker !== 'CRM_UPZITES_ISOLATED_TEST_DATABASE_V1') {
    process.exitCode = 1;
  }
} catch {
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
