/**
 * Ensayo P34 (crm_pruebas): primer funnel Meta Ads → venta, sobre el negocio del P33.
 *
 * CONFIGURACIÓN por los handlers reales de la UI, como OWNER:
 *   regla de campaña (anuncio → producto + IA) y flujo "Postventa" (Compra aprobada) publicado.
 * LEAD: clic en el anuncio (WhatsApp entrante con referral CTWA) → IA responde la objeción
 *   → oferta → checkout con bump → pago → entrega → postventa; todo atribuido al anuncio
 *   (conversación, pedido, first touch, métricas de la regla, embudo y recorrido).
 * Shortcuts: el referral lo trae el payload simulado (CTWA real = Meta) y el pago es el
 *   checkout demo por la ruta del webhook (Mercado Pago TEST = P27).
 *
 * Uso (desde apps/crm, después del P33): NODE_OPTIONS="--require ./scripts/visual/preload.cjs" node node_modules/tsx/dist/cli.mjs scripts/visual/p34-ads-funnel-hito.ts
 */
import './als-global';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { ScriptedProvider } from '../../src/lib/agents/provider';
import { runAgent } from '../../src/lib/agents/runner';
import { loadFunnel, loadSaleTrail } from '../../src/lib/analytics/funnel';
import { orderDeliveryView } from '../../src/lib/commerce/delivery-admin';
import { loadPublicCheckout, startPublicCheckoutPayment } from '../../src/lib/commerce/public-checkout';
import { publicCheckoutUrl } from '../../src/lib/commerce/public-checkout-link';
import { runJobs } from '../../src/lib/jobs/runner';
import { prisma } from '../../src/lib/prisma';
import { campaignRouteMetrics } from '../../src/lib/whatsapp/campaign-routes';
import { ingestWebhookEvent, processWebhookEvent } from '../../src/lib/whatsapp/inbound';
import { asUser } from '../fixtures/request-context';
import { inboundTextPayload } from '../fixtures/whatsapp';
import { POST as routesRoute } from '../../src/app/api/integrations/whatsapp/campaign-routes/route';
import { POST as flowsRoute } from '../../src/app/api/automation-flows/route';
import { POST as demoPayRoute } from '../../src/app/api/demo-checkout/[id]/route';

const ok = (label: string) => console.log(`✓ ${label}`);
const req = (path: string, body?: unknown) => new NextRequest(`http://localhost:3101${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const p1 = (id: string) => ({ params: Promise.resolve({ id }) });
async function call(label: string, run: () => Promise<Response>) {
  const response = await run();
  const body = (await response.json().catch(() => ({}))) as { data?: Record<string, unknown> };
  assert.ok([200, 201].includes(response.status), `${label}: HTTP ${response.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body.data ?? {};
}

// --- 0. Negocio del P33 -------------------------------------------------------------------
const channel = await prisma.whatsAppChannel.findUnique({ where: { phoneNumberId: 'qa-p33-5mcd' } });
if (!channel) throw new Error('Corre antes scripts/visual/p33-5mcd-hito.ts.');
const ws = channel.workspaceId;
const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'superadmin-p32@visual.test' }, select: { id: true } });
const owner = { id: admin.id, workspaceId: ws };
const main = await prisma.product.findFirstOrThrow({ where: { workspaceId: ws, name: '30 experiencias guiadas', status: 'ACTIVE' } });
const agent = await prisma.agentDefinition.findFirstOrThrow({ where: { workspaceId: ws, key: 'SALES' } });

// --- 1. Configuración por la UI -----------------------------------------------------------
const adId = '120234000000005034'; // id de anuncio con formato Meta (solo números)
let route = await prisma.campaignRoute.findFirst({ where: { workspaceId: ws, level: 'AD', externalId: adId } });
if (!route) {
  const created = await call('regla de campaña', () => asUser(owner, () => routesRoute(req('/api/integrations/whatsapp/campaign-routes', { name: 'Meta Ads · 30 experiencias', level: 'AD', externalId: adId, productId: main.id, agentId: agent.id, flowId: null, isActive: true }))));
  route = await prisma.campaignRoute.findFirstOrThrow({ where: { id: String(created.id), workspaceId: ws } });
}
ok(`regla de campaña "${route.name}" (anuncio ${adId} → producto + IA de ventas)`);

let postsale = await prisma.automationFlow.findFirst({ where: { workspaceId: ws, name: 'Postventa 5MCD', status: 'PUBLISHED' } });
if (!postsale) {
  const created = await call('flujo postventa', () => asUser(owner, () => flowsRoute(req('/api/automation-flows', {
    name: 'Postventa 5MCD', channel: 'WHATSAPP', templateId: 'post-sale', publish: true,
    quick: { kind: 'postsale', accountId: channel.id, text: '¡Gracias por tu compra! Ya tienes tus 30 experiencias. ¿Pudiste abrirlas?', followup: '¿Cómo te fue con la primera experiencia?', delayMinutes: 120 },
  }))));
  assert.equal(created.published, true, `postventa publicada: ${String(created.publishError)}`);
  postsale = await prisma.automationFlow.findFirstOrThrow({ where: { id: String(created.id), workspaceId: ws } });
}
ok('flujo "Postventa 5MCD" publicado (Compra aprobada)');

// --- 2. Lead desde el anuncio -------------------------------------------------------------
const funnelBefore = await loadFunnel(ws, { days: 1, currency: 'CLP' });
const salesBefore = (await campaignRouteMetrics(ws))[route.id]?.sales ?? 0;
const stamp = Date.now().toString(36);
const from = `5698${String(Date.now()).slice(-7)}`;
async function inbound(text: string, n: number, referral?: Record<string, string>) {
  const payload = inboundTextPayload({ phoneNumberId: channel!.phoneNumberId, from, messageId: `wamid.qa-p34-${stamp}-${n}`, text, profileName: `Lead Ads ${stamp}` });
  if (referral) (payload as any).entry[0].changes[0].value.messages[0].referral = referral;
  await processWebhookEvent((await ingestWebhookEvent(JSON.stringify(payload), payload)).eventId);
}
// shortcut: así llega el referral CTWA en el webhook de Meta; el clic real necesita una campaña activa.
await inbound('Hola, vi su anuncio. ¿Qué es? Se ve caro.', 1, { source_type: 'ad', source_id: adId, source_url: 'https://fb.me/qa-p34', headline: '5 minutos al día con Dios', ctwa_clid: `qa-p34-${stamp}` });
const conversation = await prisma.conversation.findFirstOrThrow({ where: { workspaceId: ws, channelId: channel.id, contact: { phone: `+${from}` } }, include: { contact: { select: { id: true, firstTouch: true } } } });
assert.equal(conversation.campaignRouteId, route.id, 'la conversación queda en la regla del anuncio');
assert.equal((conversation.attribution as { adId?: string } | null)?.adId, adId);
assert.equal((conversation.contact?.firstTouch as { adId?: string } | null)?.adId, adId, 'first touch = el anuncio');
assert.equal(conversation.productId, main.id);
ok('lead del anuncio: conversación y contacto atribuidos (regla + first touch)');

await new Promise((resolve) => setTimeout(resolve, 3_500)); // debounce del agente (agents/dispatch)
for (let i = 0; i < 3; i += 1) await runJobs({ limit: 50, withRecurring: false, workspaceId: ws });
const aiReply = await prisma.message.findFirst({ where: { workspaceId: ws, conversationId: conversation.id, direction: 'OUTBOUND', senderType: 'AI' }, orderBy: { createdAt: 'desc' } });
assert.match(aiReply?.text ?? '', /menos de 200 pesos/, `la IA responde la objeción: ${aiReply?.text}`);
assert.equal((await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id }, select: { currentAgentId: true } })).currentAgentId, agent.id, 'la conversación registra qué agente la atendió');
ok('IA → objeción respondida con el cerebro de ventas');

// Oferta → el lead confirma → link de checkout (mismo atajo que el P33: herramienta guionada)
await prisma.message.create({ data: { workspaceId: ws, conversationId: conversation.id, direction: 'OUTBOUND', senderType: 'AI', status: 'SENT', text: 'Las 30 experiencias cuestan $5.990. ¿Confirmas la compra?' } });
await inbound('confirmo', 2);
await prisma.conversation.updateMany({ where: { id: conversation.id, workspaceId: ws }, data: { mode: 'AI_ACTIVE' } });
const checkout = await runAgent({ workspaceId: ws, conversationId: conversation.id, provider: new ScriptedProvider([{ toolCalls: [{ id: 'checkout', name: 'createCheckoutLink', arguments: {} }] }, { text: 'Aquí tienes tu enlace.' }]), dryRun: true, allowSimulatorCheckout: true });
assert.equal(checkout.toolCalls?.find((c) => c.name === 'createCheckoutLink')?.ok, true, JSON.stringify(checkout.toolCalls));
const order = await prisma.customerOrder.findFirstOrThrow({ where: { workspaceId: ws, conversationId: conversation.id }, orderBy: { createdAt: 'desc' } });
ok('oferta → checkout creado desde la conversación');

const token = new URL(publicCheckoutUrl(order.id)).searchParams.get('t')!;
assert.ok(JSON.stringify(await loadPublicCheckout(order.id, token)).includes('7 audios'), 'el checkout muestra el bump');
const start = await startPublicCheckoutPayment(order.id, token, true);
assert.ok(start.ok, JSON.stringify(start));
const paid = await call('pagar', () => asUser(owner, () => demoPayRoute(req(`/api/demo-checkout/${order.id}`), p1(order.id)))) as { handled?: boolean };
assert.equal(paid.handled, true);
for (let i = 0; i < 2; i += 1) await runJobs({ limit: 50, withRecurring: false, workspaceId: ws });
ok('checkout con bump → pago (simulado, ruta del webhook)');

// --- 3. Verificación de punta a punta ------------------------------------------------------
const final = await prisma.customerOrder.findFirstOrThrow({ where: { id: order.id, workspaceId: ws }, include: { deliveries: true } });
assert.equal(final.status, 'FULFILLED');
assert.equal(final.total, 5990 + 2990);
assert.equal(final.campaignRouteId, route.id, 'el pedido queda en la regla del anuncio');
assert.equal((final.attribution as { adId?: string } | null)?.adId, adId, 'el pedido guarda el anuncio');
const deliveryView = JSON.stringify(await orderDeliveryView(ws, order.id));
assert.ok(deliveryView.includes('30 experiencias guiadas (PDF)') && deliveryView.includes('Audio 1 de 7'), 'entrega con producto + bump');
ok(`delivery ${final.deliveries.at(-1)?.status}: PDF + audios`);

const run = await prisma.automationFlowRun.findFirst({ where: { flowId: postsale.id, contactId: conversation.contactId }, orderBy: { startedAt: 'desc' } });
assert.ok(run, 'la compra aprobada arranca la postventa');
const thanks = await prisma.message.findFirst({ where: { workspaceId: ws, conversationId: conversation.id, direction: 'OUTBOUND', text: { contains: 'Gracias por tu compra' } } });
assert.ok(thanks, 'la postventa manda el agradecimiento');
ok(`follow-up: postventa ${run.status}, agradecimiento enviado`);

const metrics = (await campaignRouteMetrics(ws))[route.id];
assert.equal(metrics.sales, salesBefore + 1, 'la venta suma a la regla del anuncio');
const funnelAfter = await loadFunnel(ws, { days: 1, currency: 'CLP' });
const trail = await loadSaleTrail(ws, order.id);
assert.ok(JSON.stringify(trail).includes(route.name), 'el recorrido de la venta nombra la campaña');
const campaignRow = (f: typeof funnelAfter) => (f.byCampaign as { label: string; sales: number }[]).find((c) => c.label.includes(route!.name))?.sales ?? 0;
assert.equal(campaignRow(funnelAfter), campaignRow(funnelBefore) + 1, 'el embudo atribuye la venta a la campaña');
assert.ok((funnelAfter.byAgent as { label: string }[]).some((a) => a.label === agent.name), 'el embudo atribuye la venta al agente de IA');
assert.ok(JSON.stringify(trail).includes(`agente ${agent.name}`), 'el recorrido nombra al agente');
console.log(JSON.stringify({ workspace: ws, ad: adId, route: route.name, order: order.id, total: final.total, postsale: run.status, ruleMetrics: metrics, funnelCampaignSales: campaignRow(funnelAfter) }, null, 2));
ok('métricas de la regla, embudo (/analitica) y recorrido (/pedidos/[id]) con la campaña');
console.log('ENSAYO P34 LOCAL OK (referral CTWA simulado; campaña real = Meta Ads; pago real = P27)');
await prisma.$disconnect();
