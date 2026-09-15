const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomBytes, randomUUID } = require('node:crypto');
const net = require('node:net');
const tls = require('node:tls');
const { syncBuiltinESMExports } = require('node:module');
const root = path.resolve(__dirname, '../..');
const config = require('dotenv').parse(fs.readFileSync(path.join(root, '.env.local')));
const primary = config.TEST_DATABASE_URL;
const direct = config.TEST_DIRECT_URL;
for (const value of [primary, direct]) {
  let url;
  try { url = new URL(value); } catch { throw Error('Falta una URL de pruebas valida.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' ||
      (url.port || '5432') !== '5432' || url.pathname !== '/crm_pruebas' || url.search || url.hash) {
    throw Error('Solo se admite 127.0.0.1:5432/crm_pruebas sin parametros.');
  }
}
// No recursion: the verifier receives no preload, and the URL only via stdin.
const verification = spawnSync(process.execPath, [path.join(root, 'scripts/fixtures/verify-test-database.mjs')], {
  input: JSON.stringify({ connectionString: direct }), encoding: 'utf8', timeout: 15000,
  env: { ...process.env, NODE_OPTIONS: '' }, windowsHide: true,
});
if (verification.status !== 0) throw Error('Destino local no autorizado: verifica conexion y marcador.');
const directory = path.join(root, '.local-visual');
fs.mkdirSync(directory, { recursive: true });
const credentialPath = path.join(directory, 'accounts.json');
if (!fs.existsSync(credentialPath)) {
  fs.writeFileSync(credentialPath, JSON.stringify({
    password: randomBytes(18).toString('base64url'), sessionSecret: randomBytes(32).toString('hex'),
    encryptionKey: randomBytes(32).toString('base64'),
    accounts: ['owner-a@visual.test', 'operator-a@visual.test', 'owner-b@visual.test'],
  }, null, 2), { flag: 'wx', mode: 0o600 });
}
const credentials = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
Object.assign(process.env, {
  DATABASE_URL: primary, DIRECT_URL: direct, TEST_DATABASE_URL: primary, TEST_DIRECT_URL: direct,
  CRM_SESSION_SECRET: credentials.sessionSecret, INTEGRATION_ENCRYPTION_KEY: credentials.encryptionKey,
  LOCAL_VISUAL_TEST: '1', CRM_DEV_DEMO: 'false', EMAIL_PROVIDER: 'SCRIPTED',
  MEDIA_STORAGE_DRIVER: 'filesystem', NEXT_TELEMETRY_DISABLED: '1', CHECKPOINT_DISABLE: '1',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3101',
});
// Empty values prevent Next's dotenv loader from restoring real providers.
for (const key of ['OPENAI_API_KEY', 'OPENAI_PROJECT_ID', 'META_APP_SECRET', 'WHATSAPP_SYSTEM_ACCESS_TOKEN',
  'MERCADO_PAGO_ACCESS_TOKEN', 'MERCADO_PAGO_WEBHOOK_SECRET', 'RESEND_API_KEY', 'EMAIL_WEBHOOK_SECRET',
  'SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT',
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_CA_CERT']) process.env[key] = '';
const local = (host) => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
function checkSocket(args) {
  while (Array.isArray(args[0])) args = args[0];
  const first = args[0];
  if (typeof first === 'string' && !/^\d+$/.test(first)) {
    if (first.startsWith('\\\\.\\pipe\\') || first.startsWith('/')) return;
    throw Error('Socket externo bloqueado en validacion visual.');
  }
  const options = typeof first === 'object' && first !== null ? first : {};
  if (options.path && !options.host && !options.hostname) return;
  const host = options.host || options.hostname || (typeof args[1] === 'string' ? args[1] : 'localhost');
  if (!local(host)) throw Error('Socket externo bloqueado en validacion visual.');
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) { checkSocket(args); return connect.apply(this, args); };
const tlsConnect = tls.connect;
tls.connect = function (...args) { checkSocket(args); return tlsConnect.apply(this, args); };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (local(url.hostname)) return realFetch(input, init);
  // Simulated transport only for dedicated fixture channels. Never calls the network.
  if (url.hostname === 'graph.facebook.com' && /\/visual-[ab]\/messages$/.test(url.pathname) &&
      new Headers(init?.headers).get('authorization') === 'Bearer visual-test-token') {
    const payload = JSON.parse(String(init?.body));
    const rejected = payload.text?.body?.includes('[fallo]');
    fs.appendFileSync(path.join(directory, 'transport.jsonl'), JSON.stringify({
      time: new Date().toISOString(), simulated: true, outcome: rejected ? 'rejected' : 'sent',
    }) + '\n');
    return rejected ? Response.json({ error: { code: 100 } }, { status: 400 })
      : Response.json({ messages: [{ id: `wamid.visual.${randomUUID()}` }] });
  }
  throw Error('Proveedor externo bloqueado en validacion visual.');
};
syncBuiltinESMExports();
globalThis[Symbol.for('upzites.visual.guard')] = true;
fs.appendFileSync(path.join(directory, 'processes.jsonl'), JSON.stringify({ pid: process.pid, database: 'crm_pruebas', guarded: true }) + '\n');
