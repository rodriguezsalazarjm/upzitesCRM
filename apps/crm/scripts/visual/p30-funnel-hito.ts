/**
 * Hito P30 (crm_pruebas): una venta de prueba se recorre desde la fuente/campaña
 * hasta el pago y aparece en el embudo y en los ingresos del workspace.
 *  - anuncio → regla de campaña → contacto con first touch → conversación (WhatsApp, agente)
 *  - createOrder real desde la conversación (copia regla + referral)
 *  - bump aceptado (productos propios "QA P30 Producto"/"QA P30 Bump") y compra tras un seguimiento (si hay uno)
 *  - pago por processOrderPayment (la ruta del webhook) marcado SIMULADO: el pago real es P27
 * Verifica las diferencias del embudo (antes/después) y el recorrido paso a paso.
 * Deja la venta "QA P30" en Visual Flow A para la QA en /analitica y /pedidos/[id].
 *
 * Uso (desde apps/crm): NODE_OPTIONS="--require ./scripts/visual/preload.cjs" node node_modules/tsx/dist/cli.mjs scripts/visual/p30-funnel-hito.ts
 */
import assert from 'node:assert/strict';
import { loadFunnel, loadSaleTrail } from '../../src/lib/analytics/funnel';
import { createOrder } from '../../src/lib/commerce/orders';
import { processOrderPayment } from '../../src/lib/commerce/payment-webhook';
import { assignCompSubscription } from '../../src/lib/billing/subscription-admin';
import { prisma } from '../../src/lib/prisma';

const workspace = await prisma.workspace.findFirstOrThrow({ where: { name: { startsWith: 'Visual Flow A' } }, select: { id: true } });
const ws = workspace.id;
const currency = (await prisma.workspaceProfile.findUnique({ where: { workspaceId: ws }, select: { currency: true } }))?.currency ?? 'CLP';
// Productos propios del hito (idempotente): no se toca el producto de P27, cuyo verificador busca su último pedido pagado.
async function qaVariant(name: string, priceMinor: number) {
  const existing = await prisma.productVariant.findFirst({ where: { isActive: true, product: { workspaceId: ws, name } }, select: { id: true, productId: true } });
  if (existing) return existing;
  const product = await prisma.product.create({ data: { workspaceId: ws, name, status: 'ACTIVE', currency, variants: { create: { name: 'Única', priceMinor, isDefault: true } } }, include: { variants: true } });
  return { id: product.variants[0].id, productId: product.id };
}
const variant = await qaVariant('QA P30 Producto', 15000);
const bumpVariant = await qaVariant('QA P30 Bump', 1000);
const whatsapp = await prisma.whatsAppChannel.findFirst({ where: { workspaceId: ws }, select: { id: true } });
const agent = await prisma.agentDefinition.findFirst({ where: { workspaceId: ws }, select: { id: true, name: true } });
const journey = await prisma.journey.findFirst({ where: { workspaceId: ws, trigger: 'CHECKOUT_ABANDONED' }, select: { id: true, name: true } });

// Pedidos exige PRO: COMP PRO solo durante el hito y se restaura la suscripción exacta al final.
const { id: _subId, workspaceId: _subWs, ...savedSubscription } = await prisma.workspaceSubscription.findUniqueOrThrow({ where: { workspaceId: ws } });
await assignCompSubscription({ workspaceId: ws, planCode: 'PRO', via: 'cli', reason: 'QA P30 funnel (temporal)' });
try {
const before = await loadFunnel(ws, { days: 1, currency });
const stamp = Date.now().toString(36);
const adId = `qa-p30-ad-${stamp}`;

const route = await prisma.campaignRoute.create({ data: { workspaceId: ws, name: `QA P30 anuncio ${stamp}`, level: 'AD', externalId: adId, productId: variant.productId, agentId: agent?.id ?? null } });
const attribution = { adId, sourceType: 'ad', headline: 'QA P30', ctwaClid: `clid-${stamp}` };
const contact = await prisma.contact.create({
  data: { workspaceId: ws, firstName: 'QA P30', lastName: `Lead ${stamp}`, source: 'WhatsApp', firstTouch: { ...attribution, channel: 'whatsapp', receivedAt: new Date().toISOString() } },
});
const conversation = await prisma.conversation.create({
  data: { workspaceId: ws, channelType: 'WHATSAPP', channelId: whatsapp?.id ?? null, contactId: contact.id, productId: variant.productId, campaignRouteId: route.id, attribution, currentAgentId: agent?.id ?? null },
});
const order = await createOrder({ workspaceId: ws, contactId: contact.id, conversationId: conversation.id, items: [{ variantId: variant.id, quantity: 1 }] });
await prisma.customerOrder.updateMany({ where: { id: order.id, workspaceId: ws }, data: { status: 'PENDING_PAYMENT' } });

let bumpPrice = 0;
{
  const offer = await prisma.productOffer.create({ data: { workspaceId: ws, productId: variant.productId, kind: 'ORDER_BUMP', offerVariantId: bumpVariant.id, headline: `QA P30 bump ${stamp}`, priceMinor: 1000, isActive: false } });
  // shortcut: el bump se registra aceptado directo (la UI de checkout ya se probó en P6); aquí se mide.
  await prisma.orderOffer.create({ data: { workspaceId: ws, orderId: order.id, offerId: offer.id, kind: 'ORDER_BUMP', offerVariantId: bumpVariant.id, priceMinor: 1000, status: 'ACCEPTED', decidedAt: new Date() } });
  bumpPrice = 1000;
}

const payment = await processOrderPayment({
  orderId: order.id, workspaceId: ws, externalPaymentId: `qa-p30:${order.id}`, status: 'APPROVED', rawStatus: 'approved',
  amount: order.total, currency: order.currency, baseUrl: 'http://localhost:3101', simulated: true,
});
assert.ok(payment.handled, `el pago no se aplicó: ${payment.reason}`);

if (journey) {
  await prisma.journeyEnrollment.create({
    data: { workspaceId: ws, journeyId: journey.id, contactId: contact.id, cancelKey: `qa-p30-${stamp}`, status: 'EXITED', exitedAt: new Date(), exitReason: 'PURCHASED', messagesSent: 1, orderId: order.id, purchaseOrderId: order.id, conversationId: conversation.id },
  });
}

const after = await loadFunnel(ws, { days: 1, currency });
const delta = (key: keyof typeof after.counts) => after.counts[key] - before.counts[key];
assert.equal(delta('adConversations'), 1, 'conversación desde anuncio');
assert.equal(delta('leads'), 1);
assert.equal(delta('conversations'), 1);
assert.equal(delta('conversationsWithCheckout'), 1);
assert.equal(delta('checkouts'), 1);
assert.equal(delta('sales'), 1);
assert.equal(delta('revenue'), order.total, 'el ingreso entra completo en la moneda del negocio');
assert.deepEqual([delta('bumpShown'), delta('bumpAccepted'), delta('bumpRevenue')], [1, 1, bumpPrice]);
if (journey) assert.deepEqual([delta('recoveredSales'), delta('recoveryRevenue')], [1, order.total]);
assert.ok(after.byCampaign.some((r) => r.key === route.id && r.sales === 1 && r.revenue === order.total), 'aparece en su campaña');
assert.ok(after.byChannel.some((r) => r.key === 'WHATSAPP'), 'aparece en WhatsApp');
if (agent) assert.ok(after.byAgent.some((r) => r.key === agent.id), 'aparece en su agente');
assert.equal(after.recentSales[0], order.id, 'es la venta más reciente');

const trail = await loadSaleTrail(ws, order.id);
assert.ok(trail);
const step = (key: string) => trail.steps.find((s) => s.key === key)!;
assert.match(step('source').detail, new RegExp(`QA P30 anuncio ${stamp}`));
assert.ok(['source', 'lead', 'conversation', 'checkout', 'payment'].every((k) => step(k).done), 'fuente → pago completo');
assert.match(step('payment').detail, /aprobado \(simulado\)/);
if (agent) assert.match(step('conversation').detail, new RegExp(`agente ${agent.name}`));
assert.ok(step('bump').done);
if (journey) assert.ok(step('recovery').done);

console.log(JSON.stringify({
  order: order.id, total: order.total, currency,
  delta: Object.fromEntries(Object.keys(after.counts).map((k) => [k, delta(k as keyof typeof after.counts)])),
  rates: after.rates,
  trail: trail.steps.map((s) => `${s.done ? '✓' : '·'} ${s.label}: ${s.detail}`),
  coverage: { bump: true, recovery: Boolean(journey), agent: agent?.name ?? null, whatsappChannel: Boolean(whatsapp) },
}, null, 2));
console.log('HITO P30 LOCAL OK (pago simulado por la ruta del webhook; el pago real es P27)');
} finally {
  await prisma.workspaceSubscription.update({ where: { workspaceId: ws }, data: savedSubscription });
}
await prisma.$disconnect();
