/**
 * Punto 2 — Product Sales Studio: integracion contra la base de pruebas, por
 * las RUTAS reales (sesion firmada, contexto de workspace, proxy de permisos)
 * y el dominio Commerce existente.
 *
 *  A. Crear / editar / persistir; validacion y mass assignment.
 *  B. Autorizacion: OWNER y ADMIN mutan; MEMBER no; otro workspace no ve ni
 *     toca nada (producto, variantes, bump, metricas, portada).
 *  C. Price tampering: precio, moneda, total y precio del bump del navegador
 *     se ignoran; el servidor resuelve el catalogo.
 *  D. Variantes: sin variantes, valida, invalida, de otro producto, de otro
 *     workspace, inactiva; quitar con ventas = desactivar.
 *  E. Order bump (ofertas del Punto 6, por /offers): sin bump, pausado,
 *     main + bump, bump falso, self-bump, cross-tenant, adicional
 *     despublicado/archivado.
 *  F. Duplicar: ids nuevos, DRAFT, sin SKU, sin pedidos ni metricas.
 *  G. Checkout: borrador/archivado rechazan; publicado entra al publicUrl
 *     canonico; totales correctos.
 *  H. Venta simulada por la ruta demo: Payment marcado, ledger SaaS intacto y
 *     metricas del Studio actualizadas.
 *
 * Uso, desde apps/crm (exige TEST_DATABASE_URL con el marcador de base aislada):
 *   pnpm exec tsx scripts/smoke-product-studio.ts
 */
import './fixtures/test-environment';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { OrderStatus, PlanCode, WorkspaceRole } from '../generated/prisma/client';
import { crossTenantPrisma, prisma } from '../src/lib/prisma';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { assignCompSubscription } from '../src/lib/billing/subscription-admin';
import { addMembershipWithinPlan } from '../src/lib/entitlements/growth';
import { loadPublicCheckout } from '../src/lib/commerce/public-checkout';
import { verifyCheckoutToken } from '../src/lib/commerce/public-checkout-link';
import { signProductKey } from '../src/lib/commerce/product-link';
import { loadPublicProduct } from '../src/lib/commerce/product-checkout';
import { getStudioProduct, productMetrics } from '../src/lib/commerce/product-studio/service';
import { listProductOffers } from '../src/lib/commerce/offers/service';
import { formatMinor } from '../src/lib/commerce/money';
import { createOrder } from '../src/lib/commerce/orders';
import { providerAmountToMinor, toMajorUnits } from '../src/lib/billing/money';
import { loadRevenueToday } from '../src/lib/dashboard/widgets/loaders/commerce';
import { AGENT_TOOLS } from '../src/lib/agents/tools';
import { asUser } from './fixtures/request-context';
import { POST as createRoute } from '../src/app/api/products/studio/route';
import { GET as getRoute, PATCH as saveRoute } from '../src/app/api/products/[id]/route';
import { POST as statusRoute } from '../src/app/api/products/[id]/status/route';
import { POST as duplicateRoute } from '../src/app/api/products/[id]/duplicate/route';
import { POST as offersPostRoute } from '../src/app/api/products/[id]/offers/route';
import { PATCH as offerPatchRoute } from '../src/app/api/products/[id]/offers/[offerId]/route';
import { DELETE as coverDeleteRoute, GET as coverGetRoute, POST as coverPostRoute } from '../src/app/api/products/[id]/cover/route';
import { POST as buyRoute } from '../src/app/api/comprar/[id]/route';
import { POST as payRoute } from '../src/app/api/checkout/[id]/pay/route';
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
const cli = { via: 'cli' as const, reason: 'smoke product studio' };
let ipSeq = 1;
const ip = () => `198.18.${Math.floor(stamp / 1000) % 250}.${(ipSeq++ % 250) + 1}`;
type Session = { id: string; workspaceId: string };

async function makeWorkspace(suffix: string) {
  const email = `owner-${suffix}-${stamp}@studio.test`;
  const created = await createCustomerWorkspace({ companyName: `studio-${suffix}-${stamp}`, ownerName: `Owner ${suffix}`, email, password: 'contrasena-de-prueba-1234' });
  createdWorkspaces.push(created.workspace.id);
  createdUsers.push(created.user.id);
  await assignCompSubscription({ workspaceId: created.workspace.id, planCode: PlanCode.SCALE, ...cli });
  return { workspaceId: created.workspace.id, session: { id: created.user.id, workspaceId: created.workspace.id } as Session };
}

async function addMember(workspaceId: string, label: string, role: WorkspaceRole): Promise<Session> {
  const user = await prisma.user.create({ data: { name: label, email: `${label}-${stamp}@studio.test`, passwordHash: 'x' } });
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
async function body(response: Response) {
  return (await response.clone().json().catch(() => ({}))) as { code?: string; message?: string; field?: string; data?: Record<string, unknown> & { id?: string } };
}

const create = (s: Session, input: unknown) => asUser(s, () => createRoute(jsonReq('/api/products/studio', input)));
const save = (s: Session, id: string, input: unknown) => asUser(s, () => saveRoute(jsonReq(`/api/products/${id}`, input, 'PATCH'), params(id)));
const status = (s: Session, id: string, action: string) => asUser(s, () => statusRoute(jsonReq(`/api/products/${id}/status`, { action }), params(id)));
const duplicate = (s: Session, id: string) => asUser(s, () => duplicateRoute(jsonReq(`/api/products/${id}/duplicate`), params(id)));
const read = (s: Session, id: string) => asUser(s, () => getRoute(jsonReq(`/api/products/${id}`, undefined, 'GET'), params(id)));
const addOffer = (s: Session, id: string, input: unknown) => asUser(s, () => offersPostRoute(jsonReq(`/api/products/${id}/offers`, input), params(id)));
const patchOffer = (s: Session, id: string, offerId: string, input: unknown) =>
  asUser(s, () => offerPatchRoute(jsonReq(`/api/products/${id}/offers/${offerId}`, input, 'PATCH'), { params: Promise.resolve({ id, offerId }) }));
const bumpFields = (variantId: string) => ({ variantId, headline: 'Agregar también el pack' });
const bumpInput = (variantId: string) => ({ kind: 'ORDER_BUMP', ...bumpFields(variantId) });
/** El order bump de prioridad mas alta del producto, con su salud y si es el que se muestra. */
async function bumpOf(productId: string) {
  const view = await listProductOffers(A.workspaceId, productId);
  const offer = view.offers.find((item) => item.kind === 'ORDER_BUMP');
  return offer ? { id: offer.id, issue: offer.issue, isActive: offer.isActive, shown: view.winner.ORDER_BUMP === offer.id } : null;
}
async function createdId(response: Response) {
  return String((await body(response)).data?.id ?? '');
}
const variantsOf = (productId: string) => prisma.productVariant.findMany({ where: { productId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }] });

/** Compra publica: lo que manda el formulario de /comprar (mas lo que un atacante agregue). */
async function buy(productId: string, fields: Record<string, string>) {
  const response = await buyRoute(formReq(`/api/comprar/${productId}`, { k: signProductKey(productId), name: 'Comprador Prueba', email: `buyer-${stamp}@studio.test`, ...fields }), params(productId));
  const location = response.headers.get('location') ?? '';
  const match = location.match(/\/checkout\/([^?]+)\?t=([^&]+)/);
  return { status: response.status, location, orderId: match?.[1] ?? null, token: match ? decodeURIComponent(match[2]) : null, error: new URL(location, 'http://localhost').searchParams.get('e') };
}

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
const coverReq = (id: string, bytes: Uint8Array, type = 'image/png') => {
  const form = new FormData();
  form.set('file', new Blob([bytes as Uint8Array<ArrayBuffer>], { type }), 'portada.png');
  return new Request(`http://localhost/api/products/${id}/cover`, { method: 'POST', body: form });
};

// =============================================================================
console.log('\n== Preparacion: dos negocios SCALE (A con OWNER/ADMIN/MEMBER, B con OWNER) ==');
const A = await makeWorkspace('a');
const B = await makeWorkspace('b');
const adminA = await addMember(A.workspaceId, 'admin-a', WorkspaceRole.ADMIN);
const memberA = await addMember(A.workspaceId, 'member-a', WorkspaceRole.MEMBER);

// =============================================================================
console.log('\n== A. Crear, editar y persistir ==');
const shirtInput = {
  name: 'Camiseta Studio',
  description: 'Algodón orgánico.\n<script>alert(1)</script>',
  type: 'PHYSICAL',
  currency: 'CLP',
  basePrice: 12990,
  sku: 'cam-base',
  variants: [
    { name: 'S', sku: 'cam-s', price: 12990, isActive: true },
    { name: 'M', sku: 'cam-m', price: 13990, isActive: true },
    { name: 'L', sku: 'cam-l', price: 14990, isActive: false },
  ],
};
const createdShirt = await create(A.session, shirtInput);
const shirtId = await createdId(createdShirt);
{
  const product = await prisma.product.findFirstOrThrow({ where: { id: shirtId, workspaceId: A.workspaceId }, include: { variants: true } });
  const base = product.variants.find((v) => v.isDefault);
  check(
    'A1. OWNER crea desde el Studio: BORRADOR del workspace activo, moneda, precio base y 3 variantes con SKU normalizado',
    createdShirt.status === 201 && product.status === 'DRAFT' && product.currency === 'CLP' && base?.priceMinor === 12990 && base.isActive === false && product.variants.length === 4 &&
      product.variants.some((v) => v.sku === 'CAM-M' && v.priceMinor === 13990) && product.description?.includes('<script>') === true,
    `${createdShirt.status} variants=${product.variants.length}`,
  );
}
const createdByAdmin = await create(adminA, { name: 'Guía PDF', type: 'DIGITAL', currency: 'CLP', basePrice: 4990 });
const guideId = await createdId(createdByAdmin);
check('A2. ADMIN también crea productos', createdByAdmin.status === 201 && Boolean(guideId), String(createdByAdmin.status));
{
  const reread = await body(await read(A.session, shirtId));
  const edited = await save(A.session, shirtId, { ...shirtInput, name: 'Camiseta Studio 2026', description: 'Editada', variants: (reread.data!.options as { id: string; name: string; sku: string; price: number; isActive: boolean }[]).map((o) => ({ ...o, price: o.price + 10 })) });
  const again = await body(await read(A.session, shirtId));
  const options = again.data!.options as { id: string; price: number }[];
  check(
    'A3. Persistencia: lo creado se relee igual; la edición (nombre, descripción, precios de variantes) persiste',
    edited.status === 200 && again.data!.name === 'Camiseta Studio 2026' && again.data!.description === 'Editada' && options.length === 3 && options.every((o) => o.price % 10 === 0) && options.map((o) => o.price).join() === '13000,14000,15000',
    `${edited.status} ${options.map((o) => o.price).join()}`,
  );
}
{
  const massStatus = await save(A.session, shirtId, { ...shirtInput, status: 'ACTIVE' });
  const massWs = await save(A.session, shirtId, { ...shirtInput, workspaceId: B.workspaceId });
  const massMeta = await save(A.session, shirtId, { ...shirtInput, metadata: { orderBump: { variantId: 'x' } } });
  const badPrice = await save(A.session, shirtId, { ...shirtInput, basePrice: 10.5 });
  const badCurrency = await create(A.session, { ...shirtInput, currency: 'EUR' });
  const after = await prisma.product.findFirstOrThrow({ where: { id: shirtId, workspaceId: A.workspaceId } });
  check(
    'A4. Mass assignment y validación: status/workspaceId/metadata en el cuerpo, precio no entero y moneda no soportada → 400 sin cambios',
    [massStatus, massWs, massMeta, badPrice, badCurrency].every((r) => r.status === 400) && after.status === 'DRAFT' && after.workspaceId === A.workspaceId,
    [massStatus, massWs, massMeta, badPrice, badCurrency].map((r) => r.status).join('/'),
  );
}
{
  const clash = await create(A.session, { name: 'Otra', type: 'PHYSICAL', currency: 'CLP', basePrice: 100, sku: 'CAM-S' });
  const otherWorkspace = await create(B.session, { name: 'Camiseta de B', type: 'PHYSICAL', currency: 'CLP', basePrice: 100, sku: 'CAM-S' });
  check('A5. SKU único por workspace: repetido en A → 409; el mismo SKU en B sí se permite', clash.status === 409 && otherWorkspace.status === 201, `${clash.status}/${otherWorkspace.status}`);
}

// =============================================================================
console.log('\n== B. Autorización y aislamiento ==');
{
  const memberCreate = await create(memberA, { name: 'X', type: 'DIGITAL', currency: 'CLP', basePrice: 100 });
  const memberSave = await save(memberA, shirtId, shirtInput);
  const memberPublish = await status(memberA, shirtId, 'publish');
  const memberDuplicate = await duplicate(memberA, shirtId);
  const memberCover = await asUser(memberA, () => coverPostRoute(coverReq(shirtId, PNG), params(shirtId)));
  const memberRead = await read(memberA, shirtId);
  check(
    'B1. MEMBER puede ver pero no crear, editar, publicar, duplicar ni subir portada (403)',
    [memberCreate, memberSave, memberPublish, memberDuplicate, memberCover].every((r) => r.status === 403) && memberRead.status === 200,
    [memberCreate, memberSave, memberPublish, memberDuplicate, memberCover, memberRead].map((r) => r.status).join('/'),
  );
}
{
  const before = await prisma.product.findFirstOrThrow({ where: { id: shirtId, workspaceId: A.workspaceId } });
  const foreignRead = await read(B.session, shirtId);
  const foreignSave = await save(B.session, shirtId, { ...shirtInput, name: 'Hackeado' });
  const foreignStatus = await status(B.session, shirtId, 'archive');
  const foreignDuplicate = await duplicate(B.session, shirtId);
  const foreignCover = await asUser(B.session, () => coverPostRoute(coverReq(shirtId, PNG), params(shirtId)));
  const after = await prisma.product.findFirstOrThrow({ where: { id: shirtId, workspaceId: A.workspaceId } });
  const metrics = await getStudioProduct(B.workspaceId, shirtId).then(() => 'leak', (error: Error) => error.name);
  check(
    'B2. Workspace B no lee, edita, archiva, duplica ni sube portada a un producto de A (404) ni consulta sus métricas',
    [foreignRead, foreignSave, foreignStatus, foreignDuplicate, foreignCover].every((r) => r.status === 404) && after.name === before.name && after.status === before.status && metrics === 'ProductStudioError' &&
      (await prisma.product.count({ where: { workspaceId: B.workspaceId, name: { contains: 'Camiseta Studio' } } })) === 0,
    [foreignRead, foreignSave, foreignStatus, foreignDuplicate, foreignCover].map((r) => r.status).join('/') + ` metrics=${metrics}`,
  );
}
const bProductId = (await prisma.product.findFirstOrThrow({ where: { workspaceId: B.workspaceId, name: 'Camiseta de B' } })).id;
{
  const aVariant = (await variantsOf(shirtId)).find((v) => !v.isDefault)!;
  const smuggledVariant = await save(B.session, bProductId, { name: 'Camiseta de B', type: 'PHYSICAL', currency: 'CLP', basePrice: 100, variants: [{ id: aVariant.id, name: 'Robada', price: 1, isActive: true }] });
  const crossBump = await addOffer(B.session, bProductId, bumpInput(aVariant.id));
  const aVariantAfter = await prisma.productVariant.findFirstOrThrow({ where: { id: aVariant.id, productId: shirtId } });
  const bProduct = await prisma.product.findFirstOrThrow({ where: { id: bProductId, workspaceId: B.workspaceId } });
  check(
    'B3. B no puede adueñarse de una variante de A ni elegirla como producto adicional (400) y nada cambia',
    smuggledVariant.status === 400 && crossBump.status === 400 && aVariantAfter.name === aVariant.name && aVariantAfter.priceMinor === aVariant.priceMinor &&
      (await prisma.productOffer.count({ where: { productId: bProduct.id } })) === 0,
    `${smuggledVariant.status}/${crossBump.status} ${(await body(crossBump)).message}`,
  );
}

// =============================================================================
console.log('\n== G1. Checkout: borrador no se vende ==');
{
  const view = await loadPublicProduct(shirtId, signProductKey(shirtId));
  const attempt = await buy(shirtId, {});
  const orders = await prisma.customerOrder.count({ where: { workspaceId: A.workspaceId } });
  const studio = await getStudioProduct(A.workspaceId, shirtId);
  check(
    'G1. Producto BORRADOR: la página pública dice "no disponible", la compra se rechaza sin crear pedido y el Studio no muestra enlace',
    !view.ok && view.reason === 'UNAVAILABLE' && attempt.error === 'UNAVAILABLE' && orders === 0 && studio.checkoutUrl === null,
    JSON.stringify({ view, error: attempt.error, orders }),
  );
  const badKey = await loadPublicProduct(shirtId, 'x'.repeat(32));
  check('G2. Enlace con firma inválida → no encontrado', !badKey.ok && badKey.reason === 'NOT_FOUND');
}

// =============================================================================
console.log('\n== E. Order bump: configuración desde el Studio ==');
const bumpCreate = await create(A.session, { name: 'Pack de stickers', type: 'PHYSICAL', currency: 'CLP', basePrice: 2990 });
const bumpId = await createdId(bumpCreate);
const bumpVariantId = (await variantsOf(bumpId))[0].id;
const usdCreate = await create(A.session, { name: 'Ebook USD', type: 'DIGITAL', currency: 'USD', basePrice: 1999 });
const usdId = await createdId(usdCreate);
const shirtOptions = async () => (await body(await read(A.session, shirtId))).data!.options as { id: string; name: string; sku: string | null; price: number; isActive: boolean }[];
let shirtBumpId = '';
{
  const self = await addOffer(A.session, shirtId, bumpInput((await shirtOptions())[0].id));
  const otherCurrency = await addOffer(A.session, shirtId, bumpInput((await variantsOf(usdId))[0].id));
  const fake = await addOffer(A.session, shirtId, bumpInput('variante-inexistente'));
  const ok = await addOffer(A.session, shirtId, bumpInput(bumpVariantId));
  shirtBumpId = await createdId(ok);
  const stored = await prisma.productOffer.findFirst({ where: { id: shirtBumpId, workspaceId: A.workspaceId, productId: shirtId } });
  const bump = await bumpOf(shirtId);
  check(
    'E1. Self-bump, otra moneda y bump inexistente → 400; un producto válido se guarda como oferta ORDER_BUMP del producto',
    self.status === 400 && otherCurrency.status === 400 && fake.status === 400 && ok.status === 201 && stored?.offerVariantId === bumpVariantId && stored.kind === 'ORDER_BUMP',
    `${self.status}/${otherCurrency.status}/${fake.status}/${ok.status}`,
  );
  check('E2. El adicional en borrador se guarda con aviso (no se mostrará hasta publicarlo)', bump?.issue === 'NOT_PUBLISHED' && !bump.shown, String(bump?.issue));
}

// =============================================================================
console.log('\n== G. Publicar y comprar desde el enlace público ==');
{
  const publishZero = await create(A.session, { name: 'Sin precio', type: 'SERVICE', currency: 'CLP', basePrice: 0 });
  const zeroId = await createdId(publishZero);
  const zeroPublish = await status(A.session, zeroId, 'publish');
  check('G3. Publicar sin precio → 400 con el motivo', zeroPublish.status === 400 && /precio/.test((await body(zeroPublish)).message ?? ''), (await body(zeroPublish)).message);
}
const pubMain = await status(A.session, shirtId, 'publish');
const pubBump = await status(A.session, bumpId, 'publish');
await status(A.session, usdId, 'publish');
{
  const studio = await getStudioProduct(A.workspaceId, shirtId);
  const url = new URL(studio.checkoutUrl ?? 'http://x');
  check(
    'G4. Publicado: el Studio entrega el enlace /comprar firmado y la página pública muestra solo variantes activas',
    pubMain.status === 200 && pubBump.status === 200 && url.pathname === `/comprar/${shirtId}` && url.searchParams.get('k') === signProductKey(shirtId) && (await bumpOf(shirtId))?.shown === true,
    studio.checkoutUrl ?? '',
  );
  const view = await loadPublicProduct(shirtId, signProductKey(shirtId));
  check('G5. Vista pública: 2 opciones activas (L pausada fuera), elegir es obligatorio', view.ok && view.needsChoice && view.options.length === 2 && !view.options.some((o) => o.label === 'L'), JSON.stringify(view.ok && view.options));
}

// =============================================================================
console.log('\n== D + C. Variantes y price tampering en la compra pública ==');
const byName = (name: string) => shirtOptions().then((options) => options.find((option) => option.name === name)!);
const [optS, optM, optL] = [await byName('S'), await byName('M'), await byName('L')];
{
  const none = await buy(shirtId, {});
  const inactive = await buy(shirtId, { variantId: optL.id });
  const otherProduct = await buy(shirtId, { variantId: bumpVariantId });
  const foreign = await buy(shirtId, { variantId: (await variantsOf(bProductId))[0].id });
  const garbage = await buy(bumpId, { variantId: 'cualquier-cosa' });
  const badBuyer = await buy(shirtId, { variantId: optM.id, email: 'no-es-email' });
  const orders = await prisma.customerOrder.count({ where: { workspaceId: A.workspaceId } });
  check(
    'D1. Sin elegir, variante pausada, de otro producto, de otro workspace o inventada, y comprador inválido → rechazo sin crear pedidos',
    none.error === 'CHOOSE_VARIANT' && inactive.error === 'INVALID_VARIANT' && otherProduct.error === 'INVALID_VARIANT' && foreign.error === 'INVALID_VARIANT' && garbage.error === 'INVALID_VARIANT' && badBuyer.error === 'INVALID_BUYER' && orders === 0,
    [none, inactive, otherProduct, foreign, garbage, badBuyer].map((r) => r.error).join('/'),
  );
}
const tampered = await buy(shirtId, { variantId: optM.id, price: '1', amount: '1', unitPrice: '1', total: '1', currency: 'USD', bumpPrice: '1', workspaceId: B.workspaceId });
const order1 = await prisma.customerOrder.findFirstOrThrow({ where: { id: tampered.orderId ?? '', workspaceId: A.workspaceId }, include: { lines: true } });
check(
  'C1. Price tampering: precio/total/moneda/workspace del formulario se ignoran; la orden usa la variante M del catálogo (CLP 14.000)',
  tampered.status === 303 && order1.total === optM.price && order1.currency === 'CLP' && order1.lines.length === 1 && order1.lines[0].variantId === optM.id && order1.lines[0].unitPrice === optM.price && order1.lines[0].name === 'Camiseta Studio 2026 — M',
  `${tampered.location} total=${order1.total}`,
);
check(
  'G6. La compra sigue en el checkout canónico /checkout/[id]?t= (publicUrl con token válido) y enlaza al contacto comprador',
  Boolean(tampered.token) && verifyCheckoutToken(order1.id, tampered.token).ok && Boolean(order1.contactId) && order1.customerEmail === `buyer-${stamp}@studio.test`,
);
{
  const view = await loadPublicCheckout(order1.id, tampered.token);
  check('E3. Checkout muestra el adicional publicado con su precio del catálogo', view.ok && view.bump?.name === 'Pack de stickers' && view.bump.unitPrice === 2990 && view.total === optM.price, JSON.stringify(view.ok && view.bump));
}

// Pagar (modo demo local): bump ON con montos manipulados en el formulario.
const guard = Symbol.for('upzites.visual.guard');
const globals = globalThis as Record<symbol, unknown>;
const previousVisual = process.env.LOCAL_VISUAL_TEST;
process.env.LOCAL_VISUAL_TEST = '1';
globals[guard] = true;
try {
  const pay = await payRoute(formReq(`/api/checkout/${order1.id}/pay`, { t: tampered.token!, includeBump: 'on', bumpVariantId: (await variantsOf(bProductId))[0].id, total: '1', amount: '1', price: '1' }), params(order1.id));
  const paid = await prisma.customerOrder.findFirstOrThrow({ where: { id: order1.id, workspaceId: A.workspaceId }, include: { lines: true } });
  check(
    'C2 + E4. main + bump: total recalculado en el servidor (14.000 + 2.990), bump falso del formulario ignorado, 2 líneas',
    pay.status === 303 && (pay.headers.get('location') ?? '').includes(`/demo-checkout/${order1.id}`) && paid.total === optM.price + 2990 && paid.lines.length === 2 && paid.lines.some((l) => l.variantId === bumpVariantId && l.unitPrice === 2990) && paid.status === OrderStatus.PENDING_PAYMENT,
    `${pay.status} ${pay.headers.get('location')} total=${paid.total}`,
  );

  const saasBefore = await prisma.subscriptionPayment.count({ where: { workspaceId: A.workspaceId } });
  const subBefore = await prisma.workspaceSubscription.findUnique({ where: { workspaceId: A.workspaceId }, select: { planId: true, currentPeriodEnd: true, updatedAt: true } });
  const foreignDemo = await asUser(B.session, () => demoPayRoute(jsonReq(`/api/demo-checkout/${order1.id}`), params(order1.id)));
  const memberDemo = await asUser(memberA, () => demoPayRoute(jsonReq(`/api/demo-checkout/${order1.id}`), params(order1.id)));
  const demo = await asUser(A.session, () => demoPayRoute(jsonReq(`/api/demo-checkout/${order1.id}`), params(order1.id)));
  const confirmed = await prisma.customerOrder.findFirstOrThrow({ where: { id: order1.id, workspaceId: A.workspaceId }, include: { payments: true } });
  const payment = confirmed.payments[0];
  check(
    'H1. Venta simulada: solo OWNER/ADMIN del workspace (B → 404, MEMBER → 403); Payment APPROVED por el total del servidor, marcado simulated',
    foreignDemo.status === 404 && memberDemo.status === 403 && demo.status === 200 && ([OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.FULFILLED] as OrderStatus[]).includes(confirmed.status) &&
      confirmed.payments.length === 1 && payment.amount === optM.price + 2990 && payment.status === 'APPROVED' && (payment.metadata as { simulated?: boolean }).simulated === true,
    `${foreignDemo.status}/${memberDemo.status}/${demo.status} ${confirmed.status} amount=${payment?.amount}`,
  );
  const audit = await prisma.auditLog.findFirst({ where: { workspaceId: A.workspaceId, action: 'order.payment_confirmed', entityId: order1.id } });
  const subAfter = await prisma.workspaceSubscription.findUnique({ where: { workspaceId: A.workspaceId }, select: { planId: true, currentPeriodEnd: true, updatedAt: true } });
  check(
    'H2. Auditable y fuera del ledger SaaS: audit order.payment_confirmed con simulated; SubscriptionPayment y suscripción intactas',
    (audit?.metadata as { simulated?: boolean } | null)?.simulated === true && (await prisma.subscriptionPayment.count({ where: { workspaceId: A.workspaceId } })) === saasBefore && JSON.stringify(subAfter) === JSON.stringify(subBefore),
  );
  const again = await asUser(A.session, () => demoPayRoute(jsonReq(`/api/demo-checkout/${order1.id}`), params(order1.id)));
  check('H3. Repetir la simulación no duplica el pago', again.status === 200 && (await prisma.payment.count({ where: { orderId: order1.id, workspaceId: A.workspaceId } })) === 1);

  // Un pedido sin bump: pagar con includeBump de un producto sin adicional se rechaza.
  const plain = await buy(guideId, {});
  const guideOrderId = plain.orderId;
  await status(A.session, guideId, 'publish');
  const plain2 = await buy(guideId, {});
  const fakeBump = await payRoute(formReq(`/api/checkout/${plain2.orderId}/pay`, { t: plain2.token!, includeBump: 'on' }), params(plain2.orderId!));
  const plainOrder = await prisma.customerOrder.findFirstOrThrow({ where: { id: plain2.orderId!, workspaceId: A.workspaceId }, include: { lines: true } });
  check(
    'E5. Producto sin adicional: bump forzado desde el request → rechazo, total y líneas intactos',
    guideOrderId === null && plain.error === 'UNAVAILABLE' && (fakeBump.headers.get('location') ?? '').includes('e=UNAVAILABLE') && plainOrder.lines.length === 1 && plainOrder.total === 4990,
    `${plain.error} ${fakeBump.headers.get('location')}`,
  );

  // Bump pausado en Ofertas: el checkout deja de ofrecerlo.
  const off = await patchOffer(A.session, shirtId, shirtBumpId, { ...bumpFields(bumpVariantId), isActive: false });
  const order2 = await buy(shirtId, { variantId: optS.id });
  const view2 = await loadPublicCheckout(order2.orderId!, order2.token);
  check('E6. Bump pausado desde Ofertas → el checkout no lo ofrece; total = solo la variante S', off.status === 200 && view2.ok && view2.bump === null && view2.total === optS.price, JSON.stringify(view2.ok && { bump: view2.bump, total: view2.total }));

  // Self-bump inyectado directo en la base (por fuera del Studio): el motor lo ignora.
  const injected = await prisma.productOffer.create({ data: { workspaceId: A.workspaceId, productId: shirtId, kind: 'ORDER_BUMP', offerVariantId: optM.id, headline: 'Self', priority: -1 } });
  const order3 = await buy(shirtId, { variantId: optS.id });
  const view3 = await loadPublicCheckout(order3.orderId!, order3.token);
  check('E7. Self-bump (otra variante del mismo producto) escrito por fuera del Studio → el motor no lo ofrece', view3.ok && view3.bump === null, JSON.stringify(view3.ok && view3.bump));
  await prisma.productOffer.delete({ where: { id: injected.id } });
  await patchOffer(A.session, shirtId, shirtBumpId, bumpFields(bumpVariantId));

  // USD: unidades menores de punta a punta.
  const usdOrder = await buy(usdId, {});
  const usd = await prisma.customerOrder.findFirstOrThrow({ where: { id: usdOrder.orderId!, workspaceId: A.workspaceId } });
  check('C3. Producto en USD: el pedido toma la moneda del catálogo y el total en centavos (1999)', usd.currency === 'USD' && usd.total === 1999, `${usd.currency} ${usd.total}`);
} finally {
  delete globals[guard];
  if (previousVisual === undefined) delete process.env.LOCAL_VISUAL_TEST;
  else process.env.LOCAL_VISUAL_TEST = previousVisual;
}

// =============================================================================
console.log('\n== Métricas ==');
{
  const main = await productMetrics(A.workspaceId, shirtId);
  const bump = await productMetrics(A.workspaceId, bumpId);
  check(
    'H4. Métricas del Studio: 1 venta confirmada, 1 unidad, ingreso 14.000 CLP (los pedidos sin pagar cuentan como iniciados, no como ingreso); el adicional suma 2.990',
    main.salesConfirmed === 1 && main.unitsSold === 1 && main.revenue.length === 1 && main.revenue[0].amount === optM.price && main.revenue[0].currency === 'CLP' && main.ordersStarted >= 3 && main.simulatedSales === 1 &&
      bump.salesConfirmed === 1 && bump.revenue[0]?.amount === 2990,
    JSON.stringify({ main, bump }),
  );
  // Un pedido cancelado no suma.
  const cancelled = await prisma.customerOrder.findFirstOrThrow({ where: { workspaceId: A.workspaceId, status: OrderStatus.DRAFT, lines: { some: { variant: { productId: shirtId } } } } });
  await prisma.customerOrder.update({ where: { id: cancelled.id }, data: { status: OrderStatus.CANCELLED } });
  const afterCancel = await productMetrics(A.workspaceId, shirtId);
  check('H5. Un pedido cancelado deja de contar como iniciado y nunca como ingreso', afterCancel.ordersStarted === main.ordersStarted - 1 && afterCancel.revenue[0].amount === main.revenue[0].amount);
}

// =============================================================================
console.log('\n== D2. Quitar variantes con y sin ventas ==');
{
  const options = await shirtOptions();
  const kept = options.filter((o) => o.id !== optM.id && o.id !== optL.id);
  const response = await save(A.session, shirtId, { ...shirtInput, name: 'Camiseta Studio 2026', variants: kept });
  const variants = await variantsOf(shirtId);
  const m = variants.find((v) => v.id === optM.id);
  check(
    'D2. Quitar M (con ventas) la desactiva y conserva el historial; quitar L (sin ventas) la elimina',
    response.status === 200 && m?.isActive === false && !variants.some((v) => v.id === optL.id) && (await prisma.orderLine.count({ where: { variantId: optM.id } })) > 0,
    JSON.stringify((await body(response)).data),
  );
  const view = await loadPublicProduct(shirtId, signProductKey(shirtId));
  check('D3. La variante desactivada ya no se puede comprar', view.ok && view.options.length === 1 && (await buy(shirtId, { variantId: optM.id })).error === 'INVALID_VARIANT');
}

// =============================================================================
console.log('\n== Portada ==');
{
  const upload = await asUser(A.session, () => coverPostRoute(coverReq(shirtId, PNG), params(shirtId)));
  const svg = await asUser(A.session, () => coverPostRoute(coverReq(shirtId, new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'), 'image/png'), params(shirtId)));
  const publicGet = await asUser(null, () => coverGetRoute(new Request(`http://localhost/api/products/${shirtId}/cover?k=${signProductKey(shirtId)}`), params(shirtId)));
  const foreignGet = await asUser(B.session, () => coverGetRoute(new Request(`http://localhost/api/products/${shirtId}/cover`), params(shirtId)));
  const anonymousGet = await asUser(null, () => coverGetRoute(new Request(`http://localhost/api/products/${shirtId}/cover`), params(shirtId)));
  const cover = (await prisma.product.findFirstOrThrow({ where: { id: shirtId, workspaceId: A.workspaceId } })).metadata as { cover?: { key: string } };
  check(
    'I1. Portada: PNG verificado por bytes se guarda en la carpeta del workspace; SVG disfrazado → 400; pública solo con firma; B y anónimo → 404',
    upload.status === 200 && svg.status === 400 && publicGet.status === 200 && publicGet.headers.get('content-type') === 'image/png' && publicGet.headers.get('x-content-type-options') === 'nosniff' &&
      foreignGet.status === 404 && anonymousGet.status === 404 && cover.cover?.key.startsWith(`products/${A.workspaceId}/${shirtId}/`) === true,
    [upload, svg, publicGet, foreignGet, anonymousGet].map((r) => r.status).join('/'),
  );
}

// =============================================================================
console.log('\n== F. Duplicar ==');
{
  const response = await duplicate(A.session, shirtId);
  const copyId = await createdId(response);
  const source = await prisma.product.findFirstOrThrow({ where: { id: shirtId, workspaceId: A.workspaceId }, include: { variants: true } });
  const copy = await prisma.product.findFirstOrThrow({ where: { id: copyId, workspaceId: A.workspaceId }, include: { variants: true } });
  const copyMeta = copy.metadata as { cover?: { key: string } };
  const copyBump = await prisma.productOffer.findFirst({ where: { workspaceId: A.workspaceId, productId: copyId, kind: 'ORDER_BUMP', offerVariantId: bumpVariantId } });
  const sourceMeta = source.metadata as { cover?: { key: string } };
  const sourceIds = new Set(source.variants.map((v) => v.id));
  const metrics = await productMetrics(A.workspaceId, copyId);
  check(
    'F1. Duplicar: id nuevo, BORRADOR, mismo workspace, variantes con ids nuevos y sin SKU, adicional y portada (archivo propio) copiados',
    response.status === 201 && copyId !== shirtId && copy.status === 'DRAFT' && copy.workspaceId === A.workspaceId && copy.name === 'Camiseta Studio 2026 (copia)' &&
      copy.variants.length === source.variants.length && copy.variants.every((v) => !sourceIds.has(v.id) && v.sku === null) && copyBump?.headline === 'Agregar también el pack' &&
      Boolean(copyMeta.cover?.key) && copyMeta.cover?.key !== sourceMeta.cover?.key && copyMeta.cover!.key.startsWith(`products/${A.workspaceId}/${copyId}/`),
    `${response.status} ${copy.status}`,
  );
  check(
    'F2. La copia no hereda pedidos, pagos ni métricas',
    metrics.ordersStarted === 0 && metrics.salesConfirmed === 0 && metrics.revenue.length === 0 && (await prisma.orderLine.count({ where: { variant: { productId: copyId } } })) === 0,
    JSON.stringify(metrics),
  );
}

// =============================================================================
console.log('\n== Despublicar y archivar ==');
{
  const unpublish = await status(A.session, bumpId, 'unpublish');
  const bump = await bumpOf(shirtId);
  const order = await buy(shirtId, { variantId: optS.id });
  const view = await loadPublicCheckout(order.orderId!, order.token);
  check('E8. Adicional despublicado: la oferta queda con aviso y el checkout deja de ofrecerla', unpublish.status === 200 && bump?.issue === 'NOT_PUBLISHED' && view.ok && view.bump === null);

  const archive = await status(A.session, bumpId, 'archive');
  const detached = (await body(archive)).data?.detachedFrom as string[] | undefined;
  const stillActive = await prisma.productOffer.count({ where: { workspaceId: A.workspaceId, isActive: true, offerVariant: { productId: bumpId } } });
  const kept = await prisma.productOffer.count({ where: { workspaceId: A.workspaceId, offerVariant: { productId: bumpId } } });
  check(
    'E9. Archivar el adicional pausa las ofertas que lo ofrecían (sin relaciones rotas, copy conservado) y conserva sus ventas',
    archive.status === 200 && (detached ?? []).length === 2 && stillActive === 0 && kept === 2 &&
      (await productMetrics(A.workspaceId, bumpId)).salesConfirmed === 1,
    JSON.stringify(detached),
  );

  const archiveMain = await status(A.session, shirtId, 'archive');
  const archivedBuy = await buy(shirtId, { variantId: optS.id });
  const archivedPending = await loadPublicCheckout(order.orderId!, order.token);
  const paidStill = await loadPublicCheckout(order1.id, tampered.token);
  const editArchived = await save(A.session, shirtId, shirtInput);
  const archivedOrders = await prisma.customerOrder.count({ where: { workspaceId: A.workspaceId, lines: { some: { variant: { productId: shirtId } } } } });
  check(
    'G7. Producto ARCHIVADO: no acepta compras nuevas ni pagos pendientes, no se edita (409), conserva pedidos y el pedido pagado sigue visible como pagado',
    archiveMain.status === 200 && archivedBuy.error === 'UNAVAILABLE' && !archivedPending.ok && paidStill.ok && paidStill.state === 'PAID' && editArchived.status === 409 && archivedOrders >= 4,
    JSON.stringify({ archivedBuy: archivedBuy.error, pending: !archivedPending.ok && archivedPending.reason, paid: paidStill.ok && paidStill.state, edit: editArchived.status }),
  );
  const restore = await status(A.session, shirtId, 'restore');
  const restored = await prisma.product.findFirstOrThrow({ where: { id: shirtId, workspaceId: A.workspaceId } });
  check('G8. Restaurar devuelve el producto a BORRADOR (no se publica solo)', restore.status === 200 && restored.status === 'DRAFT');
}

// =============================================================================
console.log('\n== J. Enlace público /comprar: firma, estados y aislamiento ==');
{
  const p = await createdId(await create(A.session, { name: 'Link QA', type: 'DIGITAL', currency: 'CLP', basePrice: 1000, variants: [{ name: 'Única', price: 1000, isActive: true }] }));
  const key = signProductKey(p);
  const viewDraft = await loadPublicProduct(p, key);
  const buyDraft = await buy(p, {});
  await status(A.session, p, 'publish');
  const valid = await loadPublicProduct(p, key);
  const missing = await loadPublicProduct(p, null);
  const empty = await loadPublicProduct(p, '');
  const tampered = await loadPublicProduct(p, `${key.slice(0, -1)}${key.endsWith('A') ? 'B' : 'A'}`);
  const foreignKeyOnA = await loadPublicProduct(p, signProductKey(bProductId));
  const bKeyOnB = await loadPublicProduct(bProductId, signProductKey(bProductId));
  const bWithAKey = await loadPublicProduct(bProductId, key);
  const routeMissing = await buyRoute(formReq(`/api/comprar/${p}`, { name: 'X', email: 'x@studio.test' }), params(p));
  const routeTampered = await buyRoute(formReq(`/api/comprar/${p}`, { k: 'x'.repeat(32), name: 'X', email: 'x@studio.test' }), params(p));
  const variantOfOtherWs = await buy(p, { variantId: (await variantsOf(bProductId))[0].id });
  const ordersOf = () => prisma.customerOrder.count({ where: { workspaceId: A.workspaceId, lines: { some: { variant: { productId: p } } } } });
  const ordersBefore = await ordersOf();
  check(
    'J1. Firma válida + ACTIVE → vista pública (solo datos de venta); sin firma, vacía, manipulada o de otro producto/negocio → NOT_FOUND idéntico',
    valid.ok && valid.name === 'Link QA' && Object.keys(valid).every((k) => !['workspaceId', 'metadata', 'status', 'sku'].includes(k)) &&
      [missing, empty, tampered, foreignKeyOnA, bWithAKey].every((v) => !v.ok && v.reason === 'NOT_FOUND') && !bKeyOnB.ok && bKeyOnB.reason === 'UNAVAILABLE',
    JSON.stringify({ missing, tampered, foreignKeyOnA, bWithAKey, bKeyOnB }),
  );
  const locMissing = new URL(routeMissing.headers.get('location')!, 'http://x').searchParams.get('e');
  const locTampered = new URL(routeTampered.headers.get('location')!, 'http://x').searchParams.get('e');
  check('J2. Compra sin firma o con firma manipulada → mismo rechazo (NOT_FOUND) y ningún pedido', locMissing === 'NOT_FOUND' && locTampered === 'NOT_FOUND' && ordersBefore === 0, `${locMissing}/${locTampered}/${ordersBefore}`);
  check('J3. DRAFT → "no disponible" sin nombre ni precio y sin pedido', !viewDraft.ok && viewDraft.reason === 'UNAVAILABLE' && Object.keys(viewDraft).sort().join() === 'ok,reason' && buyDraft.error === 'UNAVAILABLE');
  check('J4. Variante de otro workspace en el enlace → INVALID_VARIANT sin pedido', variantOfOtherWs.error === 'INVALID_VARIANT' && (await ordersOf()) === 0);
  await status(A.session, p, 'archive');
  const viewArchived = await loadPublicProduct(p, key);
  const buyArchived = await buy(p, {});
  check(
    'J5. ARCHIVED → misma respuesta que DRAFT (no revela el estado interno) y sin pedido',
    !viewArchived.ok && JSON.stringify(viewArchived) === JSON.stringify(viewDraft) && buyArchived.error === 'UNAVAILABLE' && (await ordersOf()) === 0,
  );
}

// =============================================================================
console.log('\n== M. Multi-moneda: CLP y USD de punta a punta, sin mezclar ==');
{
  globals[guard] = true;
  process.env.LOCAL_VISUAL_TEST = '1';
  try {
    type Case = { currency: 'CLP' | 'USD'; main: number; bump: number; total: number; display: string };
    const cases: Case[] = [
      { currency: 'CLP', main: 19990, bump: 2990, total: 22980, display: '$22.980' },
      { currency: 'USD', main: 1999, bump: 299, total: 2298, display: '$22.98' },
    ];
    const ids: Record<string, { main: string; bump: string; bumpVariant: string }> = {};
    for (const c of cases) {
      const bumpP = await createdId(await create(A.session, { name: `Bump ${c.currency}`, type: 'DIGITAL', currency: c.currency, basePrice: c.bump }));
      await status(A.session, bumpP, 'publish');
      const bumpVariant = (await variantsOf(bumpP))[0].id;
      const mainP = await createdId(await create(A.session, { name: `Main ${c.currency}`, type: 'DIGITAL', currency: c.currency, basePrice: c.main }));
      await addOffer(A.session, mainP, bumpInput(bumpVariant));
      await status(A.session, mainP, 'publish');
      ids[c.currency] = { main: mainP, bump: bumpP, bumpVariant };
      const purchase = await buy(mainP, {});
      // El formulario intenta fijar total y moneda: se ignoran.
      await payRoute(formReq(`/api/checkout/${purchase.orderId}/pay`, { t: purchase.token!, includeBump: 'on', total: '1', currency: c.currency === 'CLP' ? 'USD' : 'CLP' }), params(purchase.orderId!));
      const before = await prisma.customerOrder.findFirstOrThrow({ where: { id: purchase.orderId!, workspaceId: A.workspaceId }, include: { lines: true } });
      const pay = await asUser(A.session, () => demoPayRoute(jsonReq(`/api/demo-checkout/${purchase.orderId}`), params(purchase.orderId!)));
      const after = await prisma.customerOrder.findFirstOrThrow({ where: { id: purchase.orderId!, workspaceId: A.workspaceId }, include: { payments: true } });
      const mainLine = before.lines.find((l) => l.name === `Main ${c.currency}`);
      const bumpLine = before.lines.find((l) => l.variantId === bumpVariant);
      const metrics = await productMetrics(A.workspaceId, mainP);
      const bumpMetrics = await productMetrics(A.workspaceId, bumpP);
      check(
        `M-${c.currency}. OrderLine ${c.main} + ${c.bump}, total ${c.total} (unidades menores), Payment simulado ${c.total} ${c.currency}, formato ${c.display}, métricas por moneda`,
        pay.status === 200 && before.currency === c.currency && before.lines.length === 2 &&
          mainLine?.unitPrice === c.main && mainLine.total === c.main && bumpLine?.unitPrice === c.bump && bumpLine.total === c.bump &&
          before.total === c.total && before.subtotal === c.total &&
          after.payments.length === 1 && after.payments[0].amount === c.total && after.payments[0].currency === c.currency &&
          formatMinor(after.total, after.currency) === c.display &&
          metrics.revenue.length === 1 && metrics.revenue[0].currency === c.currency && metrics.revenue[0].amount === c.main &&
          bumpMetrics.revenue[0]?.currency === c.currency && bumpMetrics.revenue[0]?.amount === c.bump,
        JSON.stringify({ total: before.total, lines: before.lines.map((l) => [l.unitPrice, l.total]), payment: after.payments[0] && [after.payments[0].amount, after.payments[0].currency], metrics: metrics.revenue }),
      );
    }
    check('M-USD2. Borde Mercado Pago: se enviaría 22.98 (unidades mayores) y el webhook vuelve a 2298', toMajorUnits(2298, 'USD') === 22.98 && providerAmountToMinor(22.98, 'USD') === 2298);

    // Prohibido mezclar monedas entre producto y adicional (Studio, motor y pedido).
    const clpMain = await createdId(await create(A.session, { name: 'Mix CLP', type: 'DIGITAL', currency: 'CLP', basePrice: 5000 }));
    const usdMain = await createdId(await create(A.session, { name: 'Mix USD', type: 'DIGITAL', currency: 'USD', basePrice: 500 }));
    const clpWithUsdBump = await addOffer(A.session, clpMain, bumpInput(ids.USD.bumpVariant));
    const usdWithClpBump = await addOffer(A.session, usdMain, bumpInput(ids.CLP.bumpVariant));
    // Con una oferta en CLP, el producto no puede pasar a USD (la oferta quedaria en otra moneda).
    const clpBumpOk = await addOffer(A.session, clpMain, bumpInput(ids.CLP.bumpVariant));
    const switchCurrency = await save(A.session, clpMain, { name: 'Mix CLP', type: 'DIGITAL', currency: 'USD', basePrice: 5000 });
    check(
      'M-MIX1. Ofertas rechazan producto CLP + adicional USD y USD + CLP; con una oferta CLP no se puede cambiar el producto a USD',
      clpWithUsdBump.status === 400 && usdWithClpBump.status === 400 && clpBumpOk.status === 201 && switchCurrency.status === 400 &&
        /moneda/.test((await body(clpWithUsdBump)).message ?? '') && /moneda/.test((await body(usdWithClpBump)).message ?? '') && /moneda/.test((await body(switchCurrency)).message ?? ''),
      `${clpWithUsdBump.status}/${usdWithClpBump.status}/${clpBumpOk.status}/${switchCurrency.status}`,
    );
    await prisma.productOffer.delete({ where: { id: await createdId(clpBumpOk) } });
    // Relacion mixta escrita por fuera del Studio: el motor del checkout tampoco la acepta.
    await prisma.productOffer.create({ data: { workspaceId: A.workspaceId, productId: clpMain, kind: 'ORDER_BUMP', offerVariantId: ids.USD.bumpVariant, headline: 'Mixta' } });
    await prisma.productOffer.create({ data: { workspaceId: A.workspaceId, productId: usdMain, kind: 'ORDER_BUMP', offerVariantId: ids.CLP.bumpVariant, headline: 'Mixta' } });
    await status(A.session, clpMain, 'publish');
    await status(A.session, usdMain, 'publish');
    const outcomes: string[] = [];
    for (const productId of [clpMain, usdMain]) {
      const purchase = await buy(productId, {});
      const view = await loadPublicCheckout(purchase.orderId!, purchase.token);
      const forced = await payRoute(formReq(`/api/checkout/${purchase.orderId}/pay`, { t: purchase.token!, includeBump: 'on' }), params(purchase.orderId!));
      const order = await prisma.customerOrder.findFirstOrThrow({ where: { id: purchase.orderId!, workspaceId: A.workspaceId }, include: { lines: true } });
      outcomes.push(`${view.ok && view.bump === null}:${(forced.headers.get('location') ?? '').includes('e=UNAVAILABLE')}:${order.lines.length}`);
    }
    check('M-MIX2. Motor: un adicional de otra moneda no se ofrece ni se puede forzar (CLP→USD y USD→CLP)', outcomes.every((r) => r === 'true:true:1'), outcomes.join(' '));
    const mixedOrder = await createOrder({ workspaceId: A.workspaceId, items: [{ variantId: (await variantsOf(clpMain))[0].id, quantity: 1 }, { variantId: (await variantsOf(usdMain))[0].id, quantity: 1 }] }).then(
      () => 'creado',
      (error: Error) => error.message,
    );
    check('M-MIX3. createOrder rechaza un pedido con líneas en CLP y USD', /monedas/.test(mixedOrder), mixedOrder);

    // Dashboard: cada moneda por separado y en unidades mayores.
    const ctx = { workspaceId: A.workspaceId, now: new Date(), timeZone: 'America/Santiago' };
    const clpRevenue = await loadRevenueToday({ ...ctx, currency: 'CLP' });
    const usdRevenue = await loadRevenueToday({ ...ctx, currency: 'USD' });
    const clpExpected = (await prisma.customerOrder.aggregate({ where: { workspaceId: A.workspaceId, currency: 'CLP', status: { in: [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.FULFILLED] } }, _sum: { total: true } }))._sum.total ?? 0;
    check(
      'M-DASH. Ingresos del dashboard no mezclan monedas: CLP = solo pedidos CLP; USD = 22.98 (unidades mayores)',
      clpRevenue.kind === 'stat' && clpRevenue.value === clpExpected && usdRevenue.kind === 'stat' && usdRevenue.value === 22.98,
      JSON.stringify({ clp: clpRevenue.kind === 'stat' && clpRevenue.value, clpExpected, usd: usdRevenue.kind === 'stat' && usdRevenue.value }),
    );

    // Agente: el precio llega con su moneda y formato, nunca como "1999 CLP".
    const search = AGENT_TOOLS.find((tool) => tool.name === 'search_products')!;
    const found = await search.execute({ query: 'Main USD' }, { workspaceId: A.workspaceId, conversationId: null, contactId: null, agentRunId: 'smoke' } as never);
    const foundData = found.ok ? found.data : undefined;
    const price = (foundData as { variants: { price: { amountMinor: number; currency: string; display: string } }[] }[] | undefined)?.[0]?.variants[0]?.price;
    check('M-AGENT. El agente recibe { amountMinor: 1999, currency: USD, display: $19.99 }', price?.amountMinor === 1999 && price.currency === 'USD' && price.display === '$19.99', JSON.stringify(foundData));

    // Agente: el producto se fija en la conversación/contexto del servidor; el
    // modelo no envía productId, precio ni moneda. La confirmación explícita es
    // suficiente y el backend recupera el precio real del catálogo.
    const account = await prisma.channelAccount.create({ data: { workspaceId: A.workspaceId, channel: 'INSTAGRAM', externalAccountId: `studio-${stamp}`, status: 'CONNECTED', metadata: { fake: true } } });
    const agentCheckout = async (productId: string, offerText: string) => {
      const contact = await prisma.contact.create({ data: { workspaceId: A.workspaceId, firstName: 'Agente', lastName: 'Studio' } });
      const conversation = await prisma.conversation.create({ data: { workspaceId: A.workspaceId, contactId: contact.id, productId, channelType: 'INSTAGRAM', channelAccountId: account.id, mode: 'AI_ACTIVE' } });
      const t0 = Date.now() - 60_000;
      await prisma.message.create({ data: { workspaceId: A.workspaceId, conversationId: conversation.id, direction: 'OUTBOUND', senderType: 'AI', text: offerText, createdAt: new Date(t0) } });
      await prisma.message.create({ data: { workspaceId: A.workspaceId, conversationId: conversation.id, direction: 'INBOUND', senderType: 'CONTACT', text: 'confirmo', createdAt: new Date(t0 + 1000) } });
      const tool = AGENT_TOOLS.find((item) => item.name === 'createCheckoutLink')!;
      return tool.execute({}, { workspaceId: A.workspaceId, productId, contactId: contact.id, conversationId: conversation.id, agentRunId: 'smoke' } as never);
    };
    const usdOk = await agentCheckout(ids.USD.main, 'Main USD queda en $19.99. ¿Lo confirmas?');
    const usdCents = await agentCheckout(ids.USD.main, 'Main USD queda en 1999. ¿Lo confirmas?');
    const clpOk = await agentCheckout(ids.CLP.main, 'Main CLP queda en $19.990. ¿Lo confirmas?');
    const usdData = usdOk.ok ? (usdOk.data as { orderId: string; displayPrice: string; currency: string }) : null;
    const usdOrder = usdData ? await prisma.customerOrder.findFirst({ where: { id: usdData.orderId, workspaceId: A.workspaceId } }) : null;
    check(
      'M-AGENT2. Producto activo + "confirmo" → precio/moneda server-side para USD y CLP, sin aceptar productId del modelo',
      usdData?.displayPrice === '$19.99' && usdData.currency === 'USD' && usdOrder?.currency === 'USD' && usdOrder.total === 1999 && usdCents.ok && clpOk.ok && (clpOk.data as { displayPrice: string }).displayPrice === '$19.990',
      JSON.stringify({ usdOk, usdCents, clpOk }),
    );
  } finally {
    delete globals[guard];
    if (previousVisual === undefined) delete process.env.LOCAL_VISUAL_TEST;
    else process.env.LOCAL_VISUAL_TEST = previousVisual;
  }
}

// =============================================================================
const clearCover = await asUser(A.session, () => coverDeleteRoute(jsonReq(`/api/products/${shirtId}/cover`, undefined, 'DELETE'), params(shirtId)));
check('I2. Quitar portada', clearCover.status === 200);

await crossTenantPrisma.platformAuditLog.deleteMany({ where: { OR: [{ targetWorkspaceId: { in: createdWorkspaces } }, { actorUserId: { in: createdUsers } }] } });
const memberUsers = (await prisma.workspaceMembership.findMany({ where: { workspaceId: { in: createdWorkspaces } }, select: { userId: true } })).map((m) => m.userId);
await crossTenantPrisma.workspace.deleteMany({ where: { id: { in: createdWorkspaces } } });
await crossTenantPrisma.user.deleteMany({ where: { id: { in: [...new Set([...createdUsers, ...memberUsers])] } } });
for (const id of createdWorkspaces) await rm(join(process.cwd(), '.media', 'products', id), { recursive: true, force: true });

const passed = results.filter((r) => r.ok).length;
console.log(`\n== Resultado: ${passed}/${results.length} pruebas OK ==`);
await prisma.$disconnect();
if (failures > 0) process.exit(1);
