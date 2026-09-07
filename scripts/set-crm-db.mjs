/**
 * Escribe apps/crm/.env.production.local con las credenciales de Supabase
 * y verifica la conexion ANTES de escribir.
 *
 * Pide dos cosas:
 *   1. El connection string del "Transaction pooler" tal cual lo muestra el
 *      dashboard (Connect > ORMs > Prisma), con el placeholder de password.
 *   2. La password, que se URL-encodea sola.
 *
 * Evita los errores tipicos al pegar a mano: dejar los corchetes del
 * placeholder, no escapar caracteres especiales (% @ : / ? # &) o romper la
 * URL al editarla encima.
 *
 * Uso, desde la raiz del repo:
 *   node scripts/set-crm-db.mjs
 */
import { createInterface } from 'node:readline/promises';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { stdin, stdout } from 'node:process';

const TARGET = 'apps/crm/.env.production.local';

// pg vive en apps/crm/node_modules, no en la raiz del monorepo.
const require = createRequire(new URL('../apps/crm/package.json', import.meta.url));

const rl = createInterface({ input: stdin, output: stdout });
const rawUrl = await rl.question('Connection string del Transaction pooler (puerto 6543): ');
const rawPassword = await rl.question('Password de Postgres: ');
rl.close();

// Limpia corchetes del placeholder y espacios pegados al copiar.
const password = rawPassword.trim().replace(/^\[/, '').replace(/\]$/, '');

if (!password) {
  console.error('No se ingreso ninguna password. No se escribio nada.');
  process.exit(1);
}

// El connection string trae la password como placeholder: la sacamos del medio
// para quedarnos con usuario, host y puerto, que es lo unico que necesitamos.
const match = rawUrl.trim().match(/^postgres(?:ql)?:\/\/([^:]+):[^@]*@([^:/]+):(\d+)/);

if (!match) {
  console.error('No pude leer el connection string. Debe verse asi:');
  console.error('  postgresql://postgres.REF:[YOUR-PASSWORD]@aws-N-REGION.pooler.supabase.com:6543/postgres');
  process.exit(1);
}

const [, user, host, port] = match;

if (port !== '6543') {
  console.warn(`Aviso: el puerto del string es ${port}, se esperaba 6543 (transaction pooler).`);
}

const encoded = encodeURIComponent(password);
const runtimeUrl = `postgresql://${user}:${encoded}@${host}:6543/postgres?sslmode=require&pgbouncer=true`;
const migrationUrl = `postgresql://${user}:${encoded}@${host}:5432/postgres?sslmode=require`;

console.log(`\nUsuario: ${user}`);
console.log(`Host:    ${host}`);
console.log(`Password: ${password.length} caracteres, ${encoded === password ? 'sin' : 'con'} caracteres escapados.`);
console.log('\nProbando la conexion antes de escribir...');

const { Client } = require('pg');
const client = new Client({
  host,
  port: 5432,
  user,
  password,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

try {
  await client.connect();
  await client.query('select 1');
  await client.end();
} catch (error) {
  console.error(`\nFALLO la conexion: ${error.code ?? ''} ${error.message}`);
  if (error.code === '28P01') {
    console.error('La password no es la correcta. Reseteala en Supabase (Settings > Database >');
    console.error('Reset database password) y copiala del dialogo ANTES de cerrarlo.');
  }
  console.error(`\nNo se escribio ${TARGET}: el archivo quedo como estaba.`);
  process.exit(1);
}

const content = `# Supabase: ${user.replace(/^postgres\./, '')} (${host})
# Generado por scripts/set-crm-db.mjs. La password va URL-encodeada.
# No editar a mano: al pegar encima se rompe el "@" que separa password y host.

# Runtime (transaction pooler, IPv4)
DATABASE_URL="${runtimeUrl}"

# Prisma CLI: migraciones y seed (session pooler)
DIRECT_URL="${migrationUrl}"
`;

writeFileSync(TARGET, content, 'utf8');

console.log(`\nConexion OK. Escrito ${TARGET}`);
