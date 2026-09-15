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
  'smoke-critico.ts',
];

const require = createRequire(import.meta.url);
for (const suite of suites) {
  const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), `scripts/${suite}`], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) console.error(`No se pudo iniciar ${suite}: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
