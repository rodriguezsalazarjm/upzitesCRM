import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const suites = [
  'smoke-fase1.ts',
  'smoke-fase2.ts',
  'smoke-fase3.ts',
  'smoke-fase4.ts',
  'smoke-fase5.ts',
  'smoke-fase6.ts',
  'smoke-fase7.ts',
  'smoke-fase8.ts',
  'smoke-fase9.ts',
  'smoke-fase-a.ts',
  'smoke-fase-a2.ts',
  'smoke-fase-c-engine.ts',
  'smoke-fase-c-channels.ts',
  'smoke-critico.ts',
  'smoke-beta.ts',
];

const require = createRequire(import.meta.url);
const requested = process.argv.slice(2);
if (requested.some((suite) => !suites.includes(suite))) {
  throw new Error('Suite desconocida. Usa el nombre de un archivo smoke registrado.');
}
for (const suite of requested.length ? [...new Set(requested)] : suites) {
  const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), `scripts/${suite}`], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) console.error(`No se pudo iniciar ${suite}: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
