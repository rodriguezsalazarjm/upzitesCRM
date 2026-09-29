/**
 * Launch readiness: negocio interno de infoproductos (SCALE + COMP) vendiendo
 * con su propio commerce, sin cruzarse nunca con el billing SaaS.
 *
 *  H. Ledger: venta → CustomerOrder/Payment/FulfillmentOrder/DigitalDelivery,
 *     NUNCA WorkspaceSubscription/SubscriptionPayment; cobro SaaS → al reves.
 *  K. Entrega digital: transaccional del tenant (no consume emails.monthly,
 *     que vale 0 en todos los planes) e idempotente ante webhooks repetidos.
 *  L. Dashboard infoproducto: cifras reales del workspace, sin SaaS.
 *  M. Produccion sin proveedor de email: la entrega queda FAILED (nunca SENT),
 *     con aviso, y un webhook repetido no duplica pago/fulfillment/entrega.
 *  N. Checkout publico /checkout/[id]: token firmado, datos persistidos,
 *     conexion MP del workspace, idempotencia, estados y pedidos invalidos.
 *
 * El negocio se crea por Platform Admin (provisioning normal): ningun nombre
 * concreto en el codigo.
 *
 * Uso, desde apps/crm (exige TEST_DATABASE_URL con el marcador de base aislada):
 *   pnpm exec tsx scripts/smoke-commerce-ledger.ts
 */
import './fixtures/test-environment';
import { randomUUID } from 'node:crypto';
import { EmailDomainStatus, EmailProviderKind, PaymentStatus, PlanCode, PlatformRole, ProductStatus, ProductType, WorkspaceRole } from '../generated/prisma/client';
import { crossTenantPrisma, prisma } from '../src/lib/prisma';
import { ensurePlanCatalog } from '../src/lib/billing/plan-catalog';
import { getCurrentPrice } from '../src/lib/billing/price-book';
import { recordSaasPayment } from '../src/lib/billing/subscription-admin';
import { resolveSubscription } from '../src/lib/billing/subscription-access';
import { classifyPayment, processOrderPayment } from '../src/lib/commerce/payment-webhook';
import { createOrder } from '../src/lib/commerce/orders';
import { createOrderCheckout } from '../src/lib/commerce/checkout';
import { createPlatformClient } from '../src/lib/platform/clients';
import { loadPublicCheckout, startPublicCheckoutPayment } from '../src/lib/commerce/public-checkout';
import { maskEmail, PUBLIC_CHECKOUT_TTL_MS, signCheckoutToken } from '../src/lib/commerce/public-checkout-link';
import { getWorkspaceExperience, loadDashboard } from '../src/lib/workspace-experience';
import { completeOnboarding } from '../src/lib/workspace-profile/service';

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
const PRICE = 29900;

const ledger = async (workspaceId: string) => ({
  orders: await prisma.customerOrder.count({ where: { workspaceId } }),
  payments: await prisma.payment.count({ where: { workspaceId } }),
  fulfillments: await prisma.fulfillmentOrder.count({ where: { order: { workspaceId } } }),
  deliveries: await prisma.digitalDelivery.count({ where: { workspaceId } }),
  saasPayments: await prisma.subscriptionPayment.count({ where: { workspaceId } }),
  subscription: await prisma.workspaceSubscription.findUnique({ where: { workspaceId }, select: { id: true, planId: true, billingSource: true, currentPeriodEnd: true, updatedAt: true } }),
});
const emailUsage = async (workspaceId: string) =>
  (await prisma.usageCounter.aggregate({ where: { workspaceId, metric: { in: ['emails', 'emails.monthly'] } }, _sum: { quantity: true } }))._sum.quantity ?? 0;

// =============================================================================
console.log('\n== G. Negocio interno de infoproductos por provisioning normal ==');
const operator = await prisma.user.create({ data: { name: 'Operador', email: `sa-${stamp}@ledger.test`, passwordHash: 'x', platformRole: PlatformRole.SUPER_ADMIN } });
createdUsers.push(operator.id);
const actor = { id: operator.id, name: operator.name, email: operator.email, platformRole: operator.platformRole };
const internal = await createPlatformClient({
  actor,
  idempotencyKey: `ledger-internal-${stamp}`,
  workspaceName: `Infoproducto interno ${stamp}`,
  ownerName: '',
  ownerEmail: '',
  planCode: PlanCode.SCALE,
  billingSource: 'COMP',
  isInternal: true,
  addActorAsOwner: true,
  reason: 'smoke ledger: negocio propio',
  initialBusiness: { businessType: 'ECOMMERCE', commerceSubtype: 'INFOPRODUCT' },
});
const W = internal.workspaceId;
createdWorkspaces.push(W);
await completeOnboarding({ userId: operator.id, workspaceId: W, role: WorkspaceRole.OWNER }, {
  businessType: 'ECOMMERCE',
  commerceSubtype: 'INFOPRODUCT',
  primaryGoal: 'SALES',
  preferredChannels: ['WHATSAPP', 'INSTAGRAM'],
  teamSize: 'SOLO',
});
{
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: W }, select: { isInternal: true, profile: true } });
  const sub = await resolveSubscription(W);
  check(
    'G. isInternal + SCALE + COMP; ECOMMERCE/INFOPRODUCT; preset infoproduct aplicado',
    ws.isInternal && sub.effectivePlan === 'SCALE' && sub.billingSource === 'COMP' && ws.profile?.businessType === 'ECOMMERCE' && ws.profile.commerceSubtype === 'INFOPRODUCT' && ws.profile.presetKey === 'infoproduct',
    `${sub.effectivePlan}/${sub.billingSource}/${ws.profile?.presetKey}`,
  );
}

// Catalogo: producto digital con un acceso por enlace; cliente con email;
// remitente de email del workspace (proveedor guionado de pruebas).
const product = await prisma.product.create({
  data: {
    workspaceId: W,
    name: 'Devocional digital',
    type: ProductType.DIGITAL,
    status: ProductStatus.ACTIVE,
    variants: { create: [{ name: 'Acceso', priceClp: PRICE, isDefault: true }] },
    assets: { create: [{ workspaceId: W, name: 'Acceso al contenido', target: 'https://contenido.ledger.test/curso' }] },
  },
  include: { variants: true },
});
const contact = await prisma.contact.create({ data: { workspaceId: W, firstName: 'Comprador', lastName: 'Ledger', email: `comprador-${stamp}@ledger.test` } });
await prisma.emailDomain.create({
  data: { workspaceId: W, domain: `ledger-${stamp}.test`, provider: EmailProviderKind.SCRIPTED, status: EmailDomainStatus.VERIFIED, fromEmail: `hola@ledger-${stamp}.test`, verifiedAt: new Date() },
});

// =============================================================================
console.log('\n== H + K. Venta del infoproducto (webhook de pago aprobado) ==');
const before = await ledger(W);
const usageBefore = await emailUsage(W);
const order = await createOrder({ workspaceId: W, contactId: contact.id, customerEmail: contact.email, items: [{ variantId: product.variants[0].id, quantity: 1 }] });
const paymentId = `mp-ledger-${randomUUID()}`;
const pay = () =>
  processOrderPayment({ orderId: order.id, externalPaymentId: paymentId, status: PaymentStatus.APPROVED, rawStatus: 'approved', amount: order.total, currency: order.currency, payerEmail: contact.email, baseUrl: 'https://crm.ledger.test', workspaceId: W });
const first = await pay();
const afterFirst = await ledger(W);
const deliveryEmails = () => prisma.emailMessage.count({ where: { workspaceId: W, contactId: contact.id } });
const emailsAfterFirst = await deliveryEmails();
check(
  'H1. La venta crea CustomerOrder (FULFILLED al entregar) + Payment + FulfillmentOrder + DigitalDelivery',
  first.handled && afterFirst.orders === 1 && afterFirst.payments === 1 && afterFirst.fulfillments >= 1 && afterFirst.deliveries === 1 && (await prisma.customerOrder.findUniqueOrThrow({ where: { id: order.id } })).status === 'FULFILLED',
  JSON.stringify({ o: afterFirst.orders, p: afterFirst.payments, f: afterFirst.fulfillments, d: afterFirst.deliveries }),
);
check(
  'H2. La venta NUNCA toca WorkspaceSubscription ni SubscriptionPayment',
  afterFirst.saasPayments === before.saasPayments && JSON.stringify(afterFirst.subscription) === JSON.stringify(before.subscription),
);
check(
  'K1. Entrega transaccional: sale por email con emails.monthly = 0 y sin consumir cupo del tenant',
  first.notified === true && emailsAfterFirst === 1 && (await emailUsage(W)) === usageBefore,
  `notified=${first.notified} emails=${emailsAfterFirst}`,
);

const second = await pay();
const third = await pay();
const afterRepeat = await ledger(W);
check(
  'K2. Webhook repetido (x3): un Payment, una DigitalDelivery, un solo email de entrega',
  second.alreadyProcessed === true && third.alreadyProcessed === true && afterRepeat.payments === 1 && afterRepeat.deliveries === 1 && (await deliveryEmails()) === 1,
);

// =============================================================================
console.log('\n== H. Cobro SaaS (otro workspace cliente) ==');
const client = await createPlatformClient({
  actor,
  idempotencyKey: `ledger-client-${stamp}`,
  workspaceName: `Cliente SaaS ${stamp}`,
  ownerName: 'Cliente',
  ownerEmail: `cliente-${stamp}@ledger.test`,
  planCode: PlanCode.FREE,
  billingSource: 'FREE',
});
const C = client.workspaceId;
createdWorkspaces.push(C);
{
  const plans = await ensurePlanCatalog();
  const price = await getCurrentPrice({ planCode: PlanCode.PRO, currency: 'CLP' });
  await recordSaasPayment({
    workspaceId: C,
    plan: { id: plans[PlanCode.PRO].id, code: PlanCode.PRO, key: plans[PlanCode.PRO].key },
    price: price ? { id: price.id, interval: price.interval } : null,
    currency: 'CLP',
    amountMinor: price?.amountMinor ?? 49990,
    externalPaymentId: `mp-saas-${randomUUID()}`,
  });
  const l = await ledger(C);
  const sub = await resolveSubscription(C);
  check('H3. El cobro SaaS crea SubscriptionPayment y activa el plan; NUNCA CustomerOrder ni Payment', l.saasPayments === 1 && sub.effectivePlan === 'PRO' && l.orders === 0 && l.payments === 0, `${sub.effectivePlan}`);
}
check(
  'H4. Clasificacion fail-closed: order → commerce, saas_subscription → SaaS, sin marca → ninguno',
  classifyPayment({ kind: 'order' }) === 'order' && classifyPayment({ kind: 'saas_subscription' }) === 'saas_subscription' && classifyPayment({}) === 'unknown' && classifyPayment(null) === 'unknown',
);

// =============================================================================
console.log('\n== L. Dashboard infoproducto ==');
{
  // Un pago SaaS en el MISMO workspace interno no debe aparecer en sus cifras.
  const plans = await ensurePlanCatalog();
  await recordSaasPayment({
    workspaceId: W,
    plan: { id: plans[PlanCode.SCALE].id, code: PlanCode.SCALE, key: plans[PlanCode.SCALE].key },
    price: null,
    currency: 'CLP',
    amountMinor: 99990,
    externalPaymentId: `mp-saas-internal-${randomUUID()}`,
  });
  const experience = await getWorkspaceExperience({ workspaceId: W, userId: operator.id, role: WorkspaceRole.OWNER });
  const dashboard = await loadDashboard(experience, W);
  const value = (id: string) => (dashboard.widgets.find((w) => w.id === id)?.data as { value?: number } | null)?.value;
  const top = dashboard.widgets.find((w) => w.id === 'top_products')?.data as { rows: { label: string; value: number }[] } | null;
  check(
    'L1. Widgets del preset infoproducto con datos reales (pedidos, ventas, top productos, recuperacion, mensajes, automatizaciones)',
    JSON.stringify(dashboard.widgets.map((w) => w.id)) === JSON.stringify(['orders_today', 'revenue_today', 'top_products', 'recovered_sales', 'unread_messages', 'automation_activity']) &&
      dashboard.widgets.every((w) => !w.locked && !w.error) && value('orders_today') === 1 && top?.rows[0]?.value === PRICE,
  );
  check('L2. Ninguna cifra SaaS entra en el dashboard (ventas = solo el pedido, aunque haya un cobro SaaS de 99.990)', value('revenue_today') === PRICE, `revenue=${value('revenue_today')}`);
}

// =============================================================================
console.log('\n== M. Produccion sin proveedor de email: nunca SENT, sin duplicar entrega ==');
{
  // Mismo camino que un deploy sin RESEND_API_KEY: el dominio del workspace es
  // del proveedor guionado y el runtime es produccion.
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = env.NODE_ENV;
  const prodOrder = await createOrder({ workspaceId: W, contactId: contact.id, customerEmail: contact.email, items: [{ variantId: product.variants[0].id, quantity: 1 }] });
  const prodPaymentId = `mp-ledger-prod-${randomUUID()}`;
  const payProd = () =>
    processOrderPayment({ orderId: prodOrder.id, externalPaymentId: prodPaymentId, status: PaymentStatus.APPROVED, rawStatus: 'approved', amount: prodOrder.total, currency: prodOrder.currency, payerEmail: contact.email, baseUrl: 'https://crm.ledger.test', workspaceId: W });
  const sentBefore = await prisma.emailMessage.count({ where: { workspaceId: W, status: 'SENT' } });
  env.NODE_ENV = 'production';
  try {
    const firstProd = await payProd();
    const failed = await prisma.emailMessage.findMany({ where: { workspaceId: W, contactId: contact.id, status: { not: 'SENT' } }, select: { status: true, lastError: true } });
    const alert = await prisma.workspaceAlert.findFirst({ where: { workspaceId: W, dedupeKey: `delivery-not-sent:${prodOrder.id}`, resolvedAt: null } });
    check(
      'M1. Produccion sin proveedor: el email queda FAILED / PROVIDER_UNAVAILABLE, nunca SENT, y se levanta el aviso para reenviar',
      firstProd.handled && firstProd.notified === false && failed.length === 1 && failed[0].status === 'FAILED' && failed[0].lastError === 'PROVIDER_UNAVAILABLE' &&
        (await prisma.emailMessage.count({ where: { workspaceId: W, status: 'SENT' } })) === sentBefore && Boolean(alert),
      JSON.stringify({ notified: firstProd.notified, failed }),
    );
    const fulfillmentsAfterFirst = await prisma.fulfillmentOrder.count({ where: { orderId: prodOrder.id } });
    const retryA = await payProd();
    const retryB = await payProd();
    check(
      'M2. Webhook repetido tras el fallo de email: un Payment, fulfillment sin duplicar, una DigitalDelivery y ningun email extra',
      retryA.alreadyProcessed === true && retryB.alreadyProcessed === true &&
        (await prisma.payment.count({ where: { orderId: prodOrder.id } })) === 1 &&
        fulfillmentsAfterFirst >= 1 && (await prisma.fulfillmentOrder.count({ where: { orderId: prodOrder.id } })) === fulfillmentsAfterFirst &&
        (await prisma.digitalDelivery.count({ where: { orderId: prodOrder.id } })) === 1 &&
        (await prisma.emailMessage.count({ where: { workspaceId: W, contactId: contact.id, status: { not: 'SENT' } } })) === 1,
    );
  } finally {
    if (previousNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousNodeEnv;
  }
}

// =============================================================================
console.log('\n== N. Checkout publico /checkout/[id] (cualquier workspace) ==');
{
  const env = process.env as Record<string, string | undefined>;
  const newOrder = () => createOrder({ workspaceId: W, contactId: contact.id, customerEmail: contact.email, items: [{ variantId: product.variants[0].id, quantity: 1 }] });
  const tokenFor = (orderId: string) => signCheckoutToken(orderId);
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  const o1 = await newOrder();
  const preferencesBeforeLink = (await prisma.customerOrder.findUniqueOrThrow({ where: { id: o1.id }, select: { metadata: true } })).metadata;
  const publicLink = await createOrderCheckout({ workspaceId: W, orderId: o1.id });
  const recovery = await prisma.scheduledAction.findMany({ where: { workspaceId: W, cancelKey: `checkout-recovery:${o1.id}` }, select: { payload: true } });
  const afterPublicLink = await prisma.customerOrder.findUniqueOrThrow({ where: { id: o1.id }, select: { status: true, metadata: true } });
  check(
    'N0. Agente/recovery reciben publicUrl; emitir link programa reminders sin crear preference ni filtrar init_point',
    publicLink.checkoutUrl === publicLink.publicUrl && publicLink.publicUrl.includes(`/checkout/${o1.id}?t=`) &&
      !publicLink.publicUrl.includes('mercadopago') && preferencesBeforeLink === null && afterPublicLink.metadata === null && afterPublicLink.status === 'DRAFT' &&
      recovery.length === 3 && recovery.every((item) => (item.payload as { publicUrl?: string }).publicUrl === publicLink.publicUrl),
    JSON.stringify({ publicLink, recovery: recovery.length, status: afterPublicLink.status }),
  );
  const view = await loadPublicCheckout(o1.id, tokenFor(o1.id));
  check(
    'N1. Carga el pedido: producto, monto y moneda persistidos, comprador enmascarado, estado PAYABLE',
    view.ok && view.item.quantity === 1 && view.total === PRICE && view.currency === o1.currency && view.state === 'PAYABLE' &&
      view.buyer.email === maskEmail(contact.email) && view.workspaceName.startsWith('Infoproducto interno'),
    JSON.stringify(view),
  );

  const o2 = await newOrder();
  const later = new Date(Date.now() + PUBLIC_CHECKOUT_TTL_MS + 60_000);
  check(
    'N2. Token invalido / de otro pedido → NOT_FOUND; vencido → EXPIRED (sin datos del pedido)',
    same(await loadPublicCheckout(o1.id, 'basura'), { ok: false, reason: 'NOT_FOUND' }) &&
      same(await loadPublicCheckout(o1.id, tokenFor(o2.id)), { ok: false, reason: 'NOT_FOUND' }) &&
      same(await loadPublicCheckout(o1.id, tokenFor(o1.id), later), { ok: false, reason: 'EXPIRED' }) &&
      same(await startPublicCheckoutPayment(o1.id, tokenFor(o1.id), later), { ok: false, reason: 'EXPIRED' }),
  );

  // Sin MercadoPagoConnection del workspace no hay pago, aunque exista un token SaaS.
  const previousSaasToken = env.MERCADO_PAGO_ACCESS_TOKEN;
  env.MERCADO_PAGO_ACCESS_TOKEN = 'TEST-saas-token-no-debe-usarse';
  try {
    const noConnection = await startPublicCheckoutPayment(o1.id, tokenFor(o1.id));
    check('N3. Sin conexion MP del workspace → PAYMENTS_UNAVAILABLE (nunca cae al token SaaS)', same(noConnection, { ok: false, reason: 'PAYMENTS_UNAVAILABLE' }), JSON.stringify(noConnection));
  } finally {
    if (previousSaasToken === undefined) delete env.MERCADO_PAGO_ACCESS_TOKEN;
    else env.MERCADO_PAGO_ACCESS_TOKEN = previousSaasToken;
  }

  // Preferencia ya creada por el CTA Pagar: se reutiliza, tambien en paralelo.
  const prefUrl = `https://www.mercadopago.cl/checkout/v1/redirect?pref_id=ledger-${stamp}`;
  await prisma.customerOrder.update({ where: { id: o1.id }, data: { status: 'PENDING_PAYMENT', metadata: { preferenceId: `ledger-${stamp}`, checkoutUrl: prefUrl, checkoutCreatedAt: new Date().toISOString() } } });
  const scheduledBefore = await prisma.scheduledAction.count({ where: { workspaceId: W } });
  const parallel = await Promise.all([1, 2, 3].map(() => startPublicCheckoutPayment(o1.id, tokenFor(o1.id))));
  check(
    'N4. Idempotente: 3 inicios en paralelo reutilizan la misma preferencia y no reprograman recuperacion',
    parallel.every((r) => r.ok && r.reused && r.redirectUrl === prefUrl) && (await prisma.scheduledAction.count({ where: { workspaceId: W } })) === scheduledBefore,
    JSON.stringify(parallel),
  );

  // Precio desde datos persistidos: si la linea ya no cuadra con el total, no se cobra.
  const o3 = await newOrder();
  await prisma.orderLine.updateMany({ where: { orderId: o3.id }, data: { unitPrice: 1, total: 1 } });
  // Producto de OTRO workspace colgado de un pedido de W.
  const foreign = await prisma.product.create({ data: { workspaceId: C, name: 'Ajeno', type: ProductType.DIGITAL, status: ProductStatus.ACTIVE, variants: { create: [{ name: 'Ajeno', priceClp: PRICE, isDefault: true }] } }, include: { variants: true } });
  const o4 = await newOrder();
  await prisma.orderLine.updateMany({ where: { orderId: o4.id }, data: { variantId: foreign.variants[0].id } });
  // Dos items: fuera de la primera version.
  const o5 = await createOrder({ workspaceId: W, contactId: contact.id, customerEmail: contact.email, items: [{ variantId: product.variants[0].id, quantity: 1 }, { variantId: product.variants[0].id, quantity: 1 }] });
  const o6 = await newOrder();
  await prisma.customerOrder.update({ where: { id: o6.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
  const unavailable = async (orderId: string) =>
    same(await loadPublicCheckout(orderId, tokenFor(orderId)), { ok: false, reason: 'UNAVAILABLE' }) &&
    same(await startPublicCheckoutPayment(orderId, tokenFor(orderId)), { ok: false, reason: 'UNAVAILABLE' });
  const o5Lines = await prisma.orderLine.count({ where: { orderId: o5.id } });
  check(
    'N5. Pedido inconsistente (monto alterado), producto de otro workspace, multi-item o cancelado → UNAVAILABLE',
    (await unavailable(o3.id)) && (await unavailable(o4.id)) && (o5Lines < 2 || (await unavailable(o5.id))) && (await unavailable(o6.id)),
    `lineas o5=${o5Lines}`,
  );

  // Estados desde la base: pago pendiente → PENDING; aprobado (webhook) → PAID y no se vuelve a cobrar.
  const o7 = await newOrder();
  await processOrderPayment({ orderId: o7.id, externalPaymentId: `mp-ledger-pend-${randomUUID()}`, status: PaymentStatus.PENDING, rawStatus: 'in_process', amount: o7.total, currency: o7.currency, baseUrl: 'https://crm.ledger.test', workspaceId: W });
  const pendingView = await loadPublicCheckout(o7.id, tokenFor(o7.id));
  const pendingStart = await startPublicCheckoutPayment(o7.id, tokenFor(o7.id));
  await processOrderPayment({ orderId: o1.id, externalPaymentId: `mp-ledger-pub-${randomUUID()}`, status: PaymentStatus.APPROVED, rawStatus: 'approved', amount: o1.total, currency: o1.currency, payerEmail: contact.email, baseUrl: 'https://crm.ledger.test', workspaceId: W });
  const paidView = await loadPublicCheckout(o1.id, tokenFor(o1.id));
  const paidStart = await startPublicCheckoutPayment(o1.id, tokenFor(o1.id));
  check(
    'N6. Estado desde la base: pendiente → PENDING (sin nuevo cobro); aprobado por webhook → PAID y ALREADY_PAID',
    pendingView.ok && pendingView.state === 'PENDING' && same(pendingStart, { ok: false, reason: 'PENDING' }) &&
      paidView.ok && paidView.state === 'PAID' && same(paidStart, { ok: false, reason: 'ALREADY_PAID' }),
    JSON.stringify({ pendingView: pendingView.ok && pendingView.state, pendingStart, paidView: paidView.ok && paidView.state, paidStart }),
  );

  // Demo local (sin red): el camino completo de inicio crea el checkout una vez y luego lo reutiliza.
  const o8 = await newOrder();
  const guard = Symbol.for('upzites.visual.guard');
  const globals = globalThis as Record<symbol, unknown>;
  const previousVisual = env.LOCAL_VISUAL_TEST;
  env.LOCAL_VISUAL_TEST = '1';
  globals[guard] = true;
  try {
    const firstStart = await startPublicCheckoutPayment(o8.id, tokenFor(o8.id));
    const secondStart = await startPublicCheckoutPayment(o8.id, tokenFor(o8.id));
    check(
      'N7. CTA Pagar: la primera vez crea preference del workspace y la segunda reutiliza la misma URL',
      firstStart.ok && !firstStart.reused && secondStart.ok && secondStart.reused && firstStart.redirectUrl === secondStart.redirectUrl,
      JSON.stringify({ firstStart, secondStart }),
    );
  } finally {
    delete globals[guard];
    if (previousVisual === undefined) delete env.LOCAL_VISUAL_TEST;
    else env.LOCAL_VISUAL_TEST = previousVisual;
  }
}

// =============================================================================
await crossTenantPrisma.platformAuditLog.deleteMany({ where: { OR: [{ targetWorkspaceId: { in: createdWorkspaces } }, { actorUserId: { in: createdUsers } }] } });
const memberUsers = (await prisma.workspaceMembership.findMany({ where: { workspaceId: { in: createdWorkspaces } }, select: { userId: true } })).map((m) => m.userId);
await crossTenantPrisma.workspace.deleteMany({ where: { id: { in: createdWorkspaces } } });
await crossTenantPrisma.user.deleteMany({ where: { id: { in: [...new Set([...createdUsers, ...memberUsers])] } } });
const passed = results.filter((r) => r.ok).length;
console.log(`\n== Resultado: ${passed}/${results.length} pruebas OK ==`);
await prisma.$disconnect();
if (failures > 0) process.exit(1);
