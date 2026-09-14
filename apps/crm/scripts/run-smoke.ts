import { spawnSync } from 'node:child_process';

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

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
for (const suite of suites) {
  const result = spawnSync(pnpm, ['exec', 'tsx', `scripts/${suite}`], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  if (result.status !== 0) process.exit(result.status ?? 1);
}
