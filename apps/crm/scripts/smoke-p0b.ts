/**
 * P0-B: Subscription Core V2.
 *
 * Planes FREE/START/PRO/SCALE separados del medio de pago, Price Book por
 * moneda, ciclo de vida unico (FREE/TRIAL/ACTIVE/GRACE/SUSPENDED/EXPIRED),
 * operaciones administrativas auditadas, libro de pagos SaaS separado del
 * commerce y metricas SaaS que excluyen los workspaces internos.
 *
 * Uso, desde apps/crm (exige TEST_DATABASE_URL con el marcador de base aislada):
 *   pnpm exec tsx scripts/smoke-p0b.ts
 */
import './fixtures/test-environment';
import { createHmac } from 'node:crypto';
import { BillingSource, PlanCode } from '../generated/prisma/client';
import { crossTenantPrisma, prisma } from '../src/lib/prisma';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { resolveSubscription, canWorkspaceConsume } from '../src/lib/billing/subscription-access';
import {
  activateManualSubscription,
  assignCompSubscription,
  assignPlan,
  recordSaasPayment,
  renewManualSubscription,
  SubscriptionAdminError,
  resumeSubscription,
  setWorkspaceInternal,
  startTrial,
  suspendSubscription,
} from '../src/lib/billing/subscription-admin';
import { findOverlappingPrices, formatMoney, getCurrentPrice, publishPlanPrice } from '../src/lib/billing/price-book';
import { ensurePlanCatalog } from '../src/lib/billing/plan-catalog';
import { checkAllowance, getEntitlements, hasCapability } from '../src/lib/billing/usage';
import { getSaasMetrics } from '../src/lib/platform/saas-metrics';
import { asUser } from './fixtures/request-context';
import { POST as checkout } from '../src/app/api/billing/checkout/route';
import { POST as billingWebhook } from '../src/app/api/billing/webhook/route';

const results: { name: string; ok: boolean }[] = [];
let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const stamp = Date.now();
const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY);
const createdWorkspaces: string[] = [];
const createdPrices: string[] = [];

async function makeWorkspace(suffix: string) {
  const created = await createCustomerWorkspace({
    companyName: `p0b-${suffix}-${stamp}`,
    ownerName: `Owner ${suffix}`,
    email: `owner-${suffix}-${stamp}@p0b.test`,
    password: 'contrasena-de-prueba-1234',
  });
  createdWorkspaces.push(created.workspace.id);
  return { workspaceId: created.workspace.id, userId: created.user.id };
}

const cli = { via: 'cli' as const, reason: 'smoke p0b' };

// =============================================================================
console.log('\n== 1-2. Registro nuevo: FREE, sin trial, no caduca ==');
const F = await makeWorkspace('free');
{
  const now = await resolveSubscription(F.workspaceId);
  check('1. Registro nuevo → FREE + billingSource FREE', now.state === 'FREE' && now.configuredPlan === PlanCode.FREE && now.billingSource === BillingSource.FREE, `${now.state} ${now.billingSource}`);
  check('   sin trial automatico ni vencimiento', now.periodEnd === null);
  const future = await resolveSubscription(F.workspaceId, prisma, at(3650));
  check('2. FREE no caduca (10 anos despues sigue FREE)', future.state === 'FREE' && future.hasAccess);

  const contacts = await checkAllowance({ workspaceId: F.workspaceId, metric: 'contacts' });
  check('   FREE: CRM basico, 300 contactos', contacts.allowed && contacts.limit === 300, `${contacts.limit}`);
  const users = await checkAllowance({ workspaceId: F.workspaceId, metric: 'users', amount: 0 });
  check('   FREE: 1 usuario', users.limit === 1);
  const ai = await checkAllowance({ workspaceId: F.workspaceId, metric: 'ai_cost_clp' });
  const conversations = await checkAllowance({ workspaceId: F.workspaceId, metric: 'conversations' });
  const emails = await checkAllowance({ workspaceId: F.workspaceId, metric: 'emails' });
  check('   FREE: IA, mensajes y email en cero', !ai.allowed && !conversations.allowed && !emails.allowed);
  const caps = await Promise.all(['AI_AGENTS', 'WHATSAPP', 'EMAIL', 'CAMPAIGNS', 'SHOPIFY', 'QUOTES'].map((cap) => hasCapability(F.workspaceId, cap as never)));
  check('   FREE: ninguna capacidad de coste variable', caps.every((value) => !value));
  check('   FREE: no consume en segundo plano', !(await canWorkspaceConsume(F.workspaceId)));
}

// =============================================================================
console.log('\n== 3-5. START / PRO MANUAL / SCALE COMP ==');
const S = await makeWorkspace('start');
const P = await makeWorkspace('pro');
const C = await makeWorkspace('comp');
{
  // START pagado (manual, un periodo vigente) → ACTIVE.
  const start = await activateManualSubscription({ workspaceId: S.workspaceId, planCode: PlanCode.START, ...cli });
  check('3. START ACTIVE', start.state === 'ACTIVE' && start.effectivePlan === PlanCode.START && start.canConsume);
  check('   precio del Price Book (CLP 19990)', start.price?.amountMinor === 19990 && start.price.currency === 'CLP');

  const pro = await activateManualSubscription({
    workspaceId: P.workspaceId,
    planCode: PlanCode.PRO,
    reference: 'TRANSF-001',
    notes: 'Pago por transferencia',
    ...cli,
  });
  const proPayment = await prisma.subscriptionPayment.findFirst({ where: { workspaceId: P.workspaceId } });
  check('4. PRO + MANUAL', pro.configuredPlan === PlanCode.PRO && pro.billingSource === BillingSource.MANUAL && pro.state === 'ACTIVE');
  check(
    '   el pago manual queda en SubscriptionPayment con importe, periodo y referencia',
    proPayment?.amountMinor === 49990 && proPayment.currency === 'CLP' && proPayment.reference === 'TRANSF-001' && proPayment.periodEnd > proPayment.periodStart,
  );
  check('   y no en Payment de commerce', (await prisma.payment.count({ where: { workspaceId: P.workspaceId } })) === 0);
  const proEnt = await getEntitlements(P.workspaceId);
  check('   PRO tiene sus capacidades (cotizador, email)', proEnt.plan.capabilities.includes('QUOTES') && proEnt.plan.capabilities.includes('EMAIL'));

  const comp = await assignCompSubscription({ workspaceId: C.workspaceId, planCode: PlanCode.SCALE, ...cli });
  const compFuture = await resolveSubscription(C.workspaceId, prisma, at(3650));
  check('5. SCALE + COMP sin fecha: ACTIVE y no vence', comp.state === 'ACTIVE' && compFuture.state === 'ACTIVE' && compFuture.effectivePlan === PlanCode.SCALE);
  check('   COMP no tiene renovacion ni precio', comp.renewsAt === null && comp.price === null);
  const audit = await prisma.auditLog.count({ where: { workspaceId: C.workspaceId, action: 'subscription.comp_assigned' } });
  const platformAudit = await crossTenantPrisma.platformAuditLog.count({ where: { targetWorkspaceId: C.workspaceId, action: 'subscription.comp_assigned' } });
  check('   auditado en AuditLog y PlatformAuditLog', audit === 1 && platformAudit === 1);

  // COMP con fecha vencida → FREE sin gracia.
  await assignCompSubscription({ workspaceId: C.workspaceId, planCode: PlanCode.SCALE, periodEnd: at(5), ...cli });
  const compEnded = await resolveSubscription(C.workspaceId, prisma, at(6));
  check('   COMP con fecha vencida → FREE efectivo inmediato, sin gracia', compEnded.state === 'EXPIRED' && compEnded.effectivePlan === PlanCode.FREE && compEnded.graceEndsAt === null);
}

// =============================================================================
console.log('\n== 6-7. TRIAL ==');
const T = await makeWorkspace('trial');
{
  const trial = await startTrial({ workspaceId: T.workspaceId, planCode: PlanCode.PRO, days: 14, ...cli });
  check('6. TRIAL vigente con capacidades de PRO', trial.state === 'TRIAL' && trial.effectivePlan === PlanCode.PRO && trial.canConsume);
  const expired = await resolveSubscription(T.workspaceId, prisma, at(15));
  check('7. TRIAL vencida → FREE efectivo, sin gracia', expired.state === 'EXPIRED' && expired.effectivePlan === PlanCode.FREE && expired.graceEndsAt === null);
  check('   conserva el plan configurado (PRO)', expired.configuredPlan === PlanCode.PRO);
}

// =============================================================================
console.log('\n== 8-9. Plan pagado vencido: GRACE y fin de gracia ==');
const G = await makeWorkspace('grace');
{
  await activateManualSubscription({ workspaceId: G.workspaceId, planCode: PlanCode.PRO, periodStart: at(-32), periodEnd: at(-2), paidAt: at(-32), ...cli });
  const grace = await resolveSubscription(G.workspaceId);
  check('8. Pagado vencido hace 2 dias → GRACE', grace.state === 'GRACE' && grace.effectivePlan === PlanCode.PRO && grace.canConsume, grace.state);
  check('   graceEndsAt = fin de periodo + 7 dias', grace.graceEndsAt !== null && Math.round((grace.graceEndsAt.getTime() - at(-2).getTime()) / DAY) === 7);
  const graceEnt = await getEntitlements(G.workspaceId);
  check('   en GRACE mantiene las capacidades del plan', graceEnt.plan.capabilities.includes('QUOTES'));

  const after = await resolveSubscription(G.workspaceId, prisma, at(6));
  check('9. Fin de la gracia → EXPIRED, FREE efectivo', after.state === 'EXPIRED' && after.effectivePlan === PlanCode.FREE && !after.canConsume);
  check('   configuredPlan sigue siendo PRO (no se sobrescribe)', after.configuredPlan === PlanCode.PRO);
  check('   sigue teniendo acceso (no se bloquea ni se borra nada)', after.hasAccess);

  // Mover el reloj real: periodo terminado hace 20 dias.
  await prisma.workspaceSubscription.update({ where: { workspaceId: G.workspaceId }, data: { currentPeriodEnd: at(-20) } });
  const expiredEnt = await getEntitlements(G.workspaceId);
  check('   un plan vencido usa los topes de FREE en el enforcement', expiredEnt.plan.allowances.contacts === 300 && expiredEnt.plan.capabilities.length === 0);
}

// =============================================================================
console.log('\n== 10. SUSPENDED ==');
{
  const suspended = await suspendSubscription({ workspaceId: P.workspaceId, ...cli, reason: 'Revision de cuenta' });
  check('10. SUSPENDED: sin acceso ni consumo', suspended.state === 'SUSPENDED' && !suspended.hasAccess && !suspended.canConsume);
  check('    y NO baja a FREE', suspended.effectivePlan === PlanCode.PRO && suspended.configuredPlan === PlanCode.PRO);
  const blocked = await checkAllowance({ workspaceId: P.workspaceId, metric: 'contacts' });
  check('    ni siquiera crea contactos', !blocked.allowed);
  const resumed = await resumeSubscription({ workspaceId: P.workspaceId, ...cli });
  check('    reanudar devuelve el estado anterior', resumed.state === 'ACTIVE');
}

// =============================================================================
console.log('\n== 11-12. Renovacion manual y cambio de plan ==');
{
  const before = await resolveSubscription(P.workspaceId);
  const renewed = await renewManualSubscription({ workspaceId: P.workspaceId, reference: 'TRANSF-002', ...cli });
  const payments = await prisma.subscriptionPayment.count({ where: { workspaceId: P.workspaceId } });
  check('11. Renovacion manual: el periodo continua desde el fin anterior', renewed.periodStart?.getTime() === before.periodEnd?.getTime() && renewed.periodEnd! > before.periodEnd!);
  check('    y queda un segundo pago en el libro SaaS', payments === 2);

  // Renovar dentro de la gracia tambien da continuidad (no se pierden dias).
  await renewManualSubscription({ workspaceId: G.workspaceId, paidAt: new Date(), ...cli });
  const lateRenew = await resolveSubscription(G.workspaceId);
  check('    renovar un plan ya vencido lo reactiva', lateRenew.state === 'ACTIVE' && lateRenew.effectivePlan === PlanCode.PRO);

  const changed = await assignPlan({ workspaceId: P.workspaceId, planCode: PlanCode.SCALE, ...cli });
  check('12. Cambio de plan PRO → SCALE conserva medio y periodo', changed.configuredPlan === PlanCode.SCALE && changed.billingSource === BillingSource.MANUAL && changed.periodEnd?.getTime() === renewed.periodEnd?.getTime());
  check('    y actualiza el precio acordado', changed.price?.amountMinor === 99990);
  const toFree = await assignPlan({ workspaceId: S.workspaceId, planCode: PlanCode.FREE, ...cli });
  check('    bajar a FREE deja medio FREE y sin vencimiento', toFree.state === 'FREE' && toFree.billingSource === BillingSource.FREE && toFree.periodEnd === null);
}

// =============================================================================
console.log('\n== Idempotencia de operaciones de billing SaaS ==');
const K = await makeWorkspace('idem');
{
  const key = `transfer-${stamp}`;
  const first = await activateManualSubscription({ workspaceId: K.workspaceId, planCode: PlanCode.PRO, reference: 'TRANSF-X', idempotencyKey: key, ...cli });
  const second = await activateManualSubscription({ workspaceId: K.workspaceId, planCode: PlanCode.PRO, reference: 'TRANSF-X', idempotencyKey: key, ...cli });
  const count = () => prisma.subscriptionPayment.count({ where: { workspaceId: K.workspaceId } });
  check('ID1. Doble click en "Registrar transferencia": una sola SubscriptionPayment', (await count()) === 1);
  check('     la segunda llamada se reconoce como repetida y no extiende nada', !first.alreadyProcessed && second.alreadyProcessed && second.periodEnd?.getTime() === first.periodEnd?.getTime());

  const renewKey = `renew-${stamp}`;
  const [r1, r2] = await Promise.all([
    renewManualSubscription({ workspaceId: K.workspaceId, idempotencyKey: renewKey, ...cli }),
    renewManualSubscription({ workspaceId: K.workspaceId, idempotencyKey: renewKey, ...cli }),
  ]);
  const afterRenew = await resolveSubscription(K.workspaceId);
  const expectedEnd = new Date(first.periodEnd!);
  expectedEnd.setUTCMonth(expectedEnd.getUTCMonth() + 1);
  check('ID2. Renovacion con doble click simultaneo: un solo pago', (await count()) === 2);
  check('     una sola renovacion (un mes, no dos)', afterRenew.periodEnd?.toISOString().slice(0, 10) === expectedEnd.toISOString().slice(0, 10), afterRenew.periodEnd?.toISOString());
  check('     exactamente una de las dos se marco como repetida', [r1.alreadyProcessed, r2.alreadyProcessed].filter(Boolean).length === 1);

  await renewManualSubscription({ workspaceId: K.workspaceId, reference: 'TRANSF-X', idempotencyKey: `renew-2-${stamp}`, ...cli });
  check('ID3. La referencia bancaria no es la garantia: misma referencia, otra operacion = otro pago', (await count()) === 3);

  let conflict = false;
  try {
    await activateManualSubscription({ workspaceId: F.workspaceId, planCode: PlanCode.PRO, idempotencyKey: key, ...cli });
  } catch (error) {
    conflict = error instanceof SubscriptionAdminError && error.code === 'IDEMPOTENCY_CONFLICT';
  }
  check('ID4. Una clave ya usada en otro workspace es un error, no un replay', conflict);
  check('     y no se registro nada en ese otro workspace', (await prisma.subscriptionPayment.count({ where: { workspaceId: F.workspaceId } })) === 0);

  const plans = await ensurePlanCatalog();
  const proPrice = await getCurrentPrice({ planCode: PlanCode.PRO, currency: 'CLP' });
  const mpInput = {
    workspaceId: K.workspaceId,
    plan: plans.PRO,
    price: { id: proPrice!.id, interval: proPrice!.interval },
    currency: 'CLP',
    amountMinor: 49990,
    externalPaymentId: `mp-idem-${stamp}`,
  };
  const mp1 = await recordSaasPayment(mpInput);
  const mp2 = await recordSaasPayment(mpInput);
  const mpPayment = await prisma.subscriptionPayment.findFirst({ where: { externalPaymentId: `mp-idem-${stamp}` } });
  check('ID5. recordSaasPayment repetido: un solo pago, con clave mp:<id>', !mp1.alreadyProcessed && mp2.alreadyProcessed && (await count()) === 4 && mpPayment?.idempotencyKey === `mp:mp-idem-${stamp}`);
}

// =============================================================================
console.log('\n== 13-14. Price Book ==');
{
  const clp = await getCurrentPrice({ planCode: PlanCode.START, currency: 'CLP' });
  check('13. Price Book CLP: START 19990 (unidades menores, exponente 0)', clp?.amountMinor === 19990 && formatMoney(clp.amountMinor, 'CLP') === '$19.990', clp ? formatMoney(clp.amountMinor, 'CLP') : '');
  const usd = await getCurrentPrice({ planCode: PlanCode.PRO, currency: 'USD' });
  check('14. Price Book USD: PRO 4900 = USD 49.00 (exponente 2)', usd?.amountMinor === 4900 && formatMoney(usd.amountMinor, 'USD') === '$49.00', usd ? formatMoney(usd.amountMinor, 'USD') : '');
  const scaleClp = await getCurrentPrice({ planCode: PlanCode.SCALE, currency: 'CLP' });
  const scaleUsd = await getCurrentPrice({ planCode: PlanCode.SCALE, currency: 'USD' });
  check('    sin conversion: cada moneda tiene su fila', scaleClp?.amountMinor === 99990 && scaleUsd?.amountMinor === 9900);

}

console.log('\n== Price Book: publicacion de versiones sin ambiguedad ==');
{
  // XTS es el codigo ISO 4217 reservado para pruebas: no toca precios reales.
  const key = { planCode: PlanCode.START, currency: 'XTS' };
  const track = <T extends { id: string }>(price: T) => (createdPrices.push(price.id), price);

  const v1 = track(await publishPlanPrice({ ...key, amountMinor: 1000, validFrom: at(-10) }));
  check('PB1. Precio inicial vigente', (await getCurrentPrice(key))?.id === v1.id);

  const v2 = track(await publishPlanPrice({ ...key, amountMinor: 1200 }));
  const v1Closed = await prisma.planPrice.findUniqueOrThrow({ where: { id: v1.id } });
  check('PB2. Nueva version rige desde ya', (await getCurrentPrice(key))?.id === v2.id);
  check('PB3. La anterior queda cerrada (validUntil = validFrom de la nueva)', v1Closed.validUntil?.getTime() === v2.validFrom.getTime());
  check('     y sigue siendo la valida en su periodo historico', (await getCurrentPrice({ ...key, now: at(-5) }))?.id === v1.id);

  const v3 = track(await publishPlanPrice({ ...key, amountMinor: 1500, validFrom: at(30) }));
  const v2Closed = await prisma.planPrice.findUniqueOrThrow({ where: { id: v2.id } });
  check('PB4. Fecha futura: no rige todavia', (await getCurrentPrice(key))?.id === v2.id);
  check('     rige desde su validFrom y cierra la vigente en esa fecha', (await getCurrentPrice({ ...key, now: at(31) }))?.id === v3.id && v2Closed.validUntil?.getTime() === v3.validFrom.getTime());

  const v4 = track(await publishPlanPrice({ ...key, amountMinor: 1400, validFrom: at(10) }));
  const v3Superseded = await prisma.planPrice.findUniqueOrThrow({ where: { id: v3.id } });
  check('     una version anterior a la programada la reemplaza (queda inactiva, como historial)', !v3Superseded.active && (await getCurrentPrice({ ...key, now: at(31) }))?.id === v4.id);

  const [c1, c2] = await Promise.all([
    publishPlanPrice({ ...key, amountMinor: 1600 }),
    publishPlanPrice({ ...key, amountMinor: 1700 }),
  ]);
  track(c1);
  track(c2);
  const current = await getCurrentPrice(key);
  check('PB5. Dos publicaciones simultaneas se serializan: rige una sola', current?.id === c1.id || current?.id === c2.id);
  const overlaps = await findOverlappingPrices();
  check('     nunca hay dos precios activos vigentes para el mismo momento', overlaps.length === 0, JSON.stringify(overlaps));
}

// =============================================================================
console.log('\n== Checkout SaaS (Mercado Pago, solo CLP) ==');
const M = await makeWorkspace('mp');
{
  process.env.MERCADO_PAGO_ACCESS_TOKEN = 'TEST-p0b-token';
  process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'p0b-webhook-secret';
  const originalFetch = globalThis.fetch;
  const owner = { id: M.userId, workspaceId: M.workspaceId };
  const request = (body: unknown) =>
    new Request('http://localhost/api/billing/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  const usd = await asUser(owner, () => checkout(request({ planCode: 'PRO', currency: 'USD' })));
  check('Checkout en USD → 400 (Mercado Pago Chile solo CLP)', usd.status === 400);
  const free = await asUser(owner, () => checkout(request({ planCode: 'FREE' })));
  check('Checkout de FREE → rechazado', free.status === 400);

  let sent: { items?: { unit_price: number; currency_id: string }[]; metadata?: Record<string, string> } = {};
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('api.mercadopago.com/checkout/preferences')) {
      sent = JSON.parse(String(init?.body ?? '{}'));
      return new Response(JSON.stringify({ id: `pref-p0b-${stamp}`, sandbox_init_point: 'https://sandbox.mercadopago.test/x' }), { status: 201 });
    }
    throw new Error(`fetch no simulado: ${url}`);
  }) as typeof fetch;
  try {
    const ok = await asUser(owner, () => checkout(request({ planCode: 'PRO' })));
    const proPrice = await getCurrentPrice({ planCode: PlanCode.PRO, currency: 'CLP' });
    check('Checkout PRO en CLP → URL de pago', ok.status === 200);
    check(
      'La preferencia declara kind, workspaceId, planCode y priceId',
      sent.metadata?.kind === 'saas_subscription' && sent.metadata.workspaceId === M.workspaceId && sent.metadata.planCode === 'PRO' && sent.metadata.priceId === proPrice?.id,
      JSON.stringify(sent.metadata),
    );
    check('El monto sale del Price Book (49990 CLP)', sent.items?.[0]?.unit_price === 49990 && sent.items[0].currency_id === 'CLP');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// =============================================================================
console.log('\n== 15-16. SaaS Billing vs Commerce ("5 Minutos con Dios") ==');
const D = await makeWorkspace('5mcd');
{
  const originalFetch = globalThis.fetch;
  function sign(dataId: string, requestId: string) {
    const ts = Math.floor(Date.now() / 1000);
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
    return `ts=${ts},v1=${createHmac('sha256', 'p0b-webhook-secret').update(manifest).digest('hex')}`;
  }
  async function deliver(dataId: string, body: Record<string, unknown>) {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes(`api.mercadopago.com/v1/payments/${dataId}`)) return new Response(JSON.stringify(body), { status: 200 });
      throw new Error(`fetch no simulado: ${url}`);
    }) as typeof fetch;
    const requestId = `req-${dataId}`;
    try {
      return await billingWebhook(
        new Request(`http://localhost:3001/api/billing/webhook?type=payment&data.id=${dataId}`, {
          method: 'POST',
          headers: { 'x-signature': sign(dataId, requestId), 'x-request-id': requestId, 'x-forwarded-for': '203.0.113.88' },
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
  const ledgers = async (workspaceId: string) => {
    const [subscription, saasPayments, payments, orders] = await Promise.all([
      prisma.workspaceSubscription.findUniqueOrThrow({ where: { workspaceId } }),
      prisma.subscriptionPayment.count({ where: { workspaceId } }),
      prisma.payment.count({ where: { workspaceId } }),
      prisma.customerOrder.count({ where: { workspaceId } }),
    ]);
    return {
      subscription: `${subscription.planId}|${subscription.billingSource}|${subscription.currentPeriodEnd?.toISOString() ?? '-'}|${subscription.mpPaymentId ?? '-'}`,
      saasPayments,
      payments,
      orders,
    };
  };

  // "5 Minutos con Dios": workspace interno, SCALE + COMP, que vende productos.
  await setWorkspaceInternal({ workspaceId: D.workspaceId, isInternal: true, ...cli, reason: 'Negocio propio' });
  await assignCompSubscription({ workspaceId: D.workspaceId, planCode: PlanCode.SCALE, ...cli, reason: 'Negocio propio' });
  const order = await prisma.customerOrder.create({ data: { workspaceId: D.workspaceId, status: 'PENDING_PAYMENT', total: 9990, subtotal: 9990 } });
  const beforeSale = await ledgers(D.workspaceId);
  const metricsBefore = await getSaasMetrics();
  const sale = await deliver(`sale-${stamp}`, {
    status: 'pending',
    transaction_amount: 9990,
    currency_id: 'CLP',
    external_reference: order.id,
    metadata: { kind: 'order', orderId: order.id },
  });
  const afterSale = await ledgers(D.workspaceId);
  const metricsAfter = await getSaasMetrics();
  check('15. Venta de 5MCD procesada como Commerce (crea Payment)', sale.status === 200 && afterSale.payments === beforeSale.payments + 1);
  check('    NO toca WorkspaceSubscription', afterSale.subscription === beforeSale.subscription);
  check('    NO crea SubscriptionPayment SaaS', afterSale.saasPayments === beforeSale.saasPayments);
  check('    NO cuenta como MRR SaaS', JSON.stringify(metricsAfter.mrrByCurrency) === JSON.stringify(metricsBefore.mrrByCurrency));
  check('    ni renueva Upzites Flow', (await resolveSubscription(D.workspaceId)).billingSource === BillingSource.COMP);

  // Pago SaaS del workspace normal M, con planCode + priceId.
  const pro = await getCurrentPrice({ planCode: PlanCode.PRO, currency: 'CLP' });
  const beforeSaas = await ledgers(M.workspaceId);
  const saasId = `saas-${stamp}`;
  const saasBody = {
    status: 'approved',
    transaction_amount: 49990,
    currency_id: 'CLP',
    external_reference: M.workspaceId,
    metadata: { kind: 'saas_subscription', workspace_id: M.workspaceId, plan_code: 'PRO', price_id: pro!.id },
  };
  const saas = await deliver(saasId, saasBody);
  const afterSaas = await ledgers(M.workspaceId);
  const resolvedM = await resolveSubscription(M.workspaceId);
  check('16. Pago SaaS activa PRO + MERCADO_PAGO', saas.status === 200 && resolvedM.state === 'ACTIVE' && resolvedM.configuredPlan === PlanCode.PRO && resolvedM.billingSource === BillingSource.MERCADO_PAGO);
  check('    crea SubscriptionPayment', afterSaas.saasPayments === beforeSaas.saasPayments + 1);
  check('    NO crea Payment ni CustomerOrder de commerce', afterSaas.payments === beforeSaas.payments && afterSaas.orders === beforeSaas.orders);
  const retry = await deliver(saasId, saasBody);
  const afterRetry = await ledgers(M.workspaceId);
  check('    un reintento del webhook es idempotente', retry.status === 200 && afterRetry.saasPayments === afterSaas.saasPayments && afterRetry.subscription === afterSaas.subscription);

  // Checkout historico: el checkout se emitio con el precio A; despues se
  // publica B; el webhook del checkout viejo se valida contra A.
  const H = await makeWorkspace('historic');
  const priceA = pro!;
  const priceB = await publishPlanPrice({ planCode: PlanCode.PRO, currency: 'CLP', amountMinor: 54990 });
  try {
    const nowPrice = await getCurrentPrice({ planCode: PlanCode.PRO, currency: 'CLP' });
    check('    (se publico un precio nuevo B para PRO)', nowPrice?.id === priceB.id);
    const oldBody = {
      status: 'approved',
      transaction_amount: 49990,
      currency_id: 'CLP',
      external_reference: H.workspaceId,
      metadata: { kind: 'saas_subscription', workspace_id: H.workspaceId, plan_code: 'PRO', price_id: priceA.id },
    };
    const wrongForA = await deliver(`hist-wrong-${stamp}`, { ...oldBody, transaction_amount: 54990 });
    check('    checkout con A pagado al monto de B → rechazado (se valida contra A)', wrongForA.status === 400);
    const historic = await deliver(`hist-${stamp}`, oldBody);
    const resolvedH = await resolveSubscription(H.workspaceId);
    check(
      'CH. Webhook de un checkout emitido con A, tras publicar B: se valida contra A y se acepta',
      historic.status === 200 && resolvedH.configuredPlan === PlanCode.PRO && resolvedH.price?.amountMinor === 49990,
      `${historic.status} ${resolvedH.price?.amountMinor}`,
    );
    const paymentH = await prisma.subscriptionPayment.findFirst({ where: { workspaceId: H.workspaceId } });
    check('    el pago queda con el precio A (fila cerrada, pero historica y valida)', paymentH?.priceId === priceA.id && paymentH.amountMinor === 49990);
  } finally {
    // Restaurar el Price Book real: quitar B y reabrir A.
    await prisma.subscriptionPayment.updateMany({ where: { priceId: priceB.id }, data: { priceId: null } });
    await prisma.workspaceSubscription.updateMany({ where: { priceId: priceB.id }, data: { priceId: null } });
    await prisma.planPrice.delete({ where: { id: priceB.id } });
    await prisma.platformAuditLog.deleteMany({ where: { action: 'price_book.published', metadata: { path: ['priceId'], equals: priceB.id } } });
    await prisma.planPrice.update({ where: { id: priceA.id }, data: { validUntil: null, active: true } });
  }

  const tampered = await deliver(`tamper-${stamp}`, { ...saasBody, transaction_amount: 100 });
  check('    monto distinto al del Price Book → rechazado sin cambios', tampered.status === 400 && JSON.stringify(await ledgers(M.workspaceId)) === JSON.stringify(afterRetry));
  const usdPaid = await deliver(`usd-${stamp}`, { ...saasBody, currency_id: 'USD' });
  check('    moneda distinta a la del precio → rechazado', usdPaid.status === 400);

  delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
  delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
}

// =============================================================================
console.log('\n== 17-18. Metricas SaaS comerciales ==');
{
  const m1 = await makeWorkspace('m-pro-manual');
  const m2 = await makeWorkspace('m-pro-mp');
  const m3 = await makeWorkspace('m-pro-comp');
  const m4 = await makeWorkspace('m-trial');
  const m5 = await makeWorkspace('m-free');
  const m6 = await makeWorkspace('m-int-comp');
  const m7 = await makeWorkspace('m-int-paid');
  const before = await getSaasMetrics();

  await activateManualSubscription({ workspaceId: m1.workspaceId, planCode: PlanCode.PRO, ...cli });
  const plans = await ensurePlanCatalog();
  const proPrice = await getCurrentPrice({ planCode: PlanCode.PRO, currency: 'CLP' });
  await recordSaasPayment({
    workspaceId: m2.workspaceId,
    plan: plans.PRO,
    price: { id: proPrice!.id, interval: proPrice!.interval },
    currency: 'CLP',
    amountMinor: 49990,
    externalPaymentId: `mp-metrics-${stamp}`,
  });
  await assignCompSubscription({ workspaceId: m3.workspaceId, planCode: PlanCode.PRO, ...cli });
  await startTrial({ workspaceId: m4.workspaceId, planCode: PlanCode.PRO, days: 14, ...cli });
  // m5 queda FREE (registro).
  await setWorkspaceInternal({ workspaceId: m6.workspaceId, isInternal: true, ...cli });
  await assignCompSubscription({ workspaceId: m6.workspaceId, planCode: PlanCode.SCALE, ...cli });
  await setWorkspaceInternal({ workspaceId: m7.workspaceId, isInternal: true, ...cli });
  await activateManualSubscription({ workspaceId: m7.workspaceId, planCode: PlanCode.SCALE, ...cli });

  const after = await getSaasMetrics();
  const paying = new Set(after.payingWorkspaceIds);
  check('18. PRO + MANUAL (normal) cuenta como cliente y MRR', paying.has(m1.workspaceId));
  check('    PRO + MERCADO_PAGO (normal) cuenta como cliente y MRR', paying.has(m2.workspaceId));
  check('17. PRO + COMP no es MRR', !paying.has(m3.workspaceId));
  check('    TRIAL no es MRR', !paying.has(m4.workspaceId));
  check('    FREE no es MRR', !paying.has(m5.workspaceId));
  check('    interno SCALE + COMP excluido', !paying.has(m6.workspaceId));
  check('    interno con billing pagado por error: excluido igual', !paying.has(m7.workspaceId));
  check('    ni 5 Minutos con Dios (interno)', !paying.has(D.workspaceId));
  check(
    '    MRR CLP sube exactamente lo de los dos normales pagados (2 x 49.990)',
    (after.mrrByCurrency.CLP ?? 0) - (before.mrrByCurrency.CLP ?? 0) === 2 * 49990,
    `${before.mrrByCurrency.CLP ?? 0} → ${after.mrrByCurrency.CLP ?? 0}`,
  );
  check('    los internos suman solo a internalWorkspaces', after.internalWorkspaces - before.internalWorkspaces === 2);
  check('    COMP y TRIAL comerciales se cuentan aparte', after.comp - before.comp === 1 && after.trials - before.trials === 1);
}

// =============================================================================
await crossTenantPrisma.platformAuditLog.deleteMany({ where: { targetWorkspaceId: { in: createdWorkspaces } } });
for (const id of createdPrices) {
  await crossTenantPrisma.platformAuditLog.deleteMany({ where: { action: 'price_book.published', metadata: { path: ['priceId'], equals: id } } });
}
await crossTenantPrisma.planPrice.deleteMany({ where: { id: { in: createdPrices } } });
const cleaned = await crossTenantPrisma.workspace.deleteMany({ where: { id: { in: createdWorkspaces } } });
console.log(`\nLimpieza: ${cleaned.count} workspaces de prueba eliminados (cascade).`);

const passed = results.filter((result) => result.ok).length;
console.log(`\n== Resultado: ${passed}/${results.length} pruebas OK ==`);
await prisma.$disconnect();
if (failures > 0) process.exit(1);
