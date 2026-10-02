/**
 * QA de portadas contra el STORAGE REAL (Supabase), con la misma capa
 * (lib/storage) y las mismas rutas que usa produccion. La base es la de
 * PRUEBAS (run-against-test-db fuerza DATABASE_URL = TEST_DATABASE_URL).
 *
 * Credenciales: se leen de `apps/crm/.env.storage.local` (ignorado por git)
 * o del entorno. Nunca se imprimen.
 *   SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=...  MEDIA_STORAGE_BUCKET=media
 *
 * Uso, desde apps/crm:
 *   node scripts/run-against-test-db.mjs scripts/qa-storage-cover.ts
 *
 * Verifica: bucket existente y privado (limite y MIME), subida, persistencia,
 * recarga, servido con el tipo verificado, aislamiento por workspace, firma
 * publica solo con producto publicado, MIME sniffing (SVG/HTML disfrazados y
 * texto rechazados), reemplazo (borra el anterior), duplicado (archivo propio)
 * y borrado. Limpia todo lo que crea.
 */
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

if (existsSync('.env.storage.local')) loadEnv({ path: '.env.storage.local', override: true, quiet: true });
const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'MEDIA_STORAGE_BUCKET'].filter((key) => !process.env[key]?.trim());
if (missing.length) {
  console.error(`BLOCKED — MANUAL CONFIG REQUIRED: faltan ${missing.join(', ')} (ver encabezado de este script).`);
  process.exit(2);
}
process.env.MEDIA_STORAGE_DRIVER = 'supabase';
process.env.CRM_SESSION_SECRET ??= randomBytes(32).toString('hex');
process.env.INTEGRATION_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
Object.assign(globalThis, { AsyncLocalStorage });

const { PlanCode } = await import('../generated/prisma/client');
const { crossTenantPrisma, prisma } = await import('../src/lib/prisma');
const { storageStatus, resolveStorage } = await import('../src/lib/storage');
const { createCustomerWorkspace } = await import('../src/lib/subscription');
const { assignCompSubscription } = await import('../src/lib/billing/subscription-admin');
const { signProductKey } = await import('../src/lib/commerce/product-link');
const { readCover } = await import('../src/lib/commerce/product-studio/cover');
const { asUser } = await import('./fixtures/request-context');
const { POST: createRoute } = await import('../src/app/api/products/studio/route');
const { POST: statusRoute } = await import('../src/app/api/products/[id]/status/route');
const { POST: duplicateRoute } = await import('../src/app/api/products/[id]/duplicate/route');
const { DELETE: coverDelete, GET: coverGet, POST: coverPost } = await import('../src/app/api/products/[id]/cover/route');

let failures = 0;
const results: string[] = [];
function check(name: string, ok: boolean, detail = '') {
  results.push(name);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const status = storageStatus();
check('S0. La capa de storage resuelve el driver Supabase', status.configured && status.driver === 'supabase', JSON.stringify(status));

// Configuracion del bucket (solo campos publicos de su configuracion).
const base = process.env.SUPABASE_URL!.trim().replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
const bucketName = process.env.MEDIA_STORAGE_BUCKET!.trim();
const bucketResponse = await fetch(`${base}/storage/v1/bucket/${encodeURIComponent(bucketName)}`, { headers: { Authorization: `Bearer ${key}`, apikey: key } });
const bucket = (await bucketResponse.json().catch(() => ({}))) as { id?: string; public?: boolean; file_size_limit?: number | null; allowed_mime_types?: string[] | null };
const mimes = [...(bucket.allowed_mime_types ?? [])].sort().join(',');
check(
  `S1. Bucket "${bucketName}" existe, es privado, límite ≤ 5 MB y admite jpeg/png/webp`,
  bucketResponse.ok && bucket.public === false && (bucket.file_size_limit ?? 0) > 0 && (bucket.file_size_limit ?? Infinity) <= 5 * 1024 * 1024 &&
    ['image/jpeg', 'image/png', 'image/webp'].every((mime) => (bucket.allowed_mime_types ?? []).includes(mime)),
  `HTTP ${bucketResponse.status} public=${bucket.public} limit=${bucket.file_size_limit} mime=${mimes}`,
);

const stamp = Date.now();
const workspaces: string[] = [];
const users: string[] = [];
async function makeWorkspace(suffix: string) {
  const created = await createCustomerWorkspace({ companyName: `qa-storage-${suffix}-${stamp}`, ownerName: `QA ${suffix}`, email: `qa-storage-${suffix}-${stamp}@studio.test`, password: 'contrasena-de-prueba-1234' });
  workspaces.push(created.workspace.id);
  users.push(created.user.id);
  await assignCompSubscription({ workspaceId: created.workspace.id, planCode: PlanCode.SCALE, via: 'cli', reason: 'qa storage portada' });
  return { id: created.user.id, workspaceId: created.workspace.id };
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (path: string, body?: unknown) => new Request(`http://localhost${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const upload = (id: string, bytes: Uint8Array, type: string, name: string) => {
  const form = new FormData();
  form.set('file', new Blob([bytes as Uint8Array<ArrayBuffer>], { type }), name);
  return new Request(`http://localhost/api/products/${id}/cover`, { method: 'POST', body: form });
};
const get = (id: string, query = '') => new Request(`http://localhost/api/products/${id}/cover${query}`);
const coverOf = async (productId: string) => readCover((await prisma.product.findFirstOrThrow({ where: { id: productId } })).metadata);
const exists = async (objectKey: string) => Boolean(await (await resolveStorage()).get(objectKey));

// PNG 1x1 y JPEG minimo validos (los bytes los verifica el servidor).
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);

const A = await makeWorkspace('a');
const B = await makeWorkspace('b');
try {
  const created = await asUser(A, () => createRoute(json('/api/products/studio', { name: 'Portada QA', type: 'DIGITAL', currency: 'CLP', basePrice: 1000 })));
  const productId = String(((await created.json()) as { data?: { id?: string } }).data?.id ?? '');

  const up = await asUser(A, () => coverPost(upload(productId, PNG, 'image/png', 'portada.png'), params(productId)));
  const first = await coverOf(productId);
  check('S2. Subida PNG al bucket real: 200 y referencia en el producto bajo products/<workspace>/<producto>/', up.status === 200 && Boolean(first?.key.startsWith(`products/${A.workspaceId}/${productId}/`)), `HTTP ${up.status}`);
  check('S3. Persistencia: el objeto existe en el storage y la referencia se relee igual', Boolean(first) && (await exists(first!.key)) && (await coverOf(productId))?.key === first?.key);

  const ownerGet = await asUser(A, () => coverGet(get(productId), params(productId)));
  const ownerBytes = new Uint8Array(await ownerGet.arrayBuffer());
  check(
    'S4. Recarga/visualización: el dueño recibe los mismos bytes, image/png, nosniff y CSP sandbox',
    ownerGet.status === 200 && ownerGet.headers.get('content-type') === 'image/png' && ownerGet.headers.get('x-content-type-options') === 'nosniff' &&
      /sandbox/.test(ownerGet.headers.get('content-security-policy') ?? '') && Buffer.from(ownerBytes).equals(Buffer.from(PNG)),
    `HTTP ${ownerGet.status} ${ownerGet.headers.get('content-type')}`,
  );

  const foreignGet = await asUser(B, () => coverGet(get(productId), params(productId)));
  const foreignUpload = await asUser(B, () => coverPost(upload(productId, PNG, 'image/png', 'x.png'), params(productId)));
  const anonymous = await asUser(null, () => coverGet(get(productId), params(productId)));
  const publicDraft = await asUser(null, () => coverGet(get(productId, `?k=${signProductKey(productId)}`), params(productId)));
  check('S5. Aislamiento: otro workspace no ve ni sube (404); anónimo sin firma 404; con firma pero en BORRADOR 404', [foreignGet, foreignUpload, anonymous, publicDraft].every((r) => r.status === 404), [foreignGet, foreignUpload, anonymous, publicDraft].map((r) => r.status).join('/'));
  await asUser(A, () => statusRoute(json(`/api/products/${productId}/status`, { action: 'publish' }), params(productId)));
  const publicActive = await asUser(null, () => coverGet(get(productId, `?k=${signProductKey(productId)}`), params(productId)));
  check('S6. Comprador con firma y producto PUBLICADO → 200 (cache pública corta)', publicActive.status === 200 && /public/.test(publicActive.headers.get('cache-control') ?? ''), `HTTP ${publicActive.status}`);

  const svg = await asUser(A, () => coverPost(upload(productId, new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/png', 'x.png'), params(productId)));
  const html = await asUser(A, () => coverPost(upload(productId, new TextEncoder().encode('<html><script>alert(1)</script></html>'), 'image/jpeg', 'x.jpg'), params(productId)));
  const text = await asUser(A, () => coverPost(upload(productId, new TextEncoder().encode('hola'), 'image/webp', 'x.webp'), params(productId)));
  const big = new Uint8Array(5 * 1024 * 1024 + 10);
  big.set(PNG);
  const tooBig = await asUser(A, () => coverPost(upload(productId, big, 'image/png', 'big.png'), params(productId)));
  check(
    'S7. MIME sniffing: SVG/HTML/texto disfrazados de imagen → 400 y > 5 MB → rechazo; la portada vigente no cambia',
    svg.status === 400 && html.status === 400 && text.status === 400 && [400, 413].includes(tooBig.status) && (await coverOf(productId))?.key === first?.key,
    `${svg.status}/${html.status}/${text.status}/${tooBig.status}`,
  );

  const replace = await asUser(A, () => coverPost(upload(productId, JPEG, 'image/jpeg', 'nueva.jpg'), params(productId)));
  const second = await coverOf(productId);
  check('S8. Reemplazo por JPEG: nueva clave, tipo image/jpeg y el objeto anterior se borra del bucket', replace.status === 200 && second?.mimeType === 'image/jpeg' && second.key !== first?.key && (await exists(second.key)) && !(await exists(first!.key)));

  const dup = await asUser(A, () => duplicateRoute(json(`/api/products/${productId}/duplicate`), params(productId)));
  const copyId = String(((await dup.json()) as { data?: { id?: string } }).data?.id ?? '');
  const copyCover = await coverOf(copyId);
  check('S9. Duplicar copia la portada como archivo PROPIO dentro de la carpeta de la copia', Boolean(copyCover) && copyCover!.key !== second?.key && copyCover!.key.startsWith(`products/${A.workspaceId}/${copyId}/`) && (await exists(copyCover!.key)));

  const removed = await asUser(A, () => coverDelete(new Request(`http://localhost/api/products/${productId}/cover`, { method: 'DELETE' }), params(productId)));
  const removedCopy = await asUser(A, () => coverDelete(new Request(`http://localhost/api/products/${copyId}/cover`, { method: 'DELETE' }), params(copyId)));
  check('S10. Quitar portada borra la referencia y el objeto del bucket', removed.status === 200 && removedCopy.status === 200 && !(await coverOf(productId)) && !(await exists(second!.key)) && !(await exists(copyCover!.key)));
} finally {
  // Limpieza: objetos residuales del QA y cuentas/negocios de prueba.
  const storage = await resolveStorage();
  for (const product of await prisma.product.findMany({ where: { workspaceId: { in: workspaces } }, select: { metadata: true } })) {
    const cover = readCover(product.metadata);
    if (cover) await storage.remove(cover.key).catch(() => null);
  }
  const memberUsers = (await prisma.workspaceMembership.findMany({ where: { workspaceId: { in: workspaces } }, select: { userId: true } })).map((m) => m.userId);
  await crossTenantPrisma.workspace.deleteMany({ where: { id: { in: workspaces } } });
  await crossTenantPrisma.user.deleteMany({ where: { id: { in: [...new Set([...users, ...memberUsers])] } } });
  await prisma.$disconnect();
}
console.log(`\n== Resultado: ${results.length - failures}/${results.length} pruebas OK ==`);
if (failures > 0) process.exit(1);
