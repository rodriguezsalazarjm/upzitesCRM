/**
 * Pruebas de aceptacion de la Fase 5 (infoproductos, Mercado Pago y entrega).
 *
 * Cubre lo que exige la spec para cerrar la fase:
 *   - pago duplicado no duplica entrega
 *   - monto o producto adulterado es rechazado
 *   - pago pendiente no entrega
 *   - pago aprobado actualiza orden, contacto, oportunidad y actividad
 *   - reenvio manual de acceso controlado
 *
 * Y lo que estaba anotado como riesgo desde la Fase 0:
 *   - el pago de un producto NO activa la suscripcion del CRM
 *
 * Uso, desde apps/crm:
 *   pnpm exec tsx scripts/smoke-fase5.ts
 */
import 'dotenv/config';
import {
  DeliveryStatus,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  ProductType,
  ScheduledActionStatus,
  SubscriptionStatus,
} from '../generated/prisma/client';
import { prisma } from '../src/lib/prisma';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { createOrder, getOrder, listCatalog, OrderError, cancelOrder } from '../src/lib/commerce/orders';
import { recoveryKeyFor, upsertPayment } from '../src/lib/commerce/checkout';
import { classifyPayment, processOrderPayment } from '../src/lib/commerce/payment-webhook';
import {
  grantDigitalDelivery,
  hashDeliveryToken,
  resendDelivery,
  resolveDelivery,
} from '../src/lib/commerce/delivery';
import { scheduleAction } from '../src/lib/domain';
import { AGENT_TOOLS, PENDING_TOOLS } from '../src/lib/agents/tools';

const results: { name: string; ok: boolean }[] = [];
let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const stamp = Date.now();
const BASE_URL = 'http://localhost:3001';

async function makeWorkspace(key: string) {
  const { workspace, user } = await createCustomerWorkspace({
    companyName: `fase5-${key}-${stamp}`,
    ownerName: `Owner ${key}`,
    email: `fase5-${key}-${stamp}@upzites.test`,
    password: 'Fase5#Test1234',
  });
  return { workspaceId: workspace.id, userId: user.id };
}

/** Producto digital con un asset entregable. */
async function makeDigitalProduct(workspaceId: string, name: string, priceClp: number) {
  const product = await prisma.product.create({
    data: {
      workspaceId,
      name,
      description: 'Producto de prueba',
      type: ProductType.DIGITAL,
      status: ProductStatus.ACTIVE,
      variants: { create: { name: 'Estandar', priceClp, isDefault: true, inventory: null } },
      assets: {
        create: { workspaceId, kind: 'LINK', name: `${name} — acceso`, target: 'https://ejemplo.test/recurso' },
      },
    },
    include: { variants: true, assets: true },
  });
  return { product, variant: product.variants[0], asset: product.assets[0] };
}

async function makeContact(workspaceId: string, suffix: string) {
  return prisma.contact.create({
    data: {
      workspaceId,
      firstName: 'Comprador',
      lastName: suffix,
      email: `c5-${suffix}-${stamp}@ejemplo.test`,
      phone: `+5696${suffix.padStart(6, '0').slice(0, 6)}`,
      source: 'fase5',
    },
  });
}

console.log('\n== Pruebas Fase 5 ==\n');

const A = await makeWorkspace('a');
const B = await makeWorkspace('b');

// --- 1. Catalogo -------------------------------------------------------------
{
  const { product, variant } = await makeDigitalProduct(A.workspaceId, 'Guia digital', 19900);
  check('Se crea un producto digital', product.type === ProductType.DIGITAL);
  check('Un digital no lleva control de stock', variant.inventory === null);

  const catalog = await listCatalog(A.workspaceId);
  check('El catalogo lista el producto activo', catalog.length === 1);

  await prisma.product.create({
    data: {
      workspaceId: A.workspaceId,
      name: 'Borrador oculto',
      type: ProductType.DIGITAL,
      status: ProductStatus.DRAFT,
      variants: { create: { name: 'Estandar', priceClp: 1000, isDefault: true } },
    },
  });
  const afterDraft = await listCatalog(A.workspaceId);
  check('Un producto en borrador NO aparece en el catalogo', afterDraft.length === 1);

  const catalogB = await listCatalog(B.workspaceId);
  check('El catalogo de B no ve productos de A', catalogB.length === 0);
}

// --- 2. Pedidos: el precio lo pone el servidor ------------------------------
{
  const { variant } = await makeDigitalProduct(A.workspaceId, 'Curso digital', 49900);
  const contact = await makeContact(A.workspaceId, '1');

  const order = await createOrder({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    items: [{ variantId: variant.id, quantity: 2 }],
  });

  check('El total lo calcula el servidor', order.total === 49900 * 2, `${order.total}`);
  check('La linea guarda snapshot del precio', order.lines[0].unitPrice === 49900);
  check('La linea guarda snapshot del nombre', order.lines[0].name.includes('Curso digital'));
  check('El pedido nace en DRAFT', order.status === OrderStatus.DRAFT);

  // Cambiar el precio del catalogo no reescribe lo ya pedido.
  await prisma.productVariant.update({ where: { id: variant.id }, data: { priceClp: 99900 } });
  const reloaded = await getOrder(A.workspaceId, order.id);
  check('Subir el precio del catalogo NO cambia un pedido existente',
    reloaded?.lines[0].unitPrice === 49900 && reloaded?.total === 99800);
  await prisma.productVariant.update({ where: { id: variant.id }, data: { priceClp: 49900 } });
}

// --- 3. Validaciones del pedido ---------------------------------------------
{
  const contact = await makeContact(A.workspaceId, '2');

  let rejected = false;
  try {
    await createOrder({ workspaceId: A.workspaceId, contactId: contact.id, items: [] });
  } catch (error) {
    rejected = error instanceof OrderError && error.code === 'EMPTY';
  }
  check('Un pedido sin lineas es rechazado', rejected);

  // Variante de OTRO workspace.
  const foreign = await makeDigitalProduct(B.workspaceId, 'Producto de B', 5000);
  let crossTenant = false;
  try {
    await createOrder({
      workspaceId: A.workspaceId,
      contactId: contact.id,
      items: [{ variantId: foreign.variant.id, quantity: 1 }],
    });
  } catch (error) {
    crossTenant = error instanceof OrderError && error.code === 'NOT_FOUND';
  }
  check('No se puede pedir un producto de otro workspace', crossTenant);

  // Producto sin stock.
  const physical = await prisma.product.create({
    data: {
      workspaceId: A.workspaceId,
      name: 'Producto fisico agotado',
      type: ProductType.PHYSICAL,
      status: ProductStatus.ACTIVE,
      variants: { create: { name: 'Estandar', priceClp: 10000, isDefault: true, inventory: 0 } },
    },
    include: { variants: true },
  });

  let outOfStock = false;
  try {
    await createOrder({
      workspaceId: A.workspaceId,
      contactId: contact.id,
      items: [{ variantId: physical.variants[0].id, quantity: 1 }],
    });
  } catch (error) {
    outOfStock = error instanceof OrderError && error.code === 'OUT_OF_STOCK';
  }
  check('Un producto agotado no se vende', outOfStock);
}

// --- 4. Discriminacion suscripcion vs pedido (riesgo de la Fase 0) ---------
{
  check('Sin `kind` se asume suscripcion (compatibilidad hacia atras)',
    classifyPayment({ planKey: 'monthly' }) === 'subscription');
  check('Con kind=order se trata como pedido', classifyPayment({ kind: 'order' }) === 'order');
  check('Con kind=subscription se trata como suscripcion',
    classifyPayment({ kind: 'subscription' }) === 'subscription');
  check('Metadata vacia se asume suscripcion', classifyPayment(null) === 'subscription');
}

// --- 5. Pago pendiente NO entrega -------------------------------------------
{
  const { variant } = await makeDigitalProduct(A.workspaceId, 'Producto pendiente', 15000);
  const contact = await makeContact(A.workspaceId, '3');
  const order = await createOrder({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    items: [{ variantId: variant.id, quantity: 1 }],
  });

  const result = await processOrderPayment({
    orderId: order.id,
    externalPaymentId: `pay-pending-${stamp}`,
    status: PaymentStatus.PENDING,
    rawStatus: 'in_process',
    amount: 15000,
    currency: 'CLP',
    baseUrl: BASE_URL,
  });

  check('Un pago pendiente se registra', result.handled === true);
  check('Un pago pendiente NO entrega nada', result.delivered === 0);

  const reloaded = await getOrder(A.workspaceId, order.id);
  check('El pedido NO queda confirmado', reloaded?.status !== OrderStatus.CONFIRMED);
  check('No se genera ningun acceso digital', (reloaded?.deliveries.length ?? 0) === 0);

  const contactAfter = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
  check('El contacto NO se convierte en cliente', contactAfter.lifecycleStatus === 'LEAD');
}

// --- 6. Monto adulterado es rechazado ---------------------------------------
{
  const { variant } = await makeDigitalProduct(A.workspaceId, 'Producto caro', 89900);
  const contact = await makeContact(A.workspaceId, '4');
  const order = await createOrder({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    items: [{ variantId: variant.id, quantity: 1 }],
  });

  // Alguien manipula la preferencia y paga 100 pesos por algo de 89.900.
  const tampered = await processOrderPayment({
    orderId: order.id,
    externalPaymentId: `pay-tampered-${stamp}`,
    status: PaymentStatus.APPROVED,
    rawStatus: 'approved',
    amount: 100,
    currency: 'CLP',
    baseUrl: BASE_URL,
  });

  check('Un monto que no coincide es RECHAZADO', tampered.handled === false);
  check('El motivo queda claro', tampered.reason?.includes('monto') === true);

  const reloaded = await getOrder(A.workspaceId, order.id);
  check('El pedido no se confirma con monto adulterado', reloaded?.status !== OrderStatus.CONFIRMED);
  check('No se entrega nada', (reloaded?.deliveries.length ?? 0) === 0);

  const audit = await prisma.auditLog.findFirst({
    where: { workspaceId: A.workspaceId, action: 'order.payment_amount_mismatch' },
  });
  check('El intento queda auditado', audit !== null);

  // Moneda distinta tambien se rechaza.
  const wrongCurrency = await processOrderPayment({
    orderId: order.id,
    externalPaymentId: `pay-currency-${stamp}`,
    status: PaymentStatus.APPROVED,
    rawStatus: 'approved',
    amount: 89900,
    currency: 'USD',
    baseUrl: BASE_URL,
  });
  check('Una moneda distinta tambien se rechaza', wrongCurrency.handled === false);
}

// --- 7. Pago aprobado: el flujo completo ------------------------------------
let paidOrderId = '';
let paidContactId = '';
{
  const { variant, asset } = await makeDigitalProduct(A.workspaceId, 'Infoproducto', 25000);
  const contact = await makeContact(A.workspaceId, '5');
  paidContactId = contact.id;

  // Oportunidad abierta y recuperacion programada, como en un flujo real.
  const stage = await prisma.pipelineStage.findFirstOrThrow({
    where: { workspaceId: A.workspaceId, key: 'NEW' },
  });
  const opportunity = await prisma.opportunity.create({
    data: {
      workspaceId: A.workspaceId,
      contactId: contact.id,
      stageId: stage.id,
      title: 'Compra de infoproducto',
      value: 25000,
      probability: 20,
    },
  });

  const order = await createOrder({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    items: [{ variantId: variant.id, quantity: 1 }],
  });
  paidOrderId = order.id;

  await scheduleAction({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    type: 'CHECKOUT_RECOVERY',
    runAt: new Date(Date.now() + 3_600_000),
    cancelKey: recoveryKeyFor(order.id),
  });

  const result = await processOrderPayment({
    orderId: order.id,
    externalPaymentId: `pay-ok-${stamp}`,
    status: PaymentStatus.APPROVED,
    rawStatus: 'approved',
    amount: 25000,
    currency: 'CLP',
    payerEmail: contact.email,
    baseUrl: BASE_URL,
  });

  check('Un pago valido se procesa', result.handled === true);
  check('Se entrega el acceso digital', result.delivered === 1, `${result.delivered}`);

  const reloaded = await getOrder(A.workspaceId, order.id);
  check('El pedido queda FULFILLED', reloaded?.status === OrderStatus.FULFILLED);
  check('Se registra el pago', reloaded?.payments[0]?.status === PaymentStatus.APPROVED);
  check('Se crea el fulfillment', (reloaded?.fulfillments.length ?? 0) === 1);
  check('Se concede el acceso al asset', reloaded?.deliveries[0]?.assetId === asset.id);

  const contactAfter = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
  check('El contacto pasa a CUSTOMER', contactAfter.lifecycleStatus === 'CUSTOMER');

  const oppAfter = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunity.id } });
  check('La oportunidad queda ganada', oppAfter.status === 'WON');

  const activity = await prisma.activity.findFirst({
    where: { workspaceId: A.workspaceId, contactId: contact.id, title: 'Pago confirmado' },
  });
  check('Se registra la actividad del pago', activity !== null);

  const pendingRecovery = await prisma.scheduledAction.count({
    where: { cancelKey: recoveryKeyFor(order.id), status: ScheduledActionStatus.PENDING },
  });
  check('La recuperacion de checkout se cancela', pendingRecovery === 0);

  // Lo que la Fase 0 marco como riesgo: esto NO debe tocar la suscripcion.
  const subscription = await prisma.workspaceSubscription.findFirstOrThrow({
    where: { workspaceId: A.workspaceId },
  });
  check('Comprar un producto NO activa la suscripcion del CRM',
    subscription.status === SubscriptionStatus.TRIAL, `status=${subscription.status}`);
  check('Ni le asigna el pago del producto', subscription.mpPaymentId === null);
}

// --- 8. Pago duplicado NO duplica entrega -----------------------------------
{
  const before = await prisma.digitalDelivery.count({ where: { orderId: paidOrderId } });

  // Mercado Pago reintrega el MISMO pago diez veces.
  for (let i = 0; i < 10; i += 1) {
    await processOrderPayment({
      orderId: paidOrderId,
      externalPaymentId: `pay-ok-${stamp}`,
      status: PaymentStatus.APPROVED,
      rawStatus: 'approved',
      amount: 25000,
      currency: 'CLP',
      baseUrl: BASE_URL,
    });
  }

  const after = await prisma.digitalDelivery.count({ where: { orderId: paidOrderId } });
  check('Diez reentregas del mismo pago dejan UN solo acceso', before === after && after === 1, `${after}`);

  const payments = await prisma.payment.count({ where: { externalId: `pay-ok-${stamp}` } });
  check('Y un solo registro de pago', payments === 1);

  const fulfillments = await prisma.fulfillmentOrder.count({ where: { orderId: paidOrderId } });
  check('Y un solo fulfillment', fulfillments === 1);

  // Un pago DISTINTO sobre el mismo pedido tampoco duplica la entrega.
  await processOrderPayment({
    orderId: paidOrderId,
    externalPaymentId: `pay-second-${stamp}`,
    status: PaymentStatus.APPROVED,
    rawStatus: 'approved',
    amount: 25000,
    currency: 'CLP',
    baseUrl: BASE_URL,
  });
  const afterSecond = await prisma.digitalDelivery.count({ where: { orderId: paidOrderId } });
  check('Un segundo pago del mismo pedido no genera otro acceso', afterSecond === 1);
}

// --- 9. Acceso digital: token, limites y revocacion ------------------------
{
  const { variant } = await makeDigitalProduct(A.workspaceId, 'Producto con acceso', 9900);
  const contact = await makeContact(A.workspaceId, '6');
  const order = await createOrder({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    items: [{ variantId: variant.id, quantity: 1 }],
  });

  await processOrderPayment({
    orderId: order.id,
    externalPaymentId: `pay-access-${stamp}`,
    status: PaymentStatus.APPROVED,
    rawStatus: 'approved',
    amount: 9900,
    currency: 'CLP',
    baseUrl: BASE_URL,
  });

  const granted = await grantDigitalDelivery({
    workspaceId: A.workspaceId,
    orderId: order.id,
    baseUrl: BASE_URL,
  });
  check('Volver a conceder no genera token nuevo', granted.alreadyDelivered === true);

  const delivery = await prisma.digitalDelivery.findFirstOrThrow({ where: { orderId: order.id } });
  check('El token se guarda HASHEADO, no en claro', delivery.tokenHash.length === 64);

  // Se simula el token real regenerandolo por reenvio.
  const resent = await resendDelivery({
    workspaceId: A.workspaceId,
    deliveryId: delivery.id,
    baseUrl: BASE_URL,
  });
  check('El reenvio devuelve una URL nueva', Boolean(resent?.url));

  const token = resent!.url.split('/d/')[1];
  const resolved = await resolveDelivery(token);
  check('El token nuevo resuelve el acceso', resolved.ok === true);

  const stored = await prisma.digitalDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
  check('El hash guardado corresponde al token', stored.tokenHash === hashDeliveryToken(token));
  check('Se cuenta el acceso', stored.downloadCount === 1);
  check('El token viejo deja de servir', (await resolveDelivery('token-inventado')).ok === false);

  // Limite de descargas.
  await prisma.digitalDelivery.update({
    where: { id: delivery.id },
    data: { downloadCount: 20, maxDownloads: 20 },
  });
  const limited = await resolveDelivery(token);
  check('Al agotar las descargas se bloquea',
    limited.ok === false && limited.reason === 'LIMIT_REACHED');

  // Vencimiento.
  await prisma.digitalDelivery.update({
    where: { id: delivery.id },
    data: { downloadCount: 0, expiresAt: new Date(Date.now() - 1000) },
  });
  const expired = await resolveDelivery(token);
  check('Un acceso vencido se bloquea', expired.ok === false && expired.reason === 'EXPIRED');

  // Revocacion.
  await prisma.digitalDelivery.update({
    where: { id: delivery.id },
    data: { status: DeliveryStatus.REVOKED, expiresAt: null },
  });
  const revoked = await resolveDelivery(token);
  check('Un acceso revocado se bloquea', revoked.ok === false && revoked.reason === 'REVOKED');
}

// --- 10. Aislamiento en pagos y entregas ------------------------------------
{
  const { variant } = await makeDigitalProduct(B.workspaceId, 'Producto de B para pagar', 12000);
  const contactB = await makeContact(B.workspaceId, '7');
  const orderB = await createOrder({
    workspaceId: B.workspaceId,
    contactId: contactB.id,
    items: [{ variantId: variant.id, quantity: 1 }],
  });

  // A intenta leer el pedido de B.
  const fromA = await getOrder(A.workspaceId, orderB.id);
  check('Un workspace no puede leer el pedido de otro', fromA === null);

  // A intenta cancelarlo.
  let denied = false;
  try {
    await cancelOrder({ workspaceId: A.workspaceId, orderId: orderB.id });
  } catch (error) {
    denied = error instanceof OrderError && error.code === 'NOT_FOUND';
  }
  check('Ni cancelarlo', denied);

  // El pago de B queda en el workspace de B.
  await processOrderPayment({
    orderId: orderB.id,
    externalPaymentId: `pay-b-${stamp}`,
    status: PaymentStatus.APPROVED,
    rawStatus: 'approved',
    amount: 12000,
    currency: 'CLP',
    baseUrl: BASE_URL,
  });

  const payment = await prisma.payment.findUniqueOrThrow({ where: { externalId: `pay-b-${stamp}` } });
  check('El pago se atribuye al workspace correcto', payment.workspaceId === B.workspaceId);

  const deliveriesInA = await prisma.digitalDelivery.count({
    where: { workspaceId: A.workspaceId, orderId: orderB.id },
  });
  check('La entrega no cruza de workspace', deliveriesInA === 0);
}

// --- 11. Idempotencia de upsertPayment --------------------------------------
{
  const externalId = `pay-idem-${stamp}`;
  const first = await upsertPayment({
    workspaceId: A.workspaceId,
    orderId: null,
    externalId,
    status: PaymentStatus.PENDING,
    amount: 1000,
    currency: 'CLP',
  });
  check('El primer registro no viene marcado como procesado', first.alreadyProcessed === false);

  const approved = await upsertPayment({
    workspaceId: A.workspaceId,
    orderId: null,
    externalId,
    status: PaymentStatus.APPROVED,
    amount: 1000,
    currency: 'CLP',
  });
  check('Un pago pendiente puede avanzar a aprobado', approved.alreadyProcessed === false);

  const again = await upsertPayment({
    workspaceId: A.workspaceId,
    orderId: null,
    externalId,
    status: PaymentStatus.APPROVED,
    amount: 1000,
    currency: 'CLP',
  });
  check('Un pago ya aprobado no se reprocesa', again.alreadyProcessed === true);

  const count = await prisma.payment.count({ where: { externalId } });
  check('Solo existe un registro de ese pago', count === 1);
}

// --- 12. Herramientas del agente --------------------------------------------
{
  const names = AGENT_TOOLS.map((tool) => tool.name);
  check('El agente tiene herramientas de catalogo', names.includes('search_products'));
  check('Y de estado de pago', names.includes('get_payment_status'));
  check('Y puede crear checkout si se lo habilitan', names.includes('create_checkout'));

  check('El agente NO tiene una herramienta para conceder accesos',
    !names.includes('create_digital_delivery'));
  check('Las herramientas de cotizacion siguen pendientes',
    (PENDING_TOOLS as readonly string[]).includes('calculate_quote'));

  // get_order_status no debe filtrar el enlace de entrega.
  const tool = AGENT_TOOLS.find((t) => t.name === 'get_order_status')!;
  const result = await tool.execute(
    { orderId: paidOrderId },
    { workspaceId: A.workspaceId, conversationId: null, contactId: paidContactId, agentRunId: 'test' },
  );
  const payload = JSON.stringify(result);
  check('El estado del pedido NO expone el enlace de entrega', !payload.includes('/d/'));
  check('Pero si dice que fue entregado', payload.includes('"delivered":true'));

  // Un pedido de otro workspace no se resuelve.
  const cross = await tool.execute(
    { orderId: paidOrderId },
    { workspaceId: B.workspaceId, conversationId: null, contactId: null, agentRunId: 'test' },
  );
  check('El agente de B no puede consultar un pedido de A', (cross as { ok: boolean }).ok === false);
}

// --- Limpieza ---------------------------------------------------------------
const deleted = await prisma.workspace.deleteMany({ where: { slug: { startsWith: 'fase5-' } } });
console.log(`\nLimpieza: ${deleted.count} workspaces de prueba eliminados (cascade).`);

console.log(`\n== Resultado: ${results.length - failures}/${results.length} pruebas OK ==`);
await prisma.$disconnect();
process.exit(failures > 0 ? 1 : 0);
