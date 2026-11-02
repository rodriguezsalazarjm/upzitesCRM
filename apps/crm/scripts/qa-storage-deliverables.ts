/**
 * QA del Punto 3 contra el STORAGE REAL (Supabase): bucket privado de
 * entregables, con la misma capa (lib/storage) y las mismas rutas que usa
 * produccion. La base es la de PRUEBAS (run-against-test-db fuerza
 * DATABASE_URL = TEST_DATABASE_URL).
 *
 * Credenciales: se leen de `apps/crm/.env.storage.local` (ignorado por git)
 * o del entorno. Nunca se imprimen.
 *   SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=...  MEDIA_STORAGE_BUCKET=media
 *   DELIVERY_STORAGE_BUCKET=deliverables
 *
 * Uso, desde apps/crm:
 *   node scripts/run-against-test-db.mjs scripts/qa-storage-deliverables.ts
 *
 * Verifica: bucket de entregables privado (MIME y limite), bucket `media`
 * intacto, subida directa del navegador con URL firmada, verificacion por
 * firma (PDF valido; HTML disfrazado rechazado y borrado), objeto sin URL
 * publica, vista previa por URL firmada de vida corta, venta → entrega →
 * descarga del comprador por URL firmada, otro workspace sin acceso,
 * revocacion y limpieza de todo lo creado.
 */
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

if (existsSync('.env.storage.local')) loadEnv({ path: '.env.storage.local', override: true, quiet: true });
const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'MEDIA_STORAGE_BUCKET', 'DELIVERY_STORAGE_BUCKET'].filter((key) => !process.env[key]?.trim());
if (missing.length) {
  console.error(`BLOCKED — MANUAL CONFIG REQUIRED: faltan ${missing.join(', ')} (ver encabezado de este script).`);
  process.exit(2);
}
process.env.MEDIA_STORAGE_DRIVER = 'supabase';
process.env.CRM_SESSION_SECRET ??= randomBytes(32).toString('hex');
process.env.INTEGRATION_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
Object.assign(globalThis, { AsyncLocalStorage });

const { PaymentStatus, PlanCode } = await import('../generated/prisma/client');
const { crossTenantPrisma, prisma } = await import('../src/lib/prisma');
const { deliveryStorageStatus, resolveDeliveryStorage, supabaseOrigin } = await import('../src/lib/storage');
const { createCustomerWorkspace } = await import('../src/lib/subscription');
const { assignCompSubscription } = await import('../src/lib/billing/subscription-admin');
const { createOrder } = await import('../src/lib/commerce/orders');
const { processOrderPayment } = await import('../src/lib/commerce/payment-webhook');
const { currentDeliveryToken, revokeDigitalDelivery } = await import('../src/lib/commerce/delivery');
const { DELIVERABLE_MAX_BYTES, DELIVERABLE_MIME_TYPES } = await import('../src/lib/commerce/digital-assets/rules');
const { asUser } = await import('./fixtures/request-context');
const { POST: createProductRoute } = await import('../src/app/api/products/studio/route');
const { POST: createRoute } = await import('../src/app/api/products/[id]/assets/route');
const { POST: intentRoute } = await import('../src/app/api/products/[id]/assets/upload/route');
const { DELETE: deleteRoute } = await import('../src/app/api/products/[id]/assets/[assetId]/route');
const { GET: previewRoute } = await import('../src/app/api/products/[id]/assets/[assetId]/preview/route');
const { GET: itemRoute } = await import('../src/app/d/[token]/[item]/route');

let failures = 0;
const results: string[] = [];
function check(name: string, ok: boolean, detail = '') {
  results.push(name);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const status = deliveryStorageStatus();
check('D0. La capa de storage resuelve el bucket de entregables en Supabase', status.configured && status.driver === 'supabase', JSON.stringify(status));

const base = supabaseOrigin(process.env.SUPABASE_URL)!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
const auth = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };
type Bucket = { public?: boolean; file_size_limit?: number | null; allowed_mime_types?: string[] | null };
async function bucketConfig(name: string) {
  const response = await fetch(`${base}/storage/v1/bucket/${encodeURIComponent(name)}`, { headers: auth });
  return { ok: response.ok, status: response.status, bucket: (await response.json().catch(() => ({}))) as Bucket };
}
const deliverables = await bucketConfig(process.env.DELIVERY_STORAGE_BUCKET!.trim());
const allowed = deliverables.bucket.allowed_mime_types ?? [];
check(
  'D1. Bucket de entregables: existe, PRIVADO, con límite y admite PDF/audio/ZIP/MP4 (y nada activo)',
  deliverables.ok && deliverables.bucket.public === false && (deliverables.bucket.file_size_limit ?? 0) >= DELIVERABLE_MAX_BYTES &&
    DELIVERABLE_MIME_TYPES.every((mime) => allowed.includes(mime)) && !allowed.some((mime) => /html|svg|javascript|xml/.test(mime)),
  `HTTP ${deliverables.status} public=${deliverables.bucket.public} limit=${deliverables.bucket.file_size_limit} mime=${[...allowed].sort().join(',')}`,
);
const media = await bucketConfig(process.env.MEDIA_STORAGE_BUCKET!.trim());
check(
  'D2. Bucket de medios intacto: privado, ≤ 5 MB, solo jpeg/png/webp',
  media.ok && media.bucket.public === false && (media.bucket.file_size_limit ?? Infinity) <= 5 * 1024 * 1024 &&
    [...(media.bucket.allowed_mime_types ?? [])].sort().join(',') === 'image/jpeg,image/png,image/webp',
  `limit=${media.bucket.file_size_limit} mime=${[...(media.bucket.allowed_mime_types ?? [])].sort().join(',')}`,
);

const stamp = Date.now();
const workspaces: string[] = [];
const users: string[] = [];
const createdKeys: string[] = [];
async function makeWorkspace(suffix: string) {
  const created = await createCustomerWorkspace({ companyName: `qa-entregables-${suffix}-${stamp}`, ownerName: `QA ${suffix}`, email: `qa-entregables-${suffix}-${stamp}@studio.test`, password: 'contrasena-de-prueba-1234' });
  workspaces.push(created.workspace.id);
  users.push(created.user.id);
  await assignCompSubscription({ workspaceId: created.workspace.id, planCode: PlanCode.SCALE, via: 'cli', reason: 'qa storage entregables' });
  return { id: created.user.id, workspaceId: created.workspace.id };
}
const req = (path: string, body?: unknown, method = 'POST') => new Request(`http://localhost${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const p1 = (id: string) => ({ params: Promise.resolve({ id }) });
const p2 = (id: string, assetId: string) => ({ params: Promise.resolve({ id, assetId }) });
const PDF = new TextEncoder().encode('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
const HTML = new TextEncoder().encode('<html><script>alert(1)</script></html>');

/** Lo que hace el navegador: pedir la intencion, subir DIRECTO al bucket y confirmar. */
async function browserUpload(session: { id: string; workspaceId: string }, productId: string, fileName: string, type: string, bytes: Uint8Array, name: string) {
  const ticket = await asUser(session, () => intentRoute(req(`/api/products/${productId}/assets/upload`, { fileName, size: bytes.byteLength, type }), p1(productId)));
  const data = ((await ticket.json()) as { data?: { uploadUrl: string; intent: string; contentType: string } }).data!;
  const key = JSON.parse(Buffer.from(data.intent.split('.')[0], 'base64url').toString('utf8')).key as string;
  createdKeys.push(key);
  const put = await fetch(data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': data.contentType }, body: bytes as unknown as BodyInit });
  const created = await asUser(session, () => createRoute(req(`/api/products/${productId}/assets`, { source: 'upload', intent: data.intent, name }), p1(productId)));
  return { uploadUrl: data.uploadUrl, putStatus: put.status, status: created.status, body: (await created.json()) as { data?: { id: string }; message?: string }, key };
}
const exists = async (objectKey: string) => Boolean(await (await resolveDeliveryStorage()).head(objectKey, 4));

const A = await makeWorkspace('a');
const B = await makeWorkspace('b');
try {
  const product = await asUser(A, () => createProductRoute(req('/api/products/studio', { name: 'Entregables QA', type: 'DIGITAL', currency: 'CLP', basePrice: 1000, description: '', sku: '', variants: [] })));
  const productId = String(((await product.json()) as { data?: { id?: string } }).data?.id ?? '');
  await prisma.product.update({ where: { id: productId }, data: { status: 'ACTIVE' } });

  const pdf = await browserUpload(A, productId, 'guia.pdf', 'application/pdf', PDF, 'Guía QA');
  check('D3. Subida directa del navegador al bucket con URL firmada (sin pasar por la funcion) y confirmacion 201', pdf.putStatus >= 200 && pdf.putStatus < 300 && pdf.status === 201 && pdf.uploadUrl.startsWith(`${base}/storage/v1/object/upload/sign/`), `PUT ${pdf.putStatus} / ${pdf.status} ${pdf.body.message ?? ''}`);
  check('D4. El objeto existe bajo deliverables/<workspace>/<producto>/ y la URL de subida no lleva la clave de servicio', (await exists(pdf.key)) && pdf.key.startsWith(`deliverables/${A.workspaceId}/${productId}/`) && !pdf.uploadUrl.includes(serviceKey));

  const publicUrl = `${base}/storage/v1/object/public/${encodeURIComponent(process.env.DELIVERY_STORAGE_BUCKET!.trim())}/${pdf.key}`;
  const publicTry = await fetch(publicUrl);
  const anonTry = await fetch(`${base}/storage/v1/object/${encodeURIComponent(process.env.DELIVERY_STORAGE_BUCKET!.trim())}/${pdf.key}`);
  check('D5. Sin URL publica directa: la ruta publica y la anonima no sirven el archivo', !publicTry.ok && !anonTry.ok, `public=${publicTry.status} anon=${anonTry.status}`);

  const disguised = await browserUpload(A, productId, 'factura.pdf', 'application/pdf', HTML, 'Factura');
  check('D6. HTML disfrazado de PDF: el bucket lo acepta con tipo PDF, pero la firma lo rechaza y se BORRA', disguised.status === 400 && !(await exists(disguised.key)), `${disguised.status} ${disguised.body.message ?? ''}`);
  const svgTicket = await asUser(A, () => intentRoute(req(`/api/products/${productId}/assets/upload`, { fileName: 'x.svg', size: 10, type: 'image/svg+xml' }), p1(productId)));
  check('D7. SVG ni siquiera obtiene URL de subida', svgTicket.status === 400);

  const preview = await asUser(A, () => previewRoute(req('/x', undefined, 'GET'), p2(productId, pdf.body.data!.id)));
  const signed = preview.headers.get('location') ?? '';
  const signedFetch = signed ? await fetch(signed) : null;
  const signedBytes = signedFetch ? new Uint8Array(await signedFetch.arrayBuffer()) : new Uint8Array();
  check('D8. Vista previa del equipo: URL firmada de Supabase (vida corta) que sirve el PDF', preview.status === 302 && signed.startsWith(`${base}/storage/v1/object/sign/`) && signedFetch?.ok === true && signedBytes.byteLength === PDF.byteLength, `HTTP ${preview.status}`);
  const bPreview = await asUser(B, () => previewRoute(req('/x', undefined, 'GET'), p2(productId, pdf.body.data!.id)));
  check('D9. Otro workspace no obtiene vista previa (404)', bPreview.status === 404);

  // Venta → entrega → descarga del comprador.
  const variant = await prisma.productVariant.findFirstOrThrow({ where: { productId, isDefault: true } });
  const contact = await prisma.contact.create({ data: { workspaceId: A.workspaceId, firstName: 'QA', lastName: 'Storage', email: `qa-${stamp}@studio.test` } });
  const order = await createOrder({ workspaceId: A.workspaceId, contactId: contact.id, items: [{ variantId: variant.id, quantity: 1 }] });
  await processOrderPayment({ orderId: order.id, externalPaymentId: `qa-storage-${order.id}`, status: PaymentStatus.APPROVED, rawStatus: 'approved', amount: order.total, currency: order.currency, baseUrl: 'http://localhost', workspaceId: A.workspaceId, simulated: true });
  const delivery = await prisma.digitalDelivery.findFirstOrThrow({ where: { orderId: order.id }, include: { items: true } });
  const token = currentDeliveryToken(delivery)!;
  const itemId = delivery.items[0].id;
  const buyer = await itemRoute(new Request(`http://localhost/d/${token}/${itemId}`), { params: Promise.resolve({ token, item: itemId }) });
  const buyerUrl = buyer.headers.get('location') ?? '';
  const buyerFile = buyerUrl ? await fetch(buyerUrl) : null;
  const buyerBytes = buyerFile ? new Uint8Array(await buyerFile.arrayBuffer()) : new Uint8Array();
  check('D10. Comprador: el token valida y redirige a una URL firmada que descarga el PDF con su nombre', buyer.status === 302 && new URL(buyerUrl).searchParams.get('download') === 'Guía QA.pdf' && buyerFile?.ok === true && new TextDecoder().decode(buyerBytes.slice(0, 5)) === '%PDF-', `HTTP ${buyer.status} file=${buyerFile?.status}`);

  // Borrar el asset despues de entregarlo lo archiva y conserva el archivo.
  const removed = await asUser(A, () => deleteRoute(req('/x', undefined, 'DELETE'), p2(productId, pdf.body.data!.id)));
  check('D11. Borrar un asset entregado lo archiva y el objeto sigue en el bucket', removed.status === 200 && (await exists(pdf.key)));

  await revokeDigitalDelivery({ workspaceId: A.workspaceId, deliveryId: delivery.id });
  const revoked = await itemRoute(new Request(`http://localhost/d/${token}/${itemId}`), { params: Promise.resolve({ token, item: itemId }) });
  check('D12. Revocada: no se firma ninguna URL nueva', revoked.status === 303 && !(revoked.headers.get('location') ?? '').includes('/storage/v1/'));
} finally {
  const storage = await resolveDeliveryStorage();
  for (const key of createdKeys) await storage.remove(key).catch(() => null);
  const memberUsers = (await prisma.workspaceMembership.findMany({ where: { workspaceId: { in: workspaces } }, select: { userId: true } })).map((m) => m.userId);
  await crossTenantPrisma.workspace.deleteMany({ where: { id: { in: workspaces } } });
  await crossTenantPrisma.user.deleteMany({ where: { id: { in: [...new Set([...users, ...memberUsers])] } } });
  await prisma.$disconnect();
}
console.log(`\n== Resultado: ${results.length - failures}/${results.length} pruebas OK ==`);
if (failures > 0) process.exit(1);
