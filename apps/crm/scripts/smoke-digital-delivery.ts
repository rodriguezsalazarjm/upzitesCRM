/**
 * Punto 3 — Digital Asset Manager / Entrega digital: integracion contra la
 * base de PRUEBAS, por las RUTAS reales (sesion firmada, workspace activo) y el
 * flujo de pago existente (`processOrderPayment`, el mismo de la venta simulada
 * y del webhook de Mercado Pago). Almacenamiento: disco local (driver
 * filesystem); la prueba contra Supabase real es scripts/qa-storage-deliverables.ts.
 *
 *  A. Assets desde las rutas: subir (intencion firmada) + enlace, orden,
 *     activar/desactivar, editar, vista previa.
 *  B. Validacion: MIME, archivos disfrazados, URL insegura, mass assignment,
 *     intencion manipulada/ajena, path traversal.
 *  C. Autorizacion y aislamiento: MEMBER no muta; otro workspace no lista,
 *     edita, ordena, previsualiza, borra, reenvia ni revoca.
 *  D. Fulfillment: pago aprobado → DigitalDelivery con todos los activos, en
 *     orden; evento repetido → la misma entrega; main + bump; inactivo fuera;
 *     producto sin contenido → aviso, sin pagina enganosa.
 *  E. Snapshot: editar, desactivar, reemplazar o borrar despues del pago no
 *     cambia lo entregado; el archivo entregado sigue en el almacenamiento.
 *  F. Token: valido, ausente, manipulado, de otra entrega, item ajeno,
 *     FAILED sigue accesible, revocada bloqueada.
 *  G. Reenvio / historial / revocacion: sin duplicar, intento registrado,
 *     FAILED por transporte y reintento exitoso → SENT.
 *
 * Uso, desde apps/crm (exige TEST_DATABASE_URL con el marcador de base aislada):
 *   pnpm exec tsx scripts/smoke-digital-delivery.ts
 */
import './fixtures/test-environment';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { PaymentStatus, PlanCode, WorkspaceRole } from '../generated/prisma/client';

process.env.MEDIA_STORAGE_DRIVER = 'filesystem';
process.env.PLATFORM_EMAIL_FROM = '';

const { crossTenantPrisma, prisma } = await import('../src/lib/prisma');
const { createCustomerWorkspace } = await import('../src/lib/subscription');
const { assignCompSubscription } = await import('../src/lib/billing/subscription-admin');
const { addMembershipWithinPlan } = await import('../src/lib/entitlements/growth');
const { createOrder } = await import('../src/lib/commerce/orders');
const { processOrderPayment } = await import('../src/lib/commerce/payment-webhook');
const { resolveDelivery, sendDelivery } = await import('../src/lib/commerce/delivery');
const { orderDeliveryView } = await import('../src/lib/commerce/delivery-admin');
const { loadPublicCheckout } = await import('../src/lib/commerce/public-checkout');
const { signCheckoutToken } = await import('../src/lib/commerce/public-checkout-link');
const { resolveDeliveryStorage } = await import('../src/lib/storage');
const { LOCAL_MEDIA_DIR } = await import('../src/lib/storage/filesystem');
const { AGENT_TOOLS } = await import('../src/lib/agents/tools');
const { asUser } = await import('./fixtures/request-context');
const { POST: createProductRoute } = await import('../src/app/api/products/studio/route');
const { GET: listRoute, POST: createRoute } = await import('../src/app/api/products/[id]/assets/route');
const { POST: intentRoute } = await import('../src/app/api/products/[id]/assets/upload/route');
const { PUT: localUploadRoute } = await import('../src/app/api/products/[id]/assets/upload/local/route');
const { PATCH: patchRoute, DELETE: deleteRoute } = await import('../src/app/api/products/[id]/assets/[assetId]/route');
const { GET: previewRoute } = await import('../src/app/api/products/[id]/assets/[assetId]/preview/route');
const { POST: resendRoute } = await import('../src/app/api/orders/[id]/resend/route');
const { POST: revokeRoute } = await import('../src/app/api/orders/[id]/revoke/route');
const { GET: itemRoute } = await import('../src/app/d/[token]/[item]/route');

const results: { name: string; ok: boolean }[] = [];
let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const stamp = Date.now();
const createdWorkspaces: string[] = [];
const createdUsers: string[] = [];
type Session = { id: string; workspaceId: string };
const BASE = 'http://localhost:3101';

async function makeWorkspace(suffix: string) {
  const created = await createCustomerWorkspace({ companyName: `entrega-${suffix}-${stamp}`, ownerName: `Owner ${suffix}`, email: `owner-${suffix}-${stamp}@entrega.test`, password: 'contrasena-de-prueba-1234' });
  createdWorkspaces.push(created.workspace.id);
  createdUsers.push(created.user.id);
  await assignCompSubscription({ workspaceId: created.workspace.id, planCode: PlanCode.SCALE, via: 'cli', reason: 'smoke entrega digital' });
  return { workspaceId: created.workspace.id, session: { id: created.user.id, workspaceId: created.workspace.id } as Session };
}

async function addMember(workspaceId: string, label: string, role: WorkspaceRole): Promise<Session> {
  const user = await prisma.user.create({ data: { name: label, email: `${label}-${stamp}@entrega.test`, passwordHash: 'x' } });
  createdUsers.push(user.id);
  await addMembershipWithinPlan({ workspaceId, userId: user.id, role });
  return { id: user.id, workspaceId };
}

const req = (path: string, body?: unknown, method = 'POST') =>
  new Request(`http://localhost${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const p1 = (id: string) => ({ params: Promise.resolve({ id }) });
const p2 = (id: string, assetId: string) => ({ params: Promise.resolve({ id, assetId }) });
async function json(response: Response) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cuerpos de varias rutas distintas; cada check lee el campo que le toca
  return (await response.clone().json().catch(() => ({}))) as { code?: string; message?: string; field?: string; data?: any };
}

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(values.flatMap((value) => (typeof value === 'string' ? [...value].map((char) => char.charCodeAt(0)) : [value])));
const PDF = bytes('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n');
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 0, 0);
const MP3 = bytes('ID3', 4, 0, 0, 0, 0, 0, 0xff, 0xfb, 0x90, 0x64);
const HTML_AS_PDF = bytes('<html><body><script>alert(1)</script></body></html>');
const SVG = bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

async function createProduct(s: Session, name: string, type: 'DIGITAL' | 'SERVICE' | 'PHYSICAL', price: number) {
  const response = await asUser(s, () => createProductRoute(req('/api/products/studio', { name, type, currency: 'CLP', basePrice: price, description: '', sku: '', variants: [] })));
  const id = String((await json(response)).data?.id ?? '');
  await prisma.product.update({ where: { id }, data: { status: 'ACTIVE' } });
  const variant = await prisma.productVariant.findFirstOrThrow({ where: { productId: id, isDefault: true } });
  return { id, variantId: variant.id };
}

/** Sube un archivo por el mismo camino que la interfaz: intencion → PUT → confirmar. */
async function upload(s: Session, productId: string, fileName: string, type: string, content: Uint8Array, name: string, extra: Record<string, unknown> = {}) {
  const ticket = await asUser(s, () => intentRoute(req(`/api/products/${productId}/assets/upload`, { fileName, size: content.byteLength, type }), p1(productId)));
  const ticketBody = await json(ticket);
  if (ticket.status !== 200) return { status: ticket.status, body: ticketBody, stage: 'intent' as const };
  const { uploadUrl, intent } = ticketBody.data as { uploadUrl: string; intent: string };
  const put = await asUser(s, () => localUploadRoute(new Request(`http://localhost${uploadUrl}`, { method: 'PUT', body: content as unknown as BodyInit }), p1(productId)));
  if (put.status !== 200) return { status: put.status, body: await json(put), stage: 'put' as const, intent };
  const created = await asUser(s, () => createRoute(req(`/api/products/${productId}/assets`, { source: 'upload', intent, name, ...extra }), p1(productId)));
  return { status: created.status, body: await json(created), stage: 'finalize' as const, intent };
}
const addLink = (s: Session, productId: string, name: string, url: string, format = 'LINK') =>
  asUser(s, () => createRoute(req(`/api/products/${productId}/assets`, { source: 'link', name, url, format }), p1(productId)));
const patch = (s: Session, productId: string, assetId: string, payload: unknown) => asUser(s, () => patchRoute(req(`/api/products/${productId}/assets/${assetId}`, payload, 'PATCH'), p2(productId, assetId)));
const list = async (s: Session, productId: string) => (await json(await asUser(s, () => listRoute(req(`/api/products/${productId}/assets`, undefined, 'GET'), p1(productId))))).data as { id: string; name: string; isActive: boolean; position: number; url: string | null; source: string; format: string }[] | undefined;
const item = (token: string, itemId: string, query = '') => itemRoute(new Request(`http://localhost/d/${token}/${itemId}${query}`), { params: Promise.resolve({ token, item: itemId }) });

async function contactFor(workspaceId: string, email: string) {
  return prisma.contact.create({ data: { workspaceId, firstName: 'Compradora', lastName: 'Smoke', email } });
}
async function pay(workspaceId: string, orderId: string, paymentId = `pay-${orderId}`) {
  const order = await prisma.customerOrder.findUniqueOrThrow({ where: { id: orderId } });
  return processOrderPayment({ orderId, externalPaymentId: paymentId, status: PaymentStatus.APPROVED, rawStatus: 'approved', amount: order.total, currency: order.currency, baseUrl: BASE, workspaceId, simulated: true });
}
async function tokenOf(orderId: string) {
  const view = await loadPublicCheckout(orderId, signCheckoutToken(orderId));
  if (!view.ok || view.delivery?.kind !== 'READY') return null;
  return view.delivery.path.split('/d/')[1];
}

try {
  console.log('\n== Preparacion: A (OWNER/ADMIN/MEMBER) y B (OWNER), ambos SCALE ==');
  const A = await makeWorkspace('a');
  const B = await makeWorkspace('b');
  const adminA = await addMember(A.workspaceId, 'admin-a', WorkspaceRole.ADMIN);
  const memberA = await addMember(A.workspaceId, 'member-a', WorkspaceRole.MEMBER);
  const course = await createProduct(A.session, `Curso ${stamp}`, 'DIGITAL', 19990);
  const bonus = await createProduct(A.session, `Plantillas ${stamp}`, 'DIGITAL', 4990);
  const empty = await createProduct(A.session, `Vacío ${stamp}`, 'DIGITAL', 990);
  const productB = await createProduct(B.session, `Producto B ${stamp}`, 'DIGITAL', 5000);

  // =========================================================================
  console.log('\n== A. Assets desde las rutas ==');
  const pdf = await upload(A.session, course.id, 'Guía principal.pdf', 'application/pdf', PDF, 'Guía principal');
  const audio = await upload(adminA, course.id, 'audio-01.mp3', 'audio/mpeg', MP3, 'Audio 01');
  const zip = await upload(A.session, course.id, 'recursos.zip', 'application/x-zip-compressed', ZIP, 'Recursos');
  const video = await json(await addLink(A.session, course.id, 'Video de bienvenida', 'https://vimeo.com/123456', 'VIDEO'));
  const community = await json(await addLink(A.session, course.id, 'Comunidad privada', 'https://comunidad.example.com/acceso'));
  check('A1. OWNER sube un PDF y ADMIN un audio; ZIP desde tipo de Windows', pdf.status === 201 && audio.status === 201 && zip.status === 201, JSON.stringify([pdf.status, audio.status, zip.status, pdf.body.message]));
  check('A2. Se agregan dos enlaces (video y enlace)', Boolean(video.data?.id && community.data?.id));

  let assets = (await list(A.session, course.id)) ?? [];
  check('A3. Cinco assets asociados al producto, en orden de alta', assets.map((a) => a.name).join('|') === 'Guía principal|Audio 01|Recursos|Video de bienvenida|Comunidad privada', assets.map((a) => a.name).join('|'));
  const stored = await prisma.digitalAsset.findMany({ where: { productId: course.id } });
  const pdfAsset = stored.find((a) => a.name === 'Guía principal')!;
  check('A4. El archivo guarda tipo verificado, tamaño y clave del servidor (no el nombre original)', pdfAsset.mimeType === 'application/pdf' && pdfAsset.format === 'PDF' && pdfAsset.sizeBytes === PDF.byteLength && pdfAsset.target.startsWith(`deliverables/${A.workspaceId}/${course.id}/`) && !pdfAsset.target.includes('Gu'));
  check('A5. La lista no expone la clave de almacenamiento', JSON.stringify(assets).includes('deliverables/') === false);

  const zipId = assets.find((a) => a.name === 'Recursos')!.id;
  await patch(A.session, course.id, zipId, { action: 'move', direction: 'up' });
  await patch(A.session, course.id, zipId, { action: 'move', direction: 'up' });
  assets = (await list(A.session, course.id)) ?? [];
  check('A6. Reordenar con subir/bajar persiste', assets.map((a) => a.name).slice(0, 3).join('|') === 'Recursos|Guía principal|Audio 01', assets.map((a) => a.name).join('|'));
  const edge = await json(await patch(A.session, course.id, zipId, { action: 'move', direction: 'up' }));
  check('A7. Mover el primero hacia arriba no rompe el orden', edge.data?.moved === false);

  const communityId = community.data.id as string;
  await patch(A.session, course.id, communityId, { action: 'deactivate' });
  assets = (await list(A.session, course.id)) ?? [];
  check('A8. Desactivar persiste (sigue existiendo)', assets.find((a) => a.id === communityId)?.isActive === false && assets.length === 5);
  await patch(A.session, course.id, communityId, { action: 'activate' });
  await patch(A.session, course.id, communityId, { action: 'update', name: 'Comunidad VIP', url: 'https://comunidad.example.com/vip' });
  assets = (await list(A.session, course.id)) ?? [];
  check('A9. Reactivar y editar nombre/URL', assets.find((a) => a.id === communityId)?.isActive === true && assets.find((a) => a.id === communityId)?.name === 'Comunidad VIP' && assets.find((a) => a.id === communityId)?.url === 'https://comunidad.example.com/vip');

  const preview = await asUser(A.session, () => previewRoute(req('/x', undefined, 'GET'), p2(course.id, pdfAsset.id)));
  const previewBytes = new Uint8Array(await preview.arrayBuffer());
  check('A10. Vista previa del equipo: el PDF privado, como descarga y sin sniffing', preview.status === 200 && preview.headers.get('content-type') === 'application/pdf' && (preview.headers.get('content-disposition') ?? '').startsWith('attachment') && preview.headers.get('x-content-type-options') === 'nosniff' && previewBytes.byteLength === PDF.byteLength);
  const previewLink = await asUser(A.session, () => previewRoute(req('/x', undefined, 'GET'), p2(course.id, communityId)));
  check('A11. Vista previa de un enlace redirige a su URL', previewLink.status === 302 && previewLink.headers.get('location') === 'https://comunidad.example.com/vip');
  check('A12. La vista previa no crea entregas ni ventas', (await prisma.digitalDelivery.count({ where: { workspaceId: A.workspaceId } })) === 0 && (await prisma.customerOrder.count({ where: { workspaceId: A.workspaceId } })) === 0);

  // =========================================================================
  console.log('\n== B. Validacion ==');
  const disguised = await upload(A.session, course.id, 'factura.pdf', 'application/pdf', HTML_AS_PDF, 'Factura');
  check('B1. HTML disfrazado de PDF: rechazado y el objeto se borra', disguised.status === 400 && disguised.stage === 'finalize' && (await prisma.digitalAsset.count({ where: { productId: course.id, name: 'Factura' } })) === 0);
  const leftover = disguised.intent ? JSON.parse(Buffer.from(disguised.intent.split('.')[0], 'base64url').toString('utf8')).key : '';
  check('B2. …y no queda el archivo en el almacenamiento', leftover !== '' && (await (await resolveDeliveryStorage()).head(leftover, 4)) === null);
  const svg = await upload(A.session, course.id, 'logo.svg', 'image/svg+xml', SVG, 'Logo');
  check('B3. SVG rechazado antes de subir', svg.status === 400 && svg.stage === 'intent');
  const exe = await upload(A.session, course.id, 'setup.exe', 'application/x-msdownload', bytes('MZ', 0x90, 0), 'Setup');
  check('B4. Ejecutable rechazado', exe.status === 400 && exe.stage === 'intent');
  const zipAsPdf = await upload(A.session, course.id, 'doc.pdf', 'application/pdf', ZIP, 'Doc');
  check('B5. ZIP con extension .pdf: rechazado por firma', zipAsPdf.status === 400 && /no corresponde/.test(zipAsPdf.body.message ?? ''));
  for (const [label, url] of [['javascript:', 'javascript:alert(1)'], ['data:', 'data:text/html,hola'], ['file:', 'file:///etc/passwd'], ['http:', 'http://inseguro.example.com']] as const) {
    const response = await addLink(A.session, course.id, `Malo ${label}`, url);
    check(`B6. URL ${label} rechazada`, response.status === 400);
  }
  const massLink = await asUser(A.session, () => createRoute(req(`/api/products/${course.id}/assets`, { source: 'link', name: 'X', url: 'https://x.example.com', workspaceId: B.workspaceId, isActive: false }), p1(course.id)));
  check('B7. Mass assignment (workspaceId, isActive) rechazado', massLink.status === 400);
  const massPatch = await patch(A.session, course.id, communityId, { action: 'update', name: 'Y', target: 'deliverables/otro/x.pdf', productId: empty.id });
  check('B8. Mass assignment en PATCH (target, productId) rechazado', massPatch.status === 400);

  const ticketA = await json(await asUser(A.session, () => intentRoute(req(`/api/products/${course.id}/assets/upload`, { fileName: 'a.pdf', size: PDF.byteLength, type: 'application/pdf' }), p1(course.id))));
  const intentA = ticketA.data.intent as string;
  const [payload, signature] = intentA.split('.');
  const forgedPayload = Buffer.from(Buffer.from(payload, 'base64url').toString('utf8').replace(/deliverables\/[^"]+/, `deliverables/${A.workspaceId}/${course.id}/../../../etc/passwd`), 'utf8').toString('base64url');
  const forged = await asUser(A.session, () => createRoute(req(`/api/products/${course.id}/assets`, { source: 'upload', intent: `${forgedPayload}.${signature}`, name: 'Hack' }), p1(course.id)));
  check('B9. Intencion manipulada (path traversal en la clave) rechazada', forged.status === 400);
  const otherProduct = await asUser(A.session, () => createRoute(req(`/api/products/${empty.id}/assets`, { source: 'upload', intent: intentA, name: 'Cruzado' }), p1(empty.id)));
  check('B10. Intencion de otro producto rechazada', otherProduct.status === 400);
  const localPut = await asUser(A.session, () => localUploadRoute(new Request(`http://localhost/api/products/${course.id}/assets/upload/local?intent=${encodeURIComponent(`${forgedPayload}.${signature}`)}`, { method: 'PUT', body: PDF as unknown as BodyInit }), p1(course.id)));
  check('B11. La subida local tampoco acepta una intencion manipulada', localPut.status === 400);

  // =========================================================================
  console.log('\n== C. Autorizacion y aislamiento ==');
  const memberAdd = await addLink(memberA, course.id, 'Del member', 'https://x.example.com/m');
  const memberPatch = await patch(memberA, course.id, communityId, { action: 'deactivate' });
  const memberPreview = await asUser(memberA, () => previewRoute(req('/x', undefined, 'GET'), p2(course.id, pdfAsset.id)));
  const memberDelete = await asUser(memberA, () => deleteRoute(req('/x', undefined, 'DELETE'), p2(course.id, communityId)));
  check('C1. MEMBER no agrega, no edita, no previsualiza ni borra (403 en el servidor)', [memberAdd, memberPatch, memberPreview, memberDelete].every((r) => r.status === 403), [memberAdd, memberPatch, memberPreview, memberDelete].map((r) => r.status).join(','));
  const memberList = await list(memberA, course.id);
  check('C2. MEMBER puede ver la lista (lectura del catalogo, como el Studio)', (memberList?.length ?? 0) === 5);

  const bList = await asUser(B.session, () => listRoute(req('/x', undefined, 'GET'), p1(course.id)));
  const bAdd = await addLink(B.session, course.id, 'Intruso', 'https://x.example.com/b');
  const bPatch = await patch(B.session, course.id, communityId, { action: 'deactivate' });
  const bMove = await patch(B.session, course.id, communityId, { action: 'move', direction: 'up' });
  const bPreview = await asUser(B.session, () => previewRoute(req('/x', undefined, 'GET'), p2(course.id, pdfAsset.id)));
  const bDelete = await asUser(B.session, () => deleteRoute(req('/x', undefined, 'DELETE'), p2(course.id, pdfAsset.id)));
  // Un asset de A colgado del producto de B tampoco resuelve.
  const bCross = await patch(B.session, productB.id, communityId, { action: 'deactivate' });
  check('C3. Otro workspace no lista, agrega, edita, ordena, previsualiza ni borra (404)', [bList, bAdd, bPatch, bMove, bPreview, bDelete, bCross].every((r) => r.status === 404), [bList, bAdd, bPatch, bMove, bPreview, bDelete, bCross].map((r) => r.status).join(','));
  const bIntent = await asUser(B.session, () => createRoute(req(`/api/products/${productB.id}/assets`, { source: 'upload', intent: intentA, name: 'Robado' }), p1(productB.id)));
  check('C4. La intencion de A no sirve en un producto de B', bIntent.status === 400);
  check('C5. Nada cambio en A tras los intentos ajenos', (await prisma.digitalAsset.count({ where: { productId: course.id, archivedAt: null } })) === 5 && (await prisma.digitalAsset.findUniqueOrThrow({ where: { id: communityId } })).isActive);

  // =========================================================================
  console.log('\n== D. Fulfillment, idempotencia, main + bump ==');
  await addLink(A.session, bonus.id, 'Plantillas Notion', 'https://notion.example.com/plantillas');
  await upload(A.session, bonus.id, 'checklist.pdf', 'application/pdf', PDF, 'Checklist');
  const inactiveBonus = await json(await addLink(A.session, bonus.id, 'Borrador interno', 'https://notion.example.com/borrador'));
  await patch(A.session, bonus.id, inactiveBonus.data.id, { action: 'deactivate' });

  // Sin ningun canal configurado (sin dominio de email, sin WhatsApp) la entrega
  // existe y funciona, pero NO se marca SENT ni FAILED: queda AVAILABLE con motivo.
  const noChannelBuyer = await contactFor(A.workspaceId, `sin-canal-${stamp}@entrega.test`);
  const noChannelOrder = await createOrder({ workspaceId: A.workspaceId, contactId: noChannelBuyer.id, items: [{ variantId: bonus.variantId, quantity: 1 }] });
  await pay(A.workspaceId, noChannelOrder.id);
  const noChannel = await prisma.digitalDelivery.findFirstOrThrow({ where: { orderId: noChannelOrder.id } });
  check('D0. Sin canal de envio: AVAILABLE (ni SENT ni FAILED) con motivo legible', noChannel.status === 'AVAILABLE' && noChannel.attempts === 1 && /Sin envío automático/.test(noChannel.lastError ?? '') && noChannel.sentAt === null, `${noChannel.status} ${noChannel.lastError}`);
  check('D0b. …y el comprador igual tiene su enlace en la pagina post-compra', Boolean(await tokenOf(noChannelOrder.id)));

  // El negocio configura su dominio de email (infraestructura existente): desde
  // aqui el aviso sale por el proveedor guionado de pruebas.
  await prisma.emailDomain.create({ data: { workspaceId: A.workspaceId, domain: `envios-${stamp}.test`, status: 'VERIFIED', fromEmail: `hola@envios-${stamp}.test`, verifiedAt: new Date() } });

  const buyer = await contactFor(A.workspaceId, `compradora-${stamp}@entrega.test`);
  const simple = await createOrder({ workspaceId: A.workspaceId, contactId: buyer.id, items: [{ variantId: course.variantId, quantity: 1 }] });
  const paid = await pay(A.workspaceId, simple.id);
  const delivery = await prisma.digitalDelivery.findFirstOrThrow({ where: { orderId: simple.id }, include: { items: { orderBy: { position: 'asc' } } } });
  check('D1. Pago aprobado → una DigitalDelivery con TODOS los activos, en el orden configurado', paid.handled && paid.delivered === 5 && delivery.items.map((i) => i.name).join('|') === 'Recursos|Guía principal|Audio 01|Video de bienvenida|Comunidad VIP', delivery.items.map((i) => i.name).join('|'));
  check('D2. Pedido FULFILLED con un fulfillment DIGITAL', (await prisma.customerOrder.findUniqueOrThrow({ where: { id: simple.id } })).status === 'FULFILLED' && (await prisma.fulfillmentOrder.count({ where: { orderId: simple.id, type: 'DIGITAL' } })) === 1);
  check('D3. Envio real por el canal existente: email simulado (no se presenta como real) → SENT', delivery.status === 'SENT' && delivery.attempts === 1 && delivery.sentAt !== null, `${delivery.status} ${delivery.lastError}`);
  const repeated = await pay(A.workspaceId, simple.id);
  const repeatedOther = await pay(A.workspaceId, simple.id, `pay-otro-${simple.id}`);
  check('D4. El mismo pago repetido (y un segundo pago) no duplican entrega, items ni fulfillment',
    repeated.alreadyProcessed === true && repeatedOther.delivered === 0 &&
      (await prisma.digitalDelivery.count({ where: { orderId: simple.id } })) === 1 &&
      (await prisma.digitalDeliveryItem.count({ where: { deliveryId: delivery.id } })) === 5 &&
      (await prisma.fulfillmentOrder.count({ where: { orderId: simple.id } })) === 1 &&
      (await prisma.digitalDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).attempts === 1);
  const concurrentOrder = await createOrder({ workspaceId: A.workspaceId, contactId: buyer.id, items: [{ variantId: bonus.variantId, quantity: 1 }] });
  await Promise.all([pay(A.workspaceId, concurrentOrder.id, `c1-${concurrentOrder.id}`), pay(A.workspaceId, concurrentOrder.id, `c2-${concurrentOrder.id}`)]);
  check('D5. Dos pagos simultaneos del mismo pedido: una sola entrega', (await prisma.digitalDelivery.count({ where: { orderId: concurrentOrder.id } })) === 1);

  const bumpOrder = await createOrder({ workspaceId: A.workspaceId, contactId: buyer.id, items: [{ variantId: course.variantId, quantity: 1 }, { variantId: bonus.variantId, quantity: 1 }] });
  await prisma.customerOrder.update({ where: { id: bumpOrder.id }, data: { metadata: { mainVariantId: course.variantId, bumpVariantId: bonus.variantId, bumpSelected: true } } });
  await pay(A.workspaceId, bumpOrder.id);
  const bumpDelivery = await prisma.digitalDelivery.findFirstOrThrow({ where: { orderId: bumpOrder.id }, include: { items: { orderBy: { position: 'asc' } } } });
  check('D6. Main + bump: una entrega con los 5 del curso y los 2 activos del adicional, principal primero',
    bumpDelivery.items.length === 7 && bumpDelivery.items.slice(0, 5).every((i) => i.productName === `Curso ${stamp}`) && bumpDelivery.items.slice(5).every((i) => i.productName === `Plantillas ${stamp}`),
    bumpDelivery.items.map((i) => `${i.productName}:${i.name}`).join('|'));
  check('D7. El asset inactivo del adicional no se entrega', !bumpDelivery.items.some((i) => i.name === 'Borrador interno'));

  const emptyOrder = await createOrder({ workspaceId: A.workspaceId, contactId: buyer.id, items: [{ variantId: empty.variantId, quantity: 1 }] });
  const emptyPaid = await pay(A.workspaceId, emptyOrder.id);
  const emptyAlert = await prisma.workspaceAlert.findFirst({ where: { workspaceId: A.workspaceId, dedupeKey: `delivery-empty:${emptyOrder.id}` } });
  const emptyView = await loadPublicCheckout(emptyOrder.id, signCheckoutToken(emptyOrder.id));
  check('D8. Producto digital sin contenido: sin entrega, aviso al negocio y la pagina del comprador no promete un enlace',
    emptyPaid.handled && emptyPaid.delivered === 0 && (await prisma.digitalDelivery.count({ where: { orderId: emptyOrder.id } })) === 0 && Boolean(emptyAlert) && emptyView.ok && emptyView.delivery?.kind === 'PENDING');
  await pay(A.workspaceId, emptyOrder.id, `empty-2-${emptyOrder.id}`);
  check('D9. …y el aviso no se duplica', (await prisma.auditLog.count({ where: { workspaceId: A.workspaceId, action: 'order.digital_delivery_empty', entityId: emptyOrder.id } })) === 1);

  const physical = await createProduct(A.session, `Taza ${stamp}`, 'PHYSICAL', 7990);
  const physicalOrder = await createOrder({ workspaceId: A.workspaceId, contactId: buyer.id, items: [{ variantId: physical.variantId, quantity: 1 }] });
  await pay(A.workspaceId, physicalOrder.id);
  check('D10. Producto fisico sin assets: no se fuerza entrega digital ni aviso', (await prisma.digitalDelivery.count({ where: { orderId: physicalOrder.id } })) === 0 && !(await prisma.workspaceAlert.findFirst({ where: { workspaceId: A.workspaceId, dedupeKey: `delivery-empty:${physicalOrder.id}` } })));

  // =========================================================================
  console.log('\n== E. Snapshot: lo entregado no se reescribe ==');
  const audioId = assets.find((a) => a.name === 'Audio 01')!.id;
  await patch(A.session, course.id, audioId, { action: 'update', name: 'Audio 01 (nuevo nombre)' });
  await patch(A.session, course.id, communityId, { action: 'deactivate' });
  const replacement = await upload(A.session, course.id, 'guia-v2.pdf', 'application/pdf', PDF, 'Guía principal v2', { replaceAssetId: pdfAsset.id });
  const removedZip = await json(await asUser(A.session, () => deleteRoute(req('/x', undefined, 'DELETE'), p2(course.id, zipId))));
  const after = await prisma.digitalDeliveryItem.findMany({ where: { deliveryId: delivery.id }, orderBy: { position: 'asc' } });
  check('E1. Renombrar, desactivar, reemplazar y borrar NO cambian la entrega ya hecha', after.map((i) => i.name).join('|') === 'Recursos|Guía principal|Audio 01|Video de bienvenida|Comunidad VIP' && after.every((i) => i.target === delivery.items.find((d) => d.id === i.id)?.target));
  check('E2. Reemplazo = objeto nuevo; el entregado sigue en el almacenamiento', replacement.status === 201 && (await prisma.digitalAsset.findUniqueOrThrow({ where: { id: replacement.body.data.id } })).target !== pdfAsset.target && (await (await resolveDeliveryStorage()).head(pdfAsset.target, 4)) !== null);
  check('E3. Borrar un asset ya entregado lo archiva (no cascade) y conserva su archivo', removedZip.data?.archived === true && (await prisma.digitalAsset.findUniqueOrThrow({ where: { id: zipId } })).archivedAt !== null && (await (await resolveDeliveryStorage()).head(after[0].target, 4)) !== null);
  const freshLink = await json(await addLink(A.session, course.id, 'Temporal', 'https://x.example.com/t'));
  const removedFresh = await json(await asUser(A.session, () => deleteRoute(req('/x', undefined, 'DELETE'), p2(course.id, freshLink.data.id))));
  check('E4. Borrar uno nunca entregado lo elimina de verdad', removedFresh.data?.archived === false && (await prisma.digitalAsset.count({ where: { id: freshLink.data.id } })) === 0);
  const fresh = await createOrder({ workspaceId: A.workspaceId, contactId: buyer.id, items: [{ variantId: course.variantId, quantity: 1 }] });
  await pay(A.workspaceId, fresh.id);
  const freshItems = await prisma.digitalDeliveryItem.findMany({ where: { delivery: { orderId: fresh.id } }, orderBy: { position: 'asc' } });
  check('E5. Una compra nueva ya usa la configuracion nueva (v2, sin ZIP ni comunidad)', freshItems.map((i) => i.name).join('|') === 'Guía principal v2|Audio 01 (nuevo nombre)|Video de bienvenida', freshItems.map((i) => i.name).join('|'));
  check('E6. El orden sigue compacto tras archivar', ((await list(A.session, course.id)) ?? []).map((a) => a.position).join(',') === '1,2,3,4');

  // =========================================================================
  console.log('\n== F. Enlace seguro ==');
  const token = await tokenOf(simple.id);
  check('F1. La pagina post-compra entrega el enlace (token derivado, no guardado en claro)', Boolean(token) && !JSON.stringify(await prisma.digitalDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).includes(token!));
  const resolved = await resolveDelivery(token!);
  check('F2. Token valido: los 5 contenidos de ESA entrega, sin claves ni ids del negocio', resolved.ok && resolved.items.length === 5 && !JSON.stringify(resolved).includes('deliverables/') && !JSON.stringify(resolved).includes(A.workspaceId));
  const pdfItem = after.find((i) => i.name === 'Guía principal')!;
  const download = await item(token!, pdfItem.id);
  const downloaded = new Uint8Array(await download.arrayBuffer());
  check('F3. Descargar el PDF entregado: bytes correctos, attachment, nosniff, sin cache', download.status === 200 && downloaded.byteLength === PDF.byteLength && (download.headers.get('content-disposition') ?? '').includes('attachment') && download.headers.get('x-content-type-options') === 'nosniff' && (download.headers.get('cache-control') ?? '').includes('no-store'));
  const linkItem = after.find((i) => i.name === 'Video de bienvenida')!;
  const opened = await item(token!, linkItem.id);
  check('F4. Abrir el enlace externo redirige a su URL', opened.status === 302 && opened.headers.get('location') === 'https://vimeo.com/123456');
  const audioItem = after.find((i) => i.name === 'Audio 01')!;
  const play = await item(token!, audioItem.id, '?ver=1');
  check('F5. Reproducir audio: inline con su tipo verificado', play.status === 200 && play.headers.get('content-type') === 'audio/mpeg' && (play.headers.get('content-disposition') ?? '').startsWith('inline'));
  check('F6. Se registra el acceso', (await prisma.digitalDeliveryItem.findUniqueOrThrow({ where: { id: pdfItem.id } })).downloadCount === 1);

  const tampered = token!.slice(0, -2) + (token!.endsWith('AA') ? 'BB' : 'AA');
  check('F7. Token ausente / manipulado / inventado: 404 sin detalles', (await resolveDelivery('')).ok === false && (await resolveDelivery(tampered)).ok === false && (await item(tampered, pdfItem.id)).status === 404 && (await item('x', pdfItem.id)).status === 404);
  const bumpToken = await tokenOf(bumpOrder.id);
  const foreignItem = bumpDelivery.items[6];
  check('F8. Un item de OTRA entrega no se sirve con este token', (await item(token!, foreignItem.id)).status === 404 && (await item(bumpToken!, foreignItem.id)).status === 200);
  check('F9. Item inexistente: 404', (await item(token!, 'no-existe')).status === 404);

  // =========================================================================
  console.log('\n== G. Reenvio, historial y revocacion ==');
  const failing = await contactFor(A.workspaceId, `rebota-${stamp}@fallo.test`);
  const failOrder = await createOrder({ workspaceId: A.workspaceId, contactId: failing.id, items: [{ variantId: bonus.variantId, quantity: 1 }] });
  await pay(A.workspaceId, failOrder.id);
  const failedDelivery = await prisma.digitalDelivery.findFirstOrThrow({ where: { orderId: failOrder.id } });
  check('G1. Transporte que falla → FAILED con motivo legible', failedDelivery.status === 'FAILED' && failedDelivery.attempts === 1 && /email/i.test(failedDelivery.lastError ?? ''), `${failedDelivery.status} ${failedDelivery.lastError}`);
  const failedToken = await tokenOf(failOrder.id);
  check('G2. FAILED no bloquea al comprador: el enlace funciona (el fallo fue del aviso)', (await resolveDelivery(failedToken!)).ok === true);
  const retryFail = await asUser(A.session, () => resendRoute(req(`/api/orders/${failOrder.id}/resend`, { deliveryId: failedDelivery.id }), p1(failOrder.id)));
  const afterRetryFail = await prisma.digitalDelivery.findUniqueOrThrow({ where: { id: failedDelivery.id } });
  check('G3. Reenvio que vuelve a fallar: misma entrega, intento registrado, sigue FAILED', retryFail.status === 200 && (await json(retryFail)).data?.status === 'FAILED' && afterRetryFail.attempts === 2 && (await prisma.digitalDelivery.count({ where: { orderId: failOrder.id } })) === 1);
  await prisma.contact.update({ where: { id: failing.id }, data: { email: `corregido-${stamp}@entrega.test` } });
  const retryOk = await json(await asUser(adminA, () => resendRoute(req(`/api/orders/${failOrder.id}/resend`, { deliveryId: failedDelivery.id }), p1(failOrder.id))));
  const afterRetryOk = await prisma.digitalDelivery.findUniqueOrThrow({ where: { id: failedDelivery.id } });
  check('G4. Reintento exitoso (ADMIN) → SENT, sin duplicar, mismo enlace', retryOk.data?.status === 'SENT' && retryOk.data?.emailSimulated === true && afterRetryOk.status === 'SENT' && afterRetryOk.attempts === 3 && afterRetryOk.lastError === null && afterRetryOk.tokenHash === failedDelivery.tokenHash && (await prisma.digitalDelivery.count({ where: { orderId: failOrder.id } })) === 1);
  const thrown = await sendDelivery({ workspaceId: A.workspaceId, deliveryId: failedDelivery.id, baseUrl: BASE, reason: 'resend', transport: async () => { throw new Error('caido con token secreto'); } });
  const afterThrow = await prisma.digitalDelivery.findUniqueOrThrow({ where: { id: failedDelivery.id } });
  check('G5. Error inesperado del transporte → FAILED con mensaje seguro (sin detalles internos)', thrown.ok && thrown.status === 'FAILED' && afterThrow.status === 'FAILED' && !(afterThrow.lastError ?? '').includes('secreto'));
  await sendDelivery({ workspaceId: A.workspaceId, deliveryId: failedDelivery.id, baseUrl: BASE, reason: 'resend', transport: async () => ({ whatsapp: true, email: false, needsHuman: false }) });
  check('G6. …y un reintento posterior lo recupera', (await prisma.digitalDelivery.findUniqueOrThrow({ where: { id: failedDelivery.id } })).status === 'SENT');

  const memberResend = await asUser(memberA, () => resendRoute(req(`/api/orders/${simple.id}/resend`, { deliveryId: delivery.id }), p1(simple.id)));
  const bResend = await asUser(B.session, () => resendRoute(req(`/api/orders/${simple.id}/resend`, { deliveryId: delivery.id }), p1(simple.id)));
  const bRevoke = await asUser(B.session, () => revokeRoute(req(`/api/orders/${simple.id}/revoke`, { deliveryId: delivery.id }), p1(simple.id)));
  const wrongOrder = await asUser(A.session, () => revokeRoute(req(`/api/orders/${bumpOrder.id}/revoke`, { deliveryId: delivery.id }), p1(bumpOrder.id)));
  check('G7. MEMBER no reenvia (403); B no reenvia ni revoca (404); una entrega no se revoca desde otro pedido', memberResend.status === 403 && bResend.status === 404 && bRevoke.status === 404 && wrongOrder.status === 404, [memberResend.status, bResend.status, bRevoke.status, wrongOrder.status].join(','));
  check('G8. B no ve el historial de A', (await orderDeliveryView(B.workspaceId, simple.id)) === null);

  const before = await item(token!, pdfItem.id);
  const revoke = await asUser(A.session, () => revokeRoute(req(`/api/orders/${simple.id}/revoke`, { deliveryId: delivery.id }), p1(simple.id)));
  const revokedPage = await resolveDelivery(token!);
  const revokedItem = await item(token!, pdfItem.id);
  const revokedLink = await item(token!, linkItem.id);
  const revokedResend = await asUser(A.session, () => resendRoute(req(`/api/orders/${simple.id}/resend`, { deliveryId: delivery.id }), p1(simple.id)));
  const revokedCheckout = await loadPublicCheckout(simple.id, signCheckoutToken(simple.id));
  check('G9. Revocacion: antes 200; despues la pagina dice REVOKED, archivos y enlaces no se sirven, no se reenvia y la post-compra no muestra enlace',
    before.status === 200 && revoke.status === 200 && !revokedPage.ok && revokedPage.reason === 'REVOKED' && revokedItem.status === 303 && revokedLink.status === 303 && revokedResend.status === 409 && revokedCheckout.ok && revokedCheckout.delivery?.kind === 'REVOKED');
  const again = await json(await asUser(A.session, () => revokeRoute(req(`/api/orders/${simple.id}/revoke`, { deliveryId: delivery.id }), p1(simple.id))));
  check('G10. Revocar dos veces es idempotente', again.data?.already === true);

  const history = await orderDeliveryView(A.workspaceId, failOrder.id);
  const events = history?.deliveries[0].events.map((event) => event.label) ?? [];
  check('G11. Historial: creada, fallida, reenvios y enviada, con actor en los manuales', events.includes('Entrega creada') && events.includes('Envío fallido') && events.includes('Reenvío solicitado') && events.includes('Enviada') && history!.deliveries[0].events.some((event) => event.actor !== null), events.join(' | '));
  const revokedHistory = await orderDeliveryView(A.workspaceId, simple.id);
  check('G12. Historial de la revocada: estado, fecha e item incluidos', revokedHistory?.deliveries[0].status === 'REVOKED' && revokedHistory.deliveries[0].revokedAt !== null && revokedHistory.deliveries[0].items.length === 5 && revokedHistory.deliveries[0].url === null);
  const audits = await prisma.auditLog.findMany({ where: { workspaceId: A.workspaceId }, select: { action: true, metadata: true } });
  const auditText = JSON.stringify(audits);
  check('G13. Auditoria con altas, bajas, envio, fallo, reenvio y revocacion — sin tokens ni claves de almacenamiento',
    ['product.asset_added', 'product.asset_archived', 'product.asset_removed', 'product.asset_replaced', 'product.asset_deactivated', 'order.delivery_created', 'order.delivery_sent', 'order.delivery_failed', 'order.delivery_resent', 'order.delivery_revoked'].every((action) => audits.some((a) => a.action === action)) &&
      !auditText.includes(token!) && !auditText.includes(failedToken!) && !auditText.includes('deliverables/'));

  // Reembolso (Punto 1/2) sigue revocando lo entregado.
  await processOrderPayment({ orderId: bumpOrder.id, externalPaymentId: `refund-${bumpOrder.id}`, status: PaymentStatus.REFUNDED, rawStatus: 'refunded', amount: 0, currency: 'CLP', baseUrl: BASE, workspaceId: A.workspaceId });
  check('G14. Un reembolso revoca la entrega por pedido', (await resolveDelivery(bumpToken!)).ok === false);
  check('G15. El agente IA no tiene herramientas de entrega', !AGENT_TOOLS.some((tool) => /deliver|entrega|resend|revoke|asset/i.test(tool.name)));
} finally {
  await crossTenantPrisma.platformAuditLog.deleteMany({ where: { OR: [{ targetWorkspaceId: { in: createdWorkspaces } }, { actorUserId: { in: createdUsers } }] } });
  const memberUsers = (await prisma.workspaceMembership.findMany({ where: { workspaceId: { in: createdWorkspaces } }, select: { userId: true } })).map((m) => m.userId);
  await crossTenantPrisma.workspace.deleteMany({ where: { id: { in: createdWorkspaces } } });
  await crossTenantPrisma.user.deleteMany({ where: { id: { in: [...new Set([...createdUsers, ...memberUsers])] } } });
  for (const id of createdWorkspaces) await rm(join(process.cwd(), LOCAL_MEDIA_DIR, 'deliverables', id), { recursive: true, force: true });
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n== Resultado: ${passed}/${results.length} pruebas OK ==`);
await prisma.$disconnect();
if (failures > 0) process.exit(1);
