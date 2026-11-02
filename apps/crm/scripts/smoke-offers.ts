/**
 * Punto 6 — Ofertas: order bump configurable + upsell postcompra, contra la
 * base de pruebas y por las RUTAS reales (sesion firmada, contexto de
 * workspace). El cobro corre en el modo demo local (pago SIMULADO): esto NO
 * valida Mercado Pago real, valida que el pedido, el pago, la entrega y la
 * medicion queden coherentes con el contrato que usa el webhook real.
 *
 *  A. Configuracion: copy, precio especial, imagen, activacion; validacion y
 *     mass assignment; maximo por tipo; duplicados.
 *  B. Roles: OWNER/ADMIN mutan; MEMBER solo lee.
 *  C. Aislamiento: otro workspace no lista, edita, borra ni ofrece variantes ajenas.
 *  D. Prioridad: gana la primera disponible; respaldo; reordenar; orden viejo.
 *  E. Bump en el checkout: copy y precio especial desde la base; aceptar,
 *     quitar, cambio de prioridad entre intentos; totales y medicion.
 *  F. Upsell: pantalla tras el pago, rechazar, aceptar → pedido adicional con su
 *     propio pago; doble clic y concurrencia → un solo pedido; tokens; estados.
 *  G. Pagos y entrega del adicional: monto que no coincide no confirma; pago
 *     aprobado entrega solo lo del adicional; ledger SaaS intacto.
 *  H. Medicion: take rate de bump y upsell; eliminar con historial archiva.
 *  I. Coherencia del catalogo: archivar el ofrecido pausa; duplicar copia ofertas.
 *
 * Uso, desde apps/crm (exige TEST_DATABASE_URL con el marcador de base aislada):
 *   pnpm exec tsx scripts/smoke-offers.ts
 */
import './fixtures/test-environment';
import { OrderStatus, PaymentStatus, PlanCode, WorkspaceRole } from '../generated/prisma/client';
import { crossTenantPrisma, prisma } from '../src/lib/prisma';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { assignCompSubscription } from '../src/lib/billing/subscription-admin';
import { addMembershipWithinPlan } from '../src/lib/entitlements/growth';
import { decideUpsell, loadPublicCheckout, startPublicCheckoutPayment } from '../src/lib/commerce/public-checkout';
import { signCheckoutToken } from '../src/lib/commerce/public-checkout-link';
import { signProductKey } from '../src/lib/commerce/product-link';
import { listProductOffers } from '../src/lib/commerce/offers/service';
import { processOrderPayment } from '../src/lib/commerce/payment-webhook';
import { asUser } from './fixtures/request-context';
import { POST as createRoute } from '../src/app/api/products/studio/route';
import { PATCH as saveRoute } from '../src/app/api/products/[id]/route';
import { POST as statusRoute } from '../src/app/api/products/[id]/status/route';
import { POST as duplicateRoute } from '../src/app/api/products/[id]/duplicate/route';
import { GET as offersGetRoute, POST as offersPostRoute, PUT as offersPutRoute } from '../src/app/api/products/[id]/offers/route';
import { DELETE as offerDeleteRoute, PATCH as offerPatchRoute } from '../src/app/api/products/[id]/offers/[offerId]/route';
import { POST as buyRoute } from '../src/app/api/comprar/[id]/route';
import { POST as payRoute } from '../src/app/api/checkout/[id]/pay/route';
import { POST as upsellRoute } from '../src/app/api/checkout/[id]/upsell/route';
import { POST as demoPayRoute } from '../src/app/api/demo-checkout/[id]/route';

process.env.PLATFORM_EMAIL_FROM = '';

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
const cli = { via: 'cli' as const, reason: 'smoke offers' };
let ipSeq = 1;
const ip = () => `198.19.${Math.floor(stamp / 1000) % 250}.${(ipSeq++ % 250) + 1}`;
type Session = { id: string; workspaceId: string };

async function makeWorkspace(suffix: string) {
  const email = `owner-${suffix}-${stamp}@offers.test`;
  const created = await createCustomerWorkspace({ companyName: `offers-${suffix}-${stamp}`, ownerName: `Owner ${suffix}`, email, password: 'contrasena-de-prueba-1234' });
  createdWorkspaces.push(created.workspace.id);
  createdUsers.push(created.user.id);
  await assignCompSubscription({ workspaceId: created.workspace.id, planCode: PlanCode.SCALE, ...cli });
  return { workspaceId: created.workspace.id, session: { id: created.user.id, workspaceId: created.workspace.id } as Session };
}

async function addMember(workspaceId: string, label: string, role: WorkspaceRole): Promise<Session> {
  const user = await prisma.user.create({ data: { name: label, email: `${label}-${stamp}@offers.test`, passwordHash: 'x' } });
  createdUsers.push(user.id);
  await addMembershipWithinPlan({ workspaceId, userId: user.id, role });
  return { id: user.id, workspaceId };
}

const jsonReq = (path: string, body?: unknown, method = 'POST') =>
  new Request(`http://localhost${path}`, { method, headers: { 'content-type': 'application/json', 'x-forwarded-for': ip() }, body: body === undefined ? undefined : JSON.stringify(body) });
const formReq = (path: string, fields: Record<string, string>) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request(`http://localhost${path}`, { method: 'POST', headers: { 'x-forwarded-for': ip() }, body: form });
};
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const offerParams = (id: string, offerId: string) => ({ params: Promise.resolve({ id, offerId }) });
async function body(response: Response) {
  return (await response.clone().json().catch(() => ({}))) as { code?: string; message?: string; field?: string; data?: Record<string, unknown> & { id?: string } };
}
const idOf = async (response: Response) => String((await body(response)).data?.id ?? '');

const offersUrl = (productId: string) => `/api/products/${productId}/offers`;
const addOffer = (s: Session, productId: string, input: unknown) => asUser(s, () => offersPostRoute(jsonReq(offersUrl(productId), input), params(productId)));
const patchOffer = (s: Session, productId: string, offerId: string, input: unknown) => asUser(s, () => offerPatchRoute(jsonReq(`${offersUrl(productId)}/${offerId}`, input, 'PATCH'), offerParams(productId, offerId)));
const deleteOffer = (s: Session, productId: string, offerId: string) => asUser(s, () => offerDeleteRoute(jsonReq(`${offersUrl(productId)}/${offerId}`, undefined, 'DELETE'), offerParams(productId, offerId)));
const reorder = (s: Session, productId: string, input: unknown) => asUser(s, () => offersPutRoute(jsonReq(offersUrl(productId), input, 'PUT'), params(productId)));
const listOffers = (s: Session, productId: string) => asUser(s, () => offersGetRoute(jsonReq(offersUrl(productId), undefined, 'GET'), params(productId)));

async function product(s: Session, name: string, price: number, currency = 'CLP') {
  const id = await idOf(await asUser(s, () => createRoute(jsonReq('/api/products/studio', { name, type: 'DIGITAL', currency, basePrice: price }))));
  const variant = await prisma.productVariant.findFirstOrThrow({ where: { productId: id, isDefault: true } });
  return { id, variantId: variant.id };
}
const publish = (s: Session, id: string) => asUser(s, () => statusRoute(jsonReq(`/api/products/${id}/status`, { action: 'publish' }), params(id)));

let buyerSeq = 0;
async function buy(productId: string) {
  buyerSeq += 1;
  const response = await buyRoute(formReq(`/api/comprar/${productId}`, { k: signProductKey(productId), name: 'Comprador Ofertas', email: `buyer-${buyerSeq}-${stamp}@offers.test` }), params(productId));
  const match = (response.headers.get('location') ?? '').match(/\/checkout\/([^?]+)\?t=([^&]+)/);
  return { orderId: match?.[1] ?? '', token: match ? decodeURIComponent(match[2]) : '' };
}
const pay = (orderId: string, token: string, fields: Record<string, string> = {}) => payRoute(formReq(`/api/checkout/${orderId}/pay`, { t: token, ...fields }), params(orderId));
const upsell = (orderId: string, token: string, fields: Record<string, string>) => upsellRoute(formReq(`/api/checkout/${orderId}/upsell`, { t: token, ...fields }), params(orderId));
const orderOf = (id: string) => prisma.customerOrder.findFirstOrThrow({ where: { id }, include: { lines: true, payments: true } });
const offerRow = (orderId: string, offerId: string) => prisma.orderOffer.findUnique({ where: { orderId_offerId: { orderId, offerId } } });
const statsOf = async (productId: string, offerId: string) => (await listProductOffers(A.workspaceId, productId)).offers.find((offer) => offer.id === offerId)?.stats;

// Modo demo local: el "pago" es la ruta /api/demo-checkout (simulado y marcado).
const guard = Symbol.for('upzites.visual.guard');
const globals = globalThis as Record<symbol, unknown>;
const previousVisual = process.env.LOCAL_VISUAL_TEST;
process.env.LOCAL_VISUAL_TEST = '1';
globals[guard] = true;

// =============================================================================
console.log('\n== Preparacion: A (OWNER/ADMIN/MEMBER) y B ==');
const A = await makeWorkspace('a');
const B = await makeWorkspace('b');
const adminA = await addMember(A.workspaceId, 'admin-a', WorkspaceRole.ADMIN);
const memberA = await addMember(A.workspaceId, 'member-a', WorkspaceRole.MEMBER);
const demoPay = (orderId: string) => asUser(A.session, () => demoPayRoute(jsonReq(`/api/demo-checkout/${orderId}`), params(orderId)));

try {
  const main = await product(A.session, '30 experiencias guiadas', 5990);
  const audios = await product(A.session, '7 audios', 2990);
  const workbook = await product(A.session, 'Cuaderno de trabajo', 3990);
  const mentoring = await product(A.session, 'Mentoría 1:1', 19990);
  const usd = await product(A.session, 'Ebook USD', 999, 'USD');
  const foreign = await product(B.session, 'Producto de B', 1000);
  for (const item of [main, audios, workbook, mentoring, usd]) await publish(A.session, item.id);
  await publish(B.session, foreign.id);
  await prisma.digitalAsset.create({ data: { workspaceId: A.workspaceId, productId: mentoring.id, name: 'Agenda de la mentoría', target: 'https://contenido.offers.test/mentoria' } });
  await prisma.digitalAsset.create({ data: { workspaceId: A.workspaceId, productId: main.id, name: 'Acceso al programa', target: 'https://contenido.offers.test/programa' } });

  // ===========================================================================
  console.log('\n== A. Configuracion y validacion ==');
  const bump1 = await addOffer(A.session, main.id, { kind: 'ORDER_BUMP', variantId: audios.variantId, headline: 'Suma los 7 audios', description: 'Para escuchar en el camino.', price: 1990, showImage: false });
  const bump1Id = await idOf(bump1);
  const stored = await prisma.productOffer.findFirst({ where: { id: bump1Id, workspaceId: A.workspaceId, productId: main.id } });
  check('A1. OWNER crea un bump con copy, precio especial y sin imagen (201) y queda guardado en ProductOffer', bump1.status === 201 && stored?.headline === 'Suma los 7 audios' && stored.priceMinor === 1990 && stored.showImage === false && stored.priority === 0, String(bump1.status));
  const invalid = await Promise.all([
    addOffer(A.session, main.id, { kind: 'ORDER_BUMP', variantId: main.variantId, headline: 'Self' }),
    addOffer(A.session, main.id, { kind: 'ORDER_BUMP', variantId: usd.variantId, headline: 'Otra moneda' }),
    addOffer(A.session, main.id, { kind: 'ORDER_BUMP', variantId: 'no-existe', headline: 'Fantasma' }),
    addOffer(A.session, main.id, { kind: 'ORDER_BUMP', variantId: workbook.variantId, headline: 'x', price: 0 }),
    addOffer(A.session, main.id, { kind: 'ORDER_BUMP', variantId: workbook.variantId, headline: 'x', priority: -5 }),
    addOffer(A.session, main.id, { kind: 'ORDER_BUMP', variantId: workbook.variantId, headline: 'x', workspaceId: B.workspaceId }),
    addOffer(A.session, main.id, { kind: 'ORDER_BUMP', variantId: workbook.variantId, headline: '' }),
  ]);
  const dup = await addOffer(A.session, main.id, { kind: 'ORDER_BUMP', variantId: audios.variantId, headline: 'Repetido' });
  check('A2. Self, otra moneda, inexistente, precio 0, prioridad/workspace en el cuerpo y sin título → 400; repetido → 409', invalid.every((r) => r.status === 400) && dup.status === 409 && (await prisma.productOffer.count({ where: { productId: main.id } })) === 1, invalid.map((r) => r.status).join('/') + `/${dup.status}`);
  const savedProduct = await asUser(A.session, () => saveRoute(jsonReq(`/api/products/${main.id}`, { name: '30 experiencias guiadas', type: 'DIGITAL', currency: 'CLP', basePrice: 5990, orderBump: { enabled: true, variantId: workbook.variantId } }, 'PATCH'), params(main.id)));
  check('A3. El editor del producto ya no acepta orderBump (las ofertas solo se escriben por /offers)', savedProduct.status === 400);

  // ===========================================================================
  console.log('\n== B. Roles ==');
  const bump2 = await addOffer(adminA, main.id, { kind: 'ORDER_BUMP', variantId: workbook.variantId, headline: 'Suma el cuaderno', showImage: true });
  const bump2Id = await idOf(bump2);
  const memberWrites = await Promise.all([
    addOffer(memberA, main.id, { kind: 'UPSELL', variantId: mentoring.variantId, headline: 'x' }),
    patchOffer(memberA, main.id, bump1Id, { variantId: audios.variantId, headline: 'Hackeado' }),
    deleteOffer(memberA, main.id, bump1Id),
    reorder(memberA, main.id, { kind: 'ORDER_BUMP', ids: [bump2Id, bump1Id] }),
  ]);
  const memberRead = await listOffers(memberA, main.id);
  check('B1. ADMIN crea (201); MEMBER no crea, edita, borra ni reordena (403) pero puede ver', bump2.status === 201 && memberWrites.every((r) => r.status === 403) && memberRead.status === 200 && (await prisma.productOffer.findUniqueOrThrow({ where: { id: bump1Id } })).headline === 'Suma los 7 audios', memberWrites.map((r) => r.status).join('/'));

  // ===========================================================================
  console.log('\n== C. Aislamiento multi-workspace ==');
  const foreignOps = await Promise.all([
    listOffers(B.session, main.id),
    addOffer(B.session, main.id, { kind: 'ORDER_BUMP', variantId: foreign.variantId, headline: 'x' }),
    patchOffer(B.session, main.id, bump1Id, { variantId: audios.variantId, headline: 'Hackeado' }),
    deleteOffer(B.session, main.id, bump1Id),
    reorder(B.session, main.id, { kind: 'ORDER_BUMP', ids: [bump2Id, bump1Id] }),
    patchOffer(B.session, foreign.id, bump1Id, { variantId: foreign.variantId, headline: 'Por la puerta de atras' }),
  ]);
  const stealVariant = await addOffer(B.session, foreign.id, { kind: 'ORDER_BUMP', variantId: audios.variantId, headline: 'Robado' });
  const offerOther = await addOffer(A.session, main.id, { kind: 'UPSELL', variantId: foreign.variantId, headline: 'Ajeno' });
  check(
    'C1. B no ve, crea, edita, borra ni reordena ofertas de A (404), ni usa una oferta de A con su propio producto (404); nadie ofrece variantes de otro workspace (400)',
    foreignOps.every((r) => r.status === 404) && stealVariant.status === 400 && offerOther.status === 400 && (await prisma.productOffer.count({ where: { workspaceId: B.workspaceId } })) === 0,
    foreignOps.map((r) => r.status).join('/') + `/${stealVariant.status}/${offerOther.status}`,
  );

  // ===========================================================================
  console.log('\n== D. Prioridad ==');
  let view = await listProductOffers(A.workspaceId, main.id);
  check('D1. Con dos bumps se muestra el de prioridad más alta (el primero creado)', view.winner.ORDER_BUMP === bump1Id && view.offers.filter((o) => o.kind === 'ORDER_BUMP').map((o) => o.id).join() === `${bump1Id},${bump2Id}`);
  const reordered = await reorder(A.session, main.id, { kind: 'ORDER_BUMP', ids: [bump2Id, bump1Id] });
  view = await listProductOffers(A.workspaceId, main.id);
  const stale = await reorder(A.session, main.id, { kind: 'ORDER_BUMP', ids: [bump1Id] });
  check('D2. Reordenar cambia la oferta visible; un orden que no nombra a todas → 409', reordered.status === 200 && view.winner.ORDER_BUMP === bump2Id && stale.status === 409, `${reordered.status}/${stale.status}`);
  await reorder(A.session, main.id, { kind: 'ORDER_BUMP', ids: [bump1Id, bump2Id] });
  const extra = [];
  for (const n of [1, 2, 3]) extra.push(await product(A.session, `Extra ${n}`, 1000 + n));
  const caps = [];
  for (const item of extra) caps.push((await addOffer(A.session, main.id, { kind: 'ORDER_BUMP', variantId: item.variantId, headline: `Extra ${item.id}` })).status);
  const sixth = await addOffer(A.session, main.id, { kind: 'ORDER_BUMP', variantId: (await product(A.session, 'Extra 4', 1004)).variantId, headline: 'Sexta' });
  check('D3. Máximo 5 ofertas por tipo: la sexta → 400', caps.every((c) => c === 201) && sixth.status === 400, `${caps.join()}/${sixth.status}`);
  const extraOffers = await prisma.productOffer.findMany({ where: { productId: main.id, offerVariantId: { in: extra.map((e) => e.variantId) } } });
  for (const offer of extraOffers) await deleteOffer(A.session, main.id, offer.id);

  // ===========================================================================
  console.log('\n== E. Bump en el checkout ==');
  const o1 = await buy(main.id);
  const v1 = await loadPublicCheckout(o1.orderId, o1.token);
  check(
    'E1. Checkout: copy, descripción y precio especial del bump salen de la base; imagen apagada; impresión registrada (SHOWN)',
    v1.ok && v1.bump?.offerId === bump1Id && v1.bump.headline === 'Suma los 7 audios' && v1.bump.description === 'Para escuchar en el camino.' && v1.bump.unitPrice === 1990 && v1.bump.imageUrl === null && v1.total === 5990 && v1.upsell === null &&
      (await offerRow(o1.orderId, bump1Id))?.status === 'SHOWN',
    JSON.stringify(v1.ok && v1.bump),
  );
  const p1 = await pay(o1.orderId, o1.token, { includeBump: 'on', price: '1', bumpPrice: '1', total: '1', offerId: bump2Id });
  let order = await orderOf(o1.orderId);
  check(
    'E2. Aceptar: línea del bump al precio especial (1.990), total 7.980 recalculado en el servidor, oferta ACCEPTED; montos y offerId del formulario ignorados',
    p1.status === 303 && order.lines.length === 2 && order.lines.some((l) => l.variantId === audios.variantId && l.unitPrice === 1990 && l.name === '7 audios') && order.total === 7980 && (await offerRow(o1.orderId, bump1Id))?.status === 'ACCEPTED' && !(await offerRow(o1.orderId, bump2Id)),
    `total=${order.total} lines=${order.lines.length}`,
  );
  const p1again = await pay(o1.orderId, o1.token, { includeBump: 'on' });
  check('E3. Repetir el pago con la misma elección reutiliza la preferencia (sin líneas ni ofertas duplicadas)', p1again.headers.get('location') === p1.headers.get('location') && (await orderOf(o1.orderId)).lines.length === 2 && (await prisma.orderOffer.count({ where: { orderId: o1.orderId } })) === 1);
  // Quitar el bump: la linea se borra y la oferta queda DECLINED.
  await prisma.customerOrder.update({ where: { id: o1.orderId }, data: { status: OrderStatus.DRAFT } });
  await pay(o1.orderId, o1.token, {});
  order = await orderOf(o1.orderId);
  check('E4. Desmarcar: la línea del bump se quita, total 5.990, oferta DECLINED', order.lines.length === 1 && order.total === 5990 && (await offerRow(o1.orderId, bump1Id))?.status === 'DECLINED');
  // Aceptar, y antes de pagar el vendedor pausa ese bump: el siguiente intento usa el de respaldo.
  await pay(o1.orderId, o1.token, { includeBump: 'on' });
  await patchOffer(A.session, main.id, bump1Id, { variantId: audios.variantId, headline: 'Suma los 7 audios', description: 'Para escuchar en el camino.', price: 1990, showImage: false, isActive: false });
  await prisma.customerOrder.update({ where: { id: o1.orderId }, data: { status: OrderStatus.DRAFT } });
  const v1b = await loadPublicCheckout(o1.orderId, o1.token);
  await pay(o1.orderId, o1.token, { includeBump: 'on' });
  order = await orderOf(o1.orderId);
  check(
    'E5. Bump pausado entre intentos: el checkout pasa al de respaldo, la línea vieja se quita y solo el vigente cuenta como aceptado',
    v1b.ok && v1b.bump?.offerId === bump2Id && order.lines.length === 2 && order.lines.some((l) => l.variantId === workbook.variantId && l.unitPrice === 3990) && !order.lines.some((l) => l.variantId === audios.variantId) && order.total === 5990 + 3990 &&
      (await offerRow(o1.orderId, bump1Id))?.status === 'DECLINED' && (await offerRow(o1.orderId, bump2Id))?.status === 'ACCEPTED',
    `total=${order.total}`,
  );
  const demo1 = await demoPay(o1.orderId);
  order = await orderOf(o1.orderId);
  check('E6. Venta simulada: un Payment por el total del servidor (9.980) y el pedido queda pagado', demo1.status === 200 && order.payments.length === 1 && order.payments[0].amount === 9980 && ([OrderStatus.CONFIRMED, OrderStatus.FULFILLED] as OrderStatus[]).includes(order.status));
  await patchOffer(A.session, main.id, bump1Id, { variantId: audios.variantId, headline: 'Suma los 7 audios', description: 'Para escuchar en el camino.', price: 1990, showImage: false, isActive: true });

  // Un segundo comprador que no toma el bump y paga.
  const o2 = await buy(main.id);
  await loadPublicCheckout(o2.orderId, o2.token);
  await pay(o2.orderId, o2.token, {});
  await demoPay(o2.orderId);

  // ===========================================================================
  console.log('\n== F. Upsell postcompra ==');
  const up = await addOffer(A.session, main.id, { kind: 'UPSELL', variantId: mentoring.variantId, headline: 'Agrega una mentoría 1:1', description: 'Una sesión de 45 minutos.', price: 14990 });
  const upId = await idOf(up);
  const pendingOrder = await buy(main.id);
  const notPaid = await decideUpsell(pendingOrder.orderId, pendingOrder.token, 'accept');
  const pendingView = await loadPublicCheckout(pendingOrder.orderId, pendingOrder.token);
  check('F1. Sin pago confirmado no hay upsell: no se muestra y aceptarlo → UNAVAILABLE', up.status === 201 && pendingView.ok && pendingView.upsell === null && !notPaid.ok && notPaid.reason === 'UNAVAILABLE', JSON.stringify(notPaid));

  const paidView = await loadPublicCheckout(o2.orderId, o2.token);
  check(
    'F2. Pedido pagado: la página muestra el upsell con copy y precio especial desde la base, y registra la impresión',
    paidView.ok && paidView.state === 'PAID' && paidView.upsell?.status === 'OPEN' && paidView.upsell.headline === 'Agrega una mentoría 1:1' && paidView.upsell.unitPrice === 14990 && (await offerRow(o2.orderId, upId))?.status === 'SHOWN',
    JSON.stringify(paidView.ok && paidView.upsell),
  );
  const declined = await upsell(o2.orderId, o2.token, { decision: 'decline' });
  const afterDecline = await loadPublicCheckout(o2.orderId, o2.token);
  check('F3. Rechazar: vuelve a la página del pedido, la oferta queda DECLINED y no se crea ningún pedido', declined.status === 303 && (declined.headers.get('location') ?? '').includes(`/checkout/${o2.orderId}`) && afterDecline.ok && afterDecline.upsell?.status === 'DECLINED' && (await offerRow(o2.orderId, upId))?.status === 'DECLINED' && (await prisma.customerOrder.count({ where: { workspaceId: A.workspaceId, metadata: { path: ['parentOrderId'], equals: o2.orderId } } })) === 0);

  await loadPublicCheckout(o1.orderId, o1.token);
  const badToken = await upsell(o1.orderId, signCheckoutToken(o2.orderId), { decision: 'accept' });
  const badDecision = await upsell(o1.orderId, o1.token, { decision: 'charge' });
  check('F4. Token de otro pedido → rechazo; decisión inventada → oferta no disponible; ningún pedido creado', (badToken.headers.get('location') ?? '').includes('e=NOT_FOUND') && (badDecision.headers.get('location') ?? '').includes('e=UPSELL_UNAVAILABLE') && (await prisma.customerOrder.count({ where: { workspaceId: A.workspaceId, metadata: { path: ['parentOrderId'], equals: o1.orderId } } })) === 0);

  const accepts = await Promise.all([1, 2, 3].map(() => upsell(o1.orderId, o1.token, { decision: 'accept', price: '1', total: '1', variantId: audios.variantId, offerId: bump1Id })));
  const children = await prisma.customerOrder.findMany({ where: { workspaceId: A.workspaceId, metadata: { path: ['parentOrderId'], equals: o1.orderId } }, include: { lines: true } });
  const child = children[0];
  const parent = await orderOf(o1.orderId);
  check(
    'F5. Aceptar 3 veces en paralelo (doble clic): un solo pedido adicional, al precio del servidor (14.990), misma moneda y comprador, y todos van a su pago',
    children.length === 1 && child.lines.length === 1 && child.lines[0].variantId === mentoring.variantId && child.lines[0].unitPrice === 14990 && child.total === 14990 && child.currency === 'CLP' && child.contactId === parent.contactId &&
      (child.metadata as { source?: string }).source === 'upsell' && accepts.every((r) => (r.headers.get('location') ?? '').includes(`/demo-checkout/${child.id}`)) && (await offerRow(o1.orderId, upId))?.resultOrderId === child.id,
    accepts.map((r) => r.headers.get('location')).join(' '),
  );
  const parentAfter = await orderOf(o1.orderId);
  check('F6. El pedido original no cambia: mismas líneas, mismo total y un solo pago', parentAfter.total === 9980 && parentAfter.lines.length === 2 && parentAfter.payments.length === 1);
  const childView = await loadPublicCheckout(child.id, signCheckoutToken(child.id));
  const parentView = await loadPublicCheckout(o1.orderId, o1.token);
  check('F7. El pedido adicional es su propio checkout (sin bump ni otro upsell); el original muestra "falta completar el pago"', childView.ok && childView.isUpsell && childView.bump === null && childView.upsell === null && childView.total === 14990 && parentView.ok && parentView.upsell?.status === 'ACCEPTED');
  const lateDecline = await upsell(o1.orderId, o1.token, { decision: 'decline' });
  check('F8. Rechazar después de aceptar no deshace la aceptación', (lateDecline.headers.get('location') ?? '').includes(`/checkout/${o1.orderId}`) && (await offerRow(o1.orderId, upId))?.status === 'ACCEPTED');

  // ===========================================================================
  console.log('\n== G. Pago y entrega del adicional ==');
  const mismatch = await processOrderPayment({ orderId: child.id, externalPaymentId: `mp-mismatch-${stamp}`, status: PaymentStatus.APPROVED, rawStatus: 'approved', amount: 1, currency: 'CLP', baseUrl: 'http://localhost', workspaceId: A.workspaceId, externalReference: child.id });
  const foreignWs = await processOrderPayment({ orderId: child.id, externalPaymentId: `mp-foreign-${stamp}`, status: PaymentStatus.APPROVED, rawStatus: 'approved', amount: 14990, currency: 'CLP', baseUrl: 'http://localhost', workspaceId: B.workspaceId, externalReference: child.id });
  check('G1. Un pago por otro monto no confirma el adicional; uno cobrado por otro workspace se rechaza', !mismatch.handled && !foreignWs.handled && (await orderOf(child.id)).status === OrderStatus.PENDING_PAYMENT, `${mismatch.reason} / ${foreignWs.reason}`);
  const saasBefore = await prisma.subscriptionPayment.count({ where: { workspaceId: A.workspaceId } });
  const childPaid = await demoPay(child.id);
  const childOrder = await orderOf(child.id);
  const childDelivery = await prisma.digitalDelivery.findFirst({ where: { orderId: child.id }, include: { items: true } });
  check(
    'G2. Pago aprobado del adicional: pedido pagado, Payment 14.990, entrega con SOLO lo del producto del upsell, ledger SaaS intacto',
    childPaid.status === 200 && ([OrderStatus.CONFIRMED, OrderStatus.FULFILLED] as OrderStatus[]).includes(childOrder.status) && childOrder.payments.some((p) => p.status === 'APPROVED' && p.amount === 14990) &&
      childDelivery?.items.length === 1 && childDelivery.items[0].name === 'Agenda de la mentoría' && (await prisma.subscriptionPayment.count({ where: { workspaceId: A.workspaceId } })) === saasBefore,
    JSON.stringify(childDelivery?.items.map((i) => i.name)),
  );
  const reaccept = await upsell(o1.orderId, o1.token, { decision: 'accept' });
  const parentPaidView = await loadPublicCheckout(o1.orderId, o1.token);
  check('G3. Con el adicional pagado, aceptar otra vez lleva a su página (sin cobrar de nuevo) y el original lo muestra como comprado', (reaccept.headers.get('location') ?? '').includes(`/checkout/${child.id}`) && parentPaidView.ok && parentPaidView.upsell?.status === 'PAID' && (await prisma.payment.count({ where: { orderId: child.id, status: 'APPROVED', amount: 14990 } })) === 1);
  const direct = await startPublicCheckoutPayment(child.id, signCheckoutToken(child.id), true);
  check('G4. El adicional pagado no se puede volver a cobrar (ni con bump forzado)', !direct.ok && direct.reason === 'ALREADY_PAID');

  // ===========================================================================
  console.log('\n== H. Medicion ==');
  const bump1Stats = await statsOf(main.id, bump1Id);
  const bump2Stats = await statsOf(main.id, bump2Id);
  const upStats = await statsOf(main.id, upId);
  check(
    'H1. Bump: el de respaldo se mostró en 1 pedido pagado y se tomó (100%); el principal se mostró en 2 pagados y no se tomó en ninguno (0%)',
    bump2Stats?.shown === 1 && bump2Stats.paid === 1 && bump2Stats.takeRate === 1 && bump2Stats.revenue === 3990 && bump1Stats?.paid === 0 && bump1Stats.takeRate === 0 && bump1Stats.declined === 2,
    JSON.stringify({ bump1Stats, bump2Stats }),
  );
  check('H2. Upsell: mostrado 2 veces, 1 aceptado y pagado, 1 rechazado → take rate 50%, ingreso 14.990 (simulado)', upStats?.shown === 2 && upStats.accepted === 1 && upStats.paid === 1 && upStats.declined === 1 && upStats.takeRate === 0.5 && upStats.revenue === 14990 && upStats.simulated === 1, JSON.stringify(upStats));
  const removed = await deleteOffer(A.session, main.id, upId);
  const afterRemove = await listProductOffers(A.workspaceId, main.id);
  const fresh = await addOffer(A.session, main.id, { kind: 'UPSELL', variantId: workbook.variantId, headline: 'Sin historial' });
  const freshRemoved = await deleteOffer(A.session, main.id, await idOf(fresh));
  check(
    'H3. Eliminar con historial archiva (deja de ofrecerse, la medición se conserva); sin historial se borra',
    removed.status === 200 && (await body(removed)).data?.archived === true && !afterRemove.offers.some((o) => o.id === upId) && afterRemove.archived.find((o) => o.id === upId)?.stats.paid === 1 && afterRemove.winner.UPSELL === null &&
      (await body(freshRemoved)).data?.archived === false && (await prisma.productOffer.count({ where: { id: await idOf(fresh) } })) === 0,
  );

  // ===========================================================================
  console.log('\n== I. Coherencia con el catalogo ==');
  const dupl = await asUser(A.session, () => duplicateRoute(jsonReq(`/api/products/${main.id}/duplicate`), params(main.id)));
  const copyId = await idOf(dupl);
  const copied = await prisma.productOffer.findMany({ where: { productId: copyId, workspaceId: A.workspaceId }, orderBy: { priority: 'asc' } });
  check('I1. Duplicar copia las ofertas vigentes (no las archivadas) sin su medición', dupl.status === 201 && copied.length === 2 && copied.every((o) => o.kind === 'ORDER_BUMP') && (await prisma.orderOffer.count({ where: { offerId: { in: copied.map((o) => o.id) } } })) === 0, String(copied.length));
  const archive = await asUser(A.session, () => statusRoute(jsonReq(`/api/products/${audios.id}/status`, { action: 'archive' }), params(audios.id)));
  const pausedOffers = await prisma.productOffer.findMany({ where: { workspaceId: A.workspaceId, offerVariantId: audios.variantId } });
  check('I2. Archivar el producto ofrecido pausa sus ofertas en el original y en la copia, y el checkout deja de mostrarlas', archive.status === 200 && pausedOffers.length === 2 && pausedOffers.every((o) => !o.isActive) && (await listProductOffers(A.workspaceId, main.id)).winner.ORDER_BUMP === bump2Id);
  const removeVariant = await asUser(A.session, () => saveRoute(jsonReq(`/api/products/${workbook.id}`, { name: 'Cuaderno de trabajo', type: 'DIGITAL', currency: 'USD', basePrice: 3990 }, 'PATCH'), params(workbook.id)));
  check('I3. Cambiar la moneda de un producto ofrecido no rompe nada: la oferta queda "otra moneda" y deja de mostrarse', removeVariant.status === 200 && (await listProductOffers(A.workspaceId, main.id)).offers.find((o) => o.id === bump2Id)?.issue === 'CURRENCY' && (await listProductOffers(A.workspaceId, main.id)).winner.ORDER_BUMP === null);
} finally {
  delete globals[guard];
  if (previousVisual === undefined) delete process.env.LOCAL_VISUAL_TEST;
  else process.env.LOCAL_VISUAL_TEST = previousVisual;
  await crossTenantPrisma.platformAuditLog.deleteMany({ where: { OR: [{ targetWorkspaceId: { in: createdWorkspaces } }, { actorUserId: { in: createdUsers } }] } });
  const memberUsers = (await prisma.workspaceMembership.findMany({ where: { workspaceId: { in: createdWorkspaces } }, select: { userId: true } })).map((m) => m.userId);
  await crossTenantPrisma.workspace.deleteMany({ where: { id: { in: createdWorkspaces } } });
  await crossTenantPrisma.user.deleteMany({ where: { id: { in: [...new Set([...createdUsers, ...memberUsers])] } } });
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n== Resultado: ${passed}/${results.length} pruebas OK ==`);
await prisma.$disconnect();
if (failures > 0) process.exit(1);
