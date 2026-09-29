/**
 * Launch readiness: negocio interno de infoproductos (SCALE + COMP) vendiendo
 * con su propio commerce, sin cruzarse nunca con el billing SaaS.
 *
 *  H. Ledger: venta → CustomerOrder/Payment/FulfillmentOrder/DigitalDelivery,
 *     NUNCA WorkspaceSubscription/SubscriptionPayment; cobro SaaS → al reves.
 *  K. Entrega digital: transaccional del tenant (no consume emails.monthly,
 *     que vale 0 en todos los planes) e idempotente ante webhooks repetidos.
 *  L. Dashboard infoproducto: cifras reales del workspace, sin SaaS.
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
import { createPlatformClient } from '../src/lib/platform/clients';
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
await crossTenantPrisma.platformAuditLog.deleteMany({ where: { OR: [{ targetWorkspaceId: { in: createdWorkspaces } }, { actorUserId: { in: createdUsers } }] } });
const memberUsers = (await prisma.workspaceMembership.findMany({ where: { workspaceId: { in: createdWorkspaces } }, select: { userId: true } })).map((m) => m.userId);
await crossTenantPrisma.workspace.deleteMany({ where: { id: { in: createdWorkspaces } } });
await crossTenantPrisma.user.deleteMany({ where: { id: { in: [...new Set([...createdUsers, ...memberUsers])] } } });
const passed = results.filter((r) => r.ok).length;
console.log(`\n== Resultado: ${passed}/${results.length} pruebas OK ==`);
await prisma.$disconnect();
if (failures > 0) process.exit(1);
