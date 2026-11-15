/**
 * Hito local del Punto 10 (solo crm_pruebas, sin Meta ni Mercado Pago): toma la
 * ultima conversacion atribuida por p9-campaign-hito.ts, crea el pedido con la
 * funcion real (createOrder), lo marca pagado y verifica conversacion → pedido
 * → metricas de la regla y el first touch del contacto. El pago real es P27.
 * Uso: NODE_OPTIONS="--require ./scripts/visual/preload.cjs" node node_modules/tsx/dist/cli.mjs scripts/visual/p10-attribution-hito.ts
 */
import assert from 'node:assert/strict';
import { createOrder } from '../../src/lib/commerce/orders';
import { campaignRouteMetrics } from '../../src/lib/whatsapp/campaign-routes';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../src/lib/prisma';

const conversation = await prisma.conversation.findFirst({
  where: { campaignRouteId: { not: null }, campaignRoute: { name: { startsWith: 'QA P9' } }, contact: { firstTouch: { not: Prisma.DbNull } } },
  orderBy: { createdAt: 'desc' },
  select: { id: true, workspaceId: true, contactId: true, campaignRouteId: true, productId: true },
});
if (!conversation?.productId) throw new Error('Corre antes scripts/visual/p9-campaign-hito.ts.');
const ws = conversation.workspaceId;
const variant = await prisma.productVariant.findFirstOrThrow({ where: { productId: conversation.productId, isActive: true }, select: { id: true } });

const before = (await campaignRouteMetrics(ws))[conversation.campaignRouteId!]?.sales ?? 0;
const order = await createOrder({ workspaceId: ws, contactId: conversation.contactId, conversationId: conversation.id, items: [{ variantId: variant.id, quantity: 1 }] });
// shortcut: el pago se marca directo en la base de pruebas; el round trip real de MP es el P27.
await prisma.customerOrder.updateMany({ where: { id: order.id, workspaceId: ws }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });

const saved = await prisma.customerOrder.findFirstOrThrow({ where: { id: order.id, workspaceId: ws }, select: { campaignRouteId: true, attribution: true, conversationId: true, total: true } });
const contact = await prisma.contact.findFirstOrThrow({ where: { id: conversation.contactId, workspaceId: ws }, select: { firstTouch: true } });
const after = (await campaignRouteMetrics(ws))[conversation.campaignRouteId!];
console.log(JSON.stringify({ order: order.id, saved, firstTouch: contact.firstTouch, metrics: after }, null, 2));

assert.equal(saved.campaignRouteId, conversation.campaignRouteId);
assert.equal(saved.conversationId, conversation.id);
assert.ok((saved.attribution as { adId?: string } | null)?.adId);
assert.ok((contact.firstTouch as { adId?: string } | null)?.adId);
assert.equal(after.sales, before + 1);
console.log('HITO P10 local OK (pago simulado; falta CTWA real + MP TEST)');
await prisma.$disconnect();
