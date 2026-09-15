import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const mode = process.argv[2];
const commands = {
  prepare: [require.resolve('tsx/cli'), 'scripts/visual/fixtures.ts'],
  dev: [require.resolve('next/dist/bin/next'), 'dev', '--webpack', '-H', '127.0.0.1', '-p', '3101'],
  build: [require.resolve('next/dist/bin/next'), 'build', '--webpack'],
  worker: [require.resolve('tsx/cli'), 'scripts/visual/worker.ts'],
  check: [require.resolve('tsx/cli'), 'scripts/visual/check.ts'],
};
if (!commands[mode]) throw Error('Usa prepare, dev, build, worker o check.');
const preload = fileURLToPath(new URL('./preload.cjs', import.meta.url)).replaceAll('\\', '/');
const child = spawn(process.execPath, commands[mode], {
  cwd: fileURLToPath(new URL('../../', import.meta.url)), stdio: 'inherit', windowsHide: true,
  env: { ...process.env, NODE_OPTIONS: `--require "${preload}"`, NODE_ENV: mode === 'build' ? 'production' : 'development' },
});
child.on('error', () => { console.error('No se pudo iniciar la validacion local.'); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
