/**
 * Hito local del Punto 9 (solo crm_pruebas, sin Meta): dos anuncios distintos
 * llegan al MISMO numero por el pipeline real del webhook y cada conversacion
 * carga su producto/agente; un mensaje sin referral cae al numero.
 * Uso: NODE_OPTIONS="--require ./scripts/visual/preload.cjs" node node_modules/tsx/dist/cli.mjs scripts/visual/p9-campaign-hito.ts
 */
import assert from 'node:assert/strict';
import { ingestWebhookEvent, processWebhookEvent } from '../../src/lib/whatsapp/inbound';
import { loadChannelContext } from '../../src/lib/whatsapp/channel-runtime';
import { prisma } from '../../src/lib/prisma';
import { inboundTextPayload } from '../fixtures/whatsapp';

const channel = await prisma.whatsAppChannel.findFirst({ where: { status: 'CONNECTED' }, select: { id: true, workspaceId: true, phoneNumberId: true, defaultProductId: true } });
if (!channel) throw new Error('No hay un numero CONNECTED en crm_pruebas.');
const ws = channel.workspaceId;
const products = await prisma.product.findMany({ where: { workspaceId: ws, status: 'ACTIVE' }, take: 2, select: { id: true, name: true } });
const agents = await prisma.agentDefinition.findMany({ where: { workspaceId: ws, isActive: true, planLimitedAt: null, versions: { some: { status: 'PUBLISHED' } } }, take: 2, select: { id: true, name: true } });
if (products.length < 2) throw new Error('Se necesitan 2 productos activos en el workspace del numero.');

const ads = ['120200000000000001', '120200000000000002'];
for (const [i, adId] of ads.entries()) {
  await prisma.campaignRoute.upsert({
    where: { workspaceId_level_externalId: { workspaceId: ws, level: 'AD', externalId: adId } },
    create: { workspaceId: ws, name: `QA P9 anuncio ${i + 1}`, level: 'AD', externalId: adId, productId: products[i].id, agentId: agents[i]?.id ?? null },
    update: { productId: products[i].id, agentId: agents[i]?.id ?? null, isActive: true },
  });
}

async function arrive(tag: string, referral?: Record<string, string>) {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const from = `569700${stamp.slice(-6)}`;
  const payload = inboundTextPayload({ phoneNumberId: channel!.phoneNumberId, from, messageId: `wamid.qa-p9-${tag}-${stamp}`, text: 'Hola, vi el anuncio', profileName: `QA P9 ${tag}` });
  if (referral) (payload as any).entry[0].changes[0].value.messages[0].referral = referral;
  const ingest = await ingestWebhookEvent(JSON.stringify(payload), payload);
  await processWebhookEvent(ingest.eventId);
  const contact = await prisma.contact.findFirstOrThrow({ where: { workspaceId: ws, phone: `+${from}` }, select: { id: true } });
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { channelId_contactId: { channelId: channel!.id, contactId: contact.id } },
    select: { id: true, productId: true, campaignRouteId: true, attribution: true },
  });
  const context = await loadChannelContext(channel!.id, ws, conversation.productId, new Date(), conversation.campaignRouteId);
  return { tag, productId: conversation.productId, routeId: conversation.campaignRouteId, agentId: context.agentId, adId: (conversation.attribution as any)?.adId ?? null };
}

const a = await arrive('ad1', { source_type: 'ad', source_id: ads[0], source_url: 'https://fb.me/qa1', ctwa_clid: 'qa-clid-1' });
const b = await arrive('ad2', { source_type: 'ad', source_id: ads[1], source_url: 'https://fb.me/qa2', ctwa_clid: 'qa-clid-2' });
const c = await arrive('none');
console.log(JSON.stringify({ channel: channel.id, a, b, c }, null, 2));

assert.equal(a.productId, products[0].id);
assert.equal(b.productId, products[1].id);
assert.notEqual(a.routeId, b.routeId);
if (agents.length >= 2) assert.notEqual(a.agentId, b.agentId);
assert.equal(c.routeId, null);
assert.equal(c.productId, channel.defaultProductId);
console.log(`HITO P9 local OK (agentes distintos: ${agents.length >= 2 ? 'sí' : 'no, el workspace tiene menos de 2 agentes publicados'})`);
await prisma.$disconnect();
