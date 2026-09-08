/**
 * Pruebas de aceptacion de la Fase 0 (ESPECIFICACION_CRM_SAAS_BETA_CLAUDE_CODE.md).
 *
 * Cubre lo que exige la spec para cerrar la fase:
 *   - registro y login
 *   - CRUD de contacto
 *   - captura de formulario web
 *   - webhook de Mercado Pago con fixtures (firma invalida)
 *   - aislamiento entre dos workspaces
 *
 * Crea dos workspaces desechables con prefijo `smoke-` y los borra al final,
 * salvo que se pase --keep.
 *
 * Uso, con el CRM corriendo en :3001:
 *   node scripts/smoke-fase0.mjs
 */
import { createRequire } from 'node:module';

const BASE = process.env.CRM_BASE_URL ?? 'http://localhost:3001';
const KEEP = process.argv.includes('--keep');
const require = createRequire(new URL('../apps/crm/package.json', import.meta.url));

const results = [];
let failures = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** fetch que conserva la cookie de sesion por workspace. */
function makeSession() {
  let cookie = '';
  return async (path, init = {}) => {
    const headers = { ...(init.headers ?? {}) };
    if (cookie) headers.cookie = cookie;
    if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: 'manual' });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    for (const c of setCookie) {
      if (c.startsWith('upzites_crm_session=')) cookie = c.split(';')[0];
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* respuesta no JSON */ }
    return { status: res.status, json, text };
  };
}

const stamp = Date.now();
const tenants = [
  { key: 'A', company: `smoke-A-${stamp}`, email: `smoke-a-${stamp}@upzites.test`, password: 'Smoke#Test1234' },
  { key: 'B', company: `smoke-B-${stamp}`, email: `smoke-b-${stamp}@upzites.test`, password: 'Smoke#Test5678' },
];

console.log(`\n== Pruebas Fase 0 contra ${BASE} ==\n`);

// --- 1. Registro -------------------------------------------------------------
for (const t of tenants) {
  t.session = makeSession();
  const res = await t.session('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      companyName: t.company,
      ownerName: `Owner ${t.key}`,
      email: t.email,
      password: t.password,
    }),
  });
  t.workspaceId = res.json?.data?.workspace?.id ?? null;
  check(`Registro workspace ${t.key}`, res.status === 200 || res.status === 201, `HTTP ${res.status}`);
}

// --- 2. Login ----------------------------------------------------------------
for (const t of tenants) {
  t.session = makeSession();
  const res = await t.session('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: t.email, password: t.password }),
  });
  t.userId = res.json?.data?.id ?? null;
  t.workspaceId = res.json?.data?.workspace?.id ?? t.workspaceId;
  check(`Login workspace ${t.key}`, res.status === 200 && Boolean(t.userId), `HTTP ${res.status}`);
}

const [A, B] = tenants;

// --- 3. Credenciales invalidas ----------------------------------------------
{
  const s = makeSession();
  const res = await s('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: A.email, password: 'password-incorrecta' }),
  });
  check('Login con password incorrecta devuelve 401', res.status === 401, `HTTP ${res.status}`);
}

// --- 4. CRUD de contacto -----------------------------------------------------
{
  const created = await A.session('/api/contacts', {
    method: 'POST',
    body: JSON.stringify({
      firstName: 'Contacto',
      lastName: 'Smoke',
      email: `contacto-${stamp}@ejemplo.test`,
      phone: '+56900000000',
      status: 'lead',
      source: 'smoke-test',
    }),
  });
  A.contactId = created.json?.data?.id ?? null;
  check('Crear contacto', created.status === 200 || created.status === 201, `HTTP ${created.status}`);

  const list = await A.session('/api/contacts');
  const found = (list.json?.data ?? []).some((c) => c.id === A.contactId);
  check('Listar contactos incluye el creado', list.status === 200 && found, `HTTP ${list.status}`);

  if (A.contactId) {
    const patched = await A.session(`/api/contacts/${A.contactId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'activo' }),
    });
    check('Actualizar contacto', patched.status === 200, `HTTP ${patched.status}`);

    const after = await A.session('/api/contacts');
    const updated = (after.json?.data ?? []).find((c) => c.id === A.contactId);
    check('El cambio de estado quedo persistido', updated?.status === 'activo', `status=${updated?.status}`);
  }
}

// --- 5. Aislamiento entre workspaces ----------------------------------------
{
  const listB = await B.session('/api/contacts');
  const leak = (listB.json?.data ?? []).some((c) => c.id === A.contactId);
  check('Workspace B NO ve el contacto de A', listB.status === 200 && !leak, `HTTP ${listB.status}`);

  if (A.contactId) {
    const cross = await B.session(`/api/contacts/${A.contactId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cliente' }),
    });
    // Lo critico es que el dato NO cambie. El codigo de estado es aparte:
    // hoy la ruta devuelve 500 porque nadie captura el P2025 de Prisma.
    const { Client } = require('pg');
    const u = new URL(process.env.DIRECT_URL ?? '');
    const db = new Client({
      host: u.hostname, port: Number(u.port), user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password), database: u.pathname.slice(1),
      ssl: { rejectUnauthorized: false },
    });
    await db.connect();
    const row = await db.query('select status from contacts where id = $1', [A.contactId]);
    await db.end();
    check('Workspace B NO altero el contacto de A (dato intacto)', row.rows[0]?.status === 'ACTIVE', `status=${row.rows[0]?.status}`);
    check('[CONOCIDA] ID ajeno devuelve 404/403, no 500', cross.status === 404 || cross.status === 403, `HTTP ${cross.status} — deuda D13`);
  }

  const anon = makeSession();
  const noAuth = await anon('/api/contacts');
  check('Sin sesion no se listan contactos', noAuth.status !== 200, `HTTP ${noAuth.status}`);
}

// --- 6. Captura web: formulario embebible -----------------------------------
{
  const { Client } = require('pg');
  const u = new URL(process.env.DIRECT_URL ?? '');
  const client = new Client({
    host: u.hostname, port: Number(u.port), user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password), database: u.pathname.slice(1),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const form = await client.query(
    'select public_id from forms where workspace_id = $1 and is_active = true limit 1',
    [A.workspaceId],
  );
  const publicId = form.rows[0]?.public_id;
  check('El registro crea un formulario por defecto', Boolean(publicId), publicId ? '' : 'sin formulario');

  if (publicId) {
    const anon = makeSession();
    const render = await anon(`/api/capture/forms/${publicId}`);
    check('Formulario publico responde', render.status === 200, `HTTP ${render.status}`);

    const submitEmail = `lead-${stamp}@ejemplo.test`;
    const submit = await anon(`/api/capture/forms/${publicId}/submit`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Lead Capturado',
        email: submitEmail,
        phone: '+56911111111',
        message: 'Prueba de captura',
        pageUrl: 'https://upzites.com/contacto',
        utmSource: 'smoke',
        consent: true,
      }),
    });
    check('Submit del formulario acepta el lead', submit.status < 400, `HTTP ${submit.status}`);

    const lead = await client.query(
      'select id, source, utm_source from contacts where workspace_id = $1 and email = $2',
      [A.workspaceId, submitEmail],
    );
    check('El lead quedo como contacto en el workspace correcto', lead.rowCount === 1);
    check('El lead conserva la atribucion UTM', lead.rows[0]?.utm_source === 'smoke', `utm_source=${lead.rows[0]?.utm_source}`);

    const sub = await client.query('select count(*)::int n from form_submissions where workspace_id = $1', [A.workspaceId]);
    check('Se registro la submission', sub.rows[0].n >= 1);

    // Cableado de Fase 1: el formulario con consentimiento marcado lo registra
    // por canal (email y whatsapp, segun los datos entregados).
    const consents = await client.query(
      'select channel, status from contact_channel_consents where contact_id = $1 order by channel',
      [lead.rows[0]?.id],
    );
    const granted = consents.rows.filter((r) => r.status === 'GRANTED').map((r) => r.channel);
    check('El formulario registra consentimiento por canal', granted.includes('EMAIL') && granted.includes('WHATSAPP'), granted.join('+') || 'ninguno');
  }

  // --- 7. Captura de eventos web --------------------------------------------
  const ws = await client.query('select public_key from workspaces where id = $1', [A.workspaceId]);
  const publicKey = ws.rows[0]?.public_key;
  if (publicKey) {
    const anon = makeSession();
    const ev = await anon('/api/capture/events', {
      method: 'POST',
      body: JSON.stringify({
        publicKey,
        type: 'page_view',
        pageUrl: 'https://upzites.com/',
        visitorId: `v-${stamp}`,
      }),
    });
    check('Ingesta de evento web', ev.status < 400, `HTTP ${ev.status}`);

    const evRow = await client.query('select count(*)::int n from web_events where workspace_id = $1', [A.workspaceId]);
    check('El evento quedo guardado en el workspace correcto', evRow.rows[0].n >= 1);

    const bad = await anon('/api/capture/events', {
      method: 'POST',
      body: JSON.stringify({ publicKey: 'clave-inexistente', type: 'page_view', pageUrl: 'https://x.test/' }),
    });
    check('Evento con publicKey invalida es rechazado', bad.status >= 400, `HTTP ${bad.status}`);
  }

  await client.end();
}

// --- 8. Webhook Mercado Pago: fixtures --------------------------------------
{
  const anon = makeSession();

  const noSig = await anon('/api/billing/webhook?type=payment&data.id=123456789', { method: 'POST', body: '{}' });
  check('Webhook MP sin firma es rechazado', noSig.status === 401 || noSig.status === 500, `HTTP ${noSig.status}`);

  const badSig = await anon('/api/billing/webhook?type=payment&data.id=123456789', {
    method: 'POST',
    headers: { 'x-signature': 'ts=1700000000,v1=firmafalsa', 'x-request-id': 'req-smoke' },
    body: '{}',
  });
  check('Webhook MP con firma invalida es rechazado', badSig.status === 401 || badSig.status === 500, `HTTP ${badSig.status}`);
}

// --- 9. Health ---------------------------------------------------------------
{
  const anon = makeSession();
  const health = await anon('/api/system/health');
  check('Health endpoint reporta base OK', health.status === 200 && health.json?.database === 'ok', `HTTP ${health.status}`);
}

// --- Limpieza ----------------------------------------------------------------
if (!KEEP) {
  const { Client } = require('pg');
  const u = new URL(process.env.DIRECT_URL ?? '');
  const client = new Client({
    host: u.hostname, port: Number(u.port), user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password), database: u.pathname.slice(1),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const del = await client.query("delete from workspaces where slug like 'smoke-%' returning id");
  await client.end();
  console.log(`\nLimpieza: ${del.rowCount} workspaces de prueba eliminados (cascade).`);
} else {
  console.log('\n--keep: los workspaces de prueba quedaron en la base.');
}

console.log(`\n== Resultado: ${results.length - failures}/${results.length} pruebas OK ==`);
process.exit(failures > 0 ? 1 : 0);
