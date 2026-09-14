import './fixtures/test-environment';
import { spawnSync } from 'node:child_process';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(pnpm, ['exec', 'prisma', 'migrate', 'deploy'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
