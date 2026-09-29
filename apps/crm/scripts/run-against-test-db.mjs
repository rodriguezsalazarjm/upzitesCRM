/**
 * Ejecuta un script de administracion (p. ej. platform-admin.ts) contra la base
 * de PRUEBAS aislada: fuerza DATABASE_URL/DIRECT_URL = TEST_DATABASE_URL /
 * TEST_DIRECT_URL leidos de .env.local. Nunca apunta a produccion.
 *
 *   node scripts/run-against-test-db.mjs scripts/platform-admin.ts list
 *   node scripts/run-against-test-db.mjs scripts/platform-admin.ts grant qa@x.test SUPER_ADMIN "bootstrap QA"
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1).replace(/^"(.*)"$/, '$1')];
    }),
);
const test = env.TEST_DATABASE_URL;
if (!test) throw new Error('Falta TEST_DATABASE_URL en .env.local.');
const direct = env.TEST_DIRECT_URL || test;
for (const prod of [env.DATABASE_URL, env.DIRECT_URL].filter(Boolean)) {
  if (new URL(prod).host === new URL(test).host && new URL(prod).pathname === new URL(test).pathname) {
    throw new Error('TEST_DATABASE_URL coincide con DATABASE_URL: abortado.');
  }
}
const target = new URL(test);
console.log(`Destino (pruebas): ${target.hostname}${target.pathname}`);

const require = createRequire(import.meta.url);
const [script, ...args] = process.argv.slice(2);
const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), script, ...args], {
  stdio: 'inherit',
  env: { ...process.env, ...env, DATABASE_URL: test, DIRECT_URL: direct },
});
process.exit(result.status ?? 1);
