import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const candidates = [
  'docker',
  'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',
  'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
];

function findDocker() {
  for (const candidate of candidates) {
    if (candidate === 'docker') {
      const result = spawnSync(candidate, ['--version'], { stdio: 'ignore', shell: true });
      if (result.status === 0) return candidate;
      continue;
    }

    if (existsSync(candidate)) return candidate;
  }

  return null;
}

const docker = findDocker();

if (!docker) {
  console.error('Docker no esta disponible en PATH ni en las rutas tipicas de Docker Desktop.');
  console.error('Instala Docker Desktop o abrelo y vuelve a correr: pnpm db:crm:up');
  console.error('Windows: winget install Docker.DockerDesktop');
  process.exit(1);
}

if (docker.endsWith('Docker Desktop.exe')) {
  console.log('Docker Desktop existe, pero docker.exe no esta disponible todavia.');
  console.log('Abriendo Docker Desktop. Espera a que termine de iniciar y vuelve a correr: pnpm db:crm:up');
  spawnSync(docker, [], { detached: true, stdio: 'ignore' });
  process.exit(0);
}

const result = spawnSync(docker, ['compose', 'up', '-d', 'crm-postgres'], {
  cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
