// Ensayo de release: levanta el build actual (`next build` previo) con
// `next start` contra la base LOCAL crm_rehearsal (copia sintetica de prod con
// las migraciones pendientes aplicadas). Secretos de sesion/cifrado aleatorios
// por arranque; la URL base se toma de TEST_DATABASE_URL en .env.local.
// Solo local: aborta si el destino no es 127.0.0.1:5432/crm_rehearsal.
//
// Uso, desde apps/crm:  node scripts/rehearsal/start-server.mjs   (puerto 3102)
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
const env = require('dotenv').parse(readFileSync(new URL('../../.env.local', import.meta.url)));
const url = new URL(env.TEST_DATABASE_URL);
url.pathname = '/crm_rehearsal';
if (url.hostname !== '127.0.0.1' || (url.port || '5432') !== '5432' || url.pathname !== '/crm_rehearsal') {
  throw new Error('Solo 127.0.0.1:5432/crm_rehearsal.');
}
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', '3102'], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    DATABASE_URL: url.toString(),
    DIRECT_URL: url.toString(),
    CRM_SESSION_SECRET: randomBytes(32).toString('hex'),
    INTEGRATION_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    CRM_DEV_DEMO: 'false',
    NEXT_PUBLIC_CRM_BASE_URL: 'http://127.0.0.1:3102',
  },
});
child.on('exit', (code) => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
