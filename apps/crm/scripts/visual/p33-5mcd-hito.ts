/**
 * Ensayo P33 (crm_pruebas): "5 Minutos con Dios" como negocio real.
 *
 * CONFIGURACIÓN — por los handlers reales de la API que usa la UI, con la
 * sesión del OWNER (sin tocar la base):
 *   producto "30 experiencias guiadas" CLP 5.990 + archivo, bump "7 audios"
 *   CLP 2.990 + archivo, cerebro de ventas con objeciones, oferta bump,
 *   número de WhatsApp (producto/IA por defecto) y seguimiento de checkout
 *   abandonado publicado.
 * Excepciones explícitas (shortcut, no hay UI posible en local):
 *   - el negocio interno se aprovisiona con el servicio de /platform;
 *   - la fila del número de WhatsApp (Embedded Signup necesita Meta real);
 *   - el pago: simulado por la ruta del webhook (Mercado Pago TEST = P27).
 *
 * LEAD QA: WhatsApp entrante (pipeline del webhook) → la IA responde la
 * objeción con el cerebro → "confirmo" → checkout → no paga → recuperación
 * inscrita → abre el checkout público y agrega el bump → pago → la
 * recuperación se detiene → entrega con los archivos del producto y del bump.
 *
 * Uso (desde apps/crm): NODE_OPTIONS="--require ./scripts/visual/preload.cjs" node node_modules/tsx/dist/cli.mjs scripts/visual/p33-5mcd-hito.ts
 */
import './als-global';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { LocalKnowledgeProvider } from '../../src/lib/agents/local-provider';
import { ScriptedProvider } from '../../src/lib/agents/provider';
import { runAgent } from '../../src/lib/agents/runner';
import { runJobs } from '../../src/lib/jobs/runner';
import { orderDeliveryView } from '../../src/lib/commerce/delivery-admin';
import { loadPublicCheckout, startPublicCheckoutPayment } from '../../src/lib/commerce/public-checkout';
import { publicCheckoutUrl } from '../../src/lib/commerce/public-checkout-link';
import { scanFollowUpEntries } from '../../src/lib/followups/triggers';
import { hashPassword } from '../../src/lib/password';
import { createPlatformClient } from '../../src/lib/platform/clients';
import { prisma } from '../../src/lib/prisma';
import { ingestWebhookEvent, processWebhookEvent } from '../../src/lib/whatsapp/inbound';
import { asUser } from '../fixtures/request-context';
import { inboundTextPayload } from '../fixtures/whatsapp';
import { POST as createProductRoute } from '../../src/app/api/products/studio/route';
import { POST as statusRoute } from '../../src/app/api/products/[id]/status/route';
import { POST as assetsRoute } from '../../src/app/api/products/[id]/assets/route';
import { POST as intentRoute } from '../../src/app/api/products/[id]/assets/upload/route';
import { PUT as localUploadRoute } from '../../src/app/api/products/[id]/assets/upload/local/route';
import { PATCH as brainRoute } from '../../src/app/api/products/[id]/sales-brain/route';
import { POST as offersRoute } from '../../src/app/api/products/[id]/offers/route';
import { POST as publishAgentRoute } from '../../src/app/api/agents/[id]/publish/route';
import { POST as activateRoute } from '../../src/app/api/onboarding/activate/route';
import { PATCH as profileRoute } from '../../src/app/api/onboarding/profile/route';
import { POST as agentTestRoute } from '../../src/app/api/agents/[id]/test/route';
import { getOnboardingState } from '../../src/lib/onboarding/steps';
import { POST as demoPayRoute } from '../../src/app/api/demo-checkout/[id]/route';
import { PATCH as channelRoute } from '../../src/app/api/integrations/whatsapp/channels/[id]/route';
import { POST as followupsRoute } from '../../src/app/api/followups/route';
import { POST as followupStatusRoute } from '../../src/app/api/followups/[id]/status/route';

const ok = (label: string) => console.log(`✓ ${label}`);
const req = (path: string, body?: unknown, method = 'POST') =>
  new NextRequest(`http://localhost:3101${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const p1 = (id: string) => ({ params: Promise.resolve({ id }) });
async function call(label: string, run: () => Promise<Response>, expect = [200, 201]) {
  const response = await run();
  const body = (await response.json().catch(() => ({}))) as { data?: Record<string, unknown>; message?: string };
  assert.ok(expect.includes(response.status), `${label}: HTTP ${response.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body.data ?? {};
}

// --- 0. Negocio interno (servicio de /platform) -------------------------------------------
const { password } = JSON.parse(readFileSync('.local-visual/accounts.json', 'utf8')) as { password: string };
const adminEmail = 'superadmin-p32@visual.test';
const admin = await prisma.user.findUnique({ where: { email: adminEmail }, select: { id: true, name: true, email: true, platformRole: true } })
  ?? await prisma.user.create({ data: { name: 'Sofía SuperAdmin', email: adminEmail, passwordHash: hashPassword(password), role: 'ADMIN', platformRole: 'SUPER_ADMIN' }, select: { id: true, name: true, email: true, platformRole: true } });
const { workspaceId: ws } = await createPlatformClient({
  actor: admin, idempotencyKey: 'qa-p33-5mcd', workspaceName: '5 Minutos con Dios (QA P33)', ownerName: admin.name, ownerEmail: admin.email,
  planCode: 'SCALE', billingSource: 'COMP', isInternal: true, addActorAsOwner: true,
  initialBusiness: { businessType: 'ECOMMERCE', commerceSubtype: 'INFOPRODUCT' }, reason: 'Ensayo P33: 5 Minutos con Dios',
});
const profile = await prisma.workspaceProfile.findUniqueOrThrow({ where: { workspaceId: ws }, select: { businessType: true, commerceSubtype: true } });
assert.deepEqual([profile.businessType, profile.commerceSubtype], ['ECOMMERCE', 'INFOPRODUCT']);
const owner = { id: admin.id, workspaceId: ws };
ok('negocio interno SCALE + COMP, ECOMMERCE / INFOPRODUCT');

// --- 1. Configuración por la API de la UI -------------------------------------------------
const stamp = Date.now().toString(36);
async function product(name: string, price: number) {
  const existing = await prisma.product.findFirst({ where: { workspaceId: ws, name, status: { not: 'ARCHIVED' } }, include: { variants: { where: { isDefault: true } } } });
  if (existing) return { id: existing.id, variantId: existing.variants[0].id, created: false };
  const data = await call(`crear ${name}`, () => asUser(owner, () => createProductRoute(req('/api/products/studio', { name, type: 'DIGITAL', currency: 'CLP', basePrice: price, description: '', sku: '', variants: [] }))));
  const id = String(data.id);
  const variant = await prisma.productVariant.findFirstOrThrow({ where: { productId: id, isDefault: true, product: { workspaceId: ws } } });
  return { id, variantId: variant.id, created: true };
}
async function upload(productId: string, fileName: string, type: string, content: Uint8Array, name: string) {
  const ticket = await call('intención de subida', () => asUser(owner, () => intentRoute(req(`/api/products/${productId}/assets/upload`, { fileName, size: content.byteLength, type }), p1(productId))));
  const { uploadUrl, intent } = ticket as { uploadUrl: string; intent: string };
  await call('subida', () => asUser(owner, () => localUploadRoute(new Request(`http://localhost${uploadUrl}`, { method: 'PUT', body: content as unknown as BodyInit }), p1(productId))));
  return call('registrar archivo', () => asUser(owner, () => assetsRoute(req(`/api/products/${productId}/assets`, { source: 'upload', intent, name }), p1(productId))));
}
const PDF = new TextEncoder().encode('%PDF-1.4\n% 5 Minutos con Dios: 30 experiencias guiadas\n%%EOF\n');
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 0xff, 0xfb, 0x90, 0x64]);

const main = await product('30 experiencias guiadas', 5990);
const bump = await product('7 audios', 2990);
if (main.created) await upload(main.id, '30-experiencias.pdf', 'application/pdf', PDF, '30 experiencias guiadas (PDF)');
if (bump.created) await upload(bump.id, 'audio-1.mp3', 'audio/mpeg', MP3, 'Audio 1 de 7');
for (const p of [main, bump]) await call('publicar', () => asUser(owner, () => statusRoute(req(`/api/products/${p.id}/status`, { action: 'publish' }), p1(p.id))), [200, 409]);
ok('productos publicados con su archivo (CLP 5.990 y CLP 2.990)');

const objectionResponse = 'Son menos de 200 pesos al día: 5 minutos diarios para ordenar tu mente y tu fe. Si no te sirve en 7 días, te devolvemos el dinero.';
await call('cerebro de ventas', () => asUser(owner, () => brainRoute(req(`/api/products/${main.id}/sales-brain`, {
  productWhat: '30 experiencias guiadas de 5 minutos para orar y meditar con la Biblia.', idealFor: 'Personas con poco tiempo que quieren volver a la oración diaria',
  problems: 'Falta de constancia y de tiempo', benefits: 'Paz, foco y un hábito diario fácil', differentiators: 'Solo 5 minutos, guiado paso a paso',
  targetAudience: 'Adultos cristianos de 25 a 55 años', buyerPersona: 'Madre trabajadora sin tiempo', faqs: [{ question: '¿Cómo lo recibo?', answer: 'Al pagar recibes el acceso por WhatsApp y email.' }],
  objections: [{ objection: 'Está muy caro', response: objectionResponse }], socialProof: 'Cientos de personas ya lo usan', guarantee: '7 días', policies: 'Devolución dentro de 7 días',
  salesTone: 'Cálido y cercano', prohibitedClaims: 'No prometer sanación ni milagros.', askWhen: 'Cuando no esté claro qué busca', offerWhen: 'Después de entender su necesidad',
  checkoutWhen: 'Solo después de confirmar intención de compra', insistWhen: 'Si pide más detalles', stopWhen: 'Cuando diga que no le interesa', handoffWhen: 'Si pide hablar con una persona', specialInstructions: 'Ofrecer los 7 audios en el checkout.',
}, 'PATCH'), p1(main.id))));
const existingBump = await prisma.productOffer.findFirst({ where: { workspaceId: ws, productId: main.id, kind: 'ORDER_BUMP' } });
if (!existingBump) await call('oferta bump', () => asUser(owner, () => offersRoute(req(`/api/products/${main.id}/offers`, { kind: 'ORDER_BUMP', variantId: bump.variantId, headline: 'Agrega los 7 audios guiados por CLP 2.990' }), p1(main.id))));
ok('cerebro de ventas con objeciones y bump "7 audios"');

// shortcut: Embedded Signup necesita Meta real; la fila del número es lo único que se crea a mano.
const phoneNumberId = 'qa-p33-5mcd';
const channel = await prisma.whatsAppChannel.findUnique({ where: { phoneNumberId } })
  ?? await prisma.whatsAppChannel.create({ data: { workspaceId: ws, wabaId: 'qa-p33-waba', phoneNumberId, displayPhoneNumber: '+56 9 3333 0033', status: 'CONNECTED' } });
const agent = await prisma.agentDefinition.findFirstOrThrow({ where: { workspaceId: ws, key: 'SALES' }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
const agentVersion = agent.versions[0];
assert.ok(agentVersion.allowedTools.includes('createCheckoutLink'), `el agente de ventas puede crear checkout: ${agentVersion.allowedTools.join(',')}`);
if (agentVersion.status !== 'PUBLISHED') await call('publicar agente', () => asUser(owner, () => publishAgentRoute(req(`/api/agents/${agent.id}/publish`, { versionId: agentVersion.id }), p1(agent.id))));
ok('agente de ventas publicado (IA → Publicar)');
await call('configurar número', () => asUser(owner, () => channelRoute(req(`/api/integrations/whatsapp/channels/${channel.id}`, { label: 'Ventas 5MCD', usage: 'SALES', defaultProductId: main.id, defaultAgentId: agent?.id ?? null, aiEnabled: true, aiSchedule: 'ALWAYS', noProductBehavior: 'AI_GENERAL' }, 'PATCH'), p1(channel.id))));
ok('número de WhatsApp: ventas, producto e IA por defecto');

let strategy = await prisma.journey.findFirst({ where: { workspaceId: ws, trigger: 'CHECKOUT_ABANDONED', productId: main.id, status: 'PUBLISHED' } });
if (!strategy) {
  const created = await call('estrategia de recuperación', () => asUser(owner, () => followupsRoute(req('/api/followups', {
    name: 'Recuperar checkout 5MCD', trigger: 'CHECKOUT_ABANDONED', productId: main.id, maxMessages: 2, minGapHours: 0, simulate: false,
    steps: [
      { label: 'Recordatorio 1h', action: 'SEND_WHATSAPP', delayHours: 1, messageMode: 'FIXED', body: 'Hola {{nombre}}, tu acceso a las 30 experiencias te espera. ¿Te ayudo a terminar?' },
      { label: 'Último aviso 24h', action: 'SEND_WHATSAPP', delayHours: 24, messageMode: 'FIXED', body: '{{nombre}}, último recordatorio: 5 minutos al día pueden cambiar tu semana.' },
    ],
  }))));
  await call('publicar recuperación', () => asUser(owner, () => followupStatusRoute(req(`/api/followups/${created.id}/status`, { action: 'publish' }), p1(String(created.id)))));
  strategy = await prisma.journey.findFirstOrThrow({ where: { id: String(created.id), workspaceId: ws } });
}
ok('seguimiento de checkout abandonado publicado');

// Puesta en marcha: lo que se hace en la UI, por sus rutas.
await call('información del negocio', () => asUser(owner, () => profileRoute(req('/api/onboarding/profile', {
  about: '5 Minutos con Dios: experiencias guiadas de oración y meditación bíblica de 5 minutos al día.',
  policies: 'Producto digital: el acceso llega por WhatsApp y email al confirmar el pago. Garantía de 7 días.',
}, 'PATCH'))));
await call('probar agente en el simulador', () => asUser(owner, () => agentTestRoute(req(`/api/agents/${agent.id}/test`, { versionId: agentVersion.id, message: 'Hola, ¿qué incluye?' }), p1(agent.id))));
const EXTERNAL = ['whatsapp', 'pagos', 'email'];
const pending = (await getOnboardingState(ws)).steps.filter((st) => st.level === 'REQUIRED' && st.key !== 'activacion' && !st.done).map((st) => st.key);
assert.deepEqual(pending.filter((k) => !EXTERNAL.includes(k)), [], `solo quedan pasos externos: ${pending.join(', ')}`);
if ((await prisma.workspaceActivation.findUnique({ where: { workspaceId: ws }, select: { status: true } }))?.status !== 'ACTIVE') {
  if (pending.length === 0) await call('activar negocio', () => asUser(owner, () => activateRoute()));
  // shortcut: WhatsApp verificado (Meta), Mercado Pago conectado (P27) y dominio verificado (P25) no existen en local.
  else await prisma.workspaceActivation.upsert({ where: { workspaceId: ws }, create: { workspaceId: ws, status: 'ACTIVE', activatedAt: new Date() }, update: { status: 'ACTIVE', activatedAt: new Date() } });
}
console.log(`  (bloqueos externos al activar: ${pending.join(', ') || 'ninguno'})`);
ok('negocio activado (Puesta en marcha)');

// --- 2. Lead QA ---------------------------------------------------------------------------
const from = `5697${String(Date.now()).slice(-7)}`;
async function inbound(text: string, n: number) {
  const payload = inboundTextPayload({ phoneNumberId, from, messageId: `wamid.qa-p33-${stamp}-${n}`, text, profileName: `Lead 5MCD ${stamp}` });
  const ingest = await ingestWebhookEvent(JSON.stringify(payload), payload);
  await processWebhookEvent(ingest.eventId);
}
await inbound('Hola, vi el anuncio de las 30 experiencias. Me parece muy caro.', 1);
const conversation = await prisma.conversation.findFirstOrThrow({ where: { workspaceId: ws, channelId: channel.id, contact: { phone: { contains: from.slice(-7) } } }, orderBy: { createdAt: 'desc' } });
assert.equal(conversation.productId, main.id, 'la conversación toma el producto del número');
const contactId = conversation.contactId!;
await new Promise((resolve) => setTimeout(resolve, 3_500)); // debounce del agente (agents/dispatch)
for (let i = 0; i < 3; i += 1) await runJobs({ limit: 50, withRecurring: false, workspaceId: ws });
const aiReply = await prisma.message.findFirst({ where: { workspaceId: ws, conversationId: conversation.id, direction: 'OUTBOUND', senderType: 'AI' }, orderBy: { createdAt: 'desc' } });
assert.match(aiReply?.text ?? '', /menos de 200 pesos/, 'la IA responde la objeción con el cerebro');
ok('la IA responde la objeción con el cerebro de ventas');

await prisma.message.create({ data: { workspaceId: ws, conversationId: conversation.id, direction: 'OUTBOUND', senderType: 'AI', status: 'SENT', text: 'Las 30 experiencias cuestan $5.990. ¿Confirmas la compra?' } });
await inbound('confirmo', 2);
await prisma.conversation.updateMany({ where: { id: conversation.id, workspaceId: ws }, data: { mode: 'AI_ACTIVE' } });
const checkout = await runAgent({ workspaceId: ws, conversationId: conversation.id, provider: new ScriptedProvider([{ toolCalls: [{ id: 'checkout', name: 'createCheckoutLink', arguments: {} }] }, { text: 'Aquí tienes tu enlace.' }]), dryRun: true, allowSimulatorCheckout: true });
assert.equal(checkout.toolCalls?.find((c) => c.name === 'createCheckoutLink')?.ok, true, JSON.stringify(checkout.toolCalls));
const order = await prisma.customerOrder.findFirstOrThrow({ where: { workspaceId: ws, conversationId: conversation.id }, orderBy: { createdAt: 'desc' } });
assert.equal(order.total, 5990);
ok('checkout creado desde la conversación (CLP 5.990)');

// no paga: la recuperación lo inscribe cuando vence el primer paso
await scanFollowUpEntries(200, new Date(Date.now() + 2 * 3_600_000));
const enrollment = await prisma.journeyEnrollment.findFirst({ where: { workspaceId: ws, journeyId: strategy.id, contactId } });
assert.ok(enrollment, 'checkout sin pagar → recuperación inscrita');
ok('checkout abandonado → recuperación inscrita');

// vuelve, abre el checkout público, agrega el bump y paga
const token = new URL(publicCheckoutUrl(order.id)).searchParams.get('t')!;
const view = await loadPublicCheckout(order.id, token);
assert.ok(view && JSON.stringify(view).includes('7 audios'), 'el checkout muestra el bump');
const start = await startPublicCheckoutPayment(order.id, token, true);
assert.ok(start.ok && start.redirectUrl === `/demo-checkout/${order.id}`, `en local el cobro va al checkout demo (Mercado Pago TEST = P27): ${JSON.stringify(start)}`);
const withBump = await prisma.customerOrder.findFirstOrThrow({ where: { id: order.id, workspaceId: ws }, include: { lines: true } });
assert.equal(withBump.total, 5990 + 2990, 'el bump se suma al pedido');
const paid = await call('pagar en el checkout demo', () => asUser(owner, () => demoPayRoute(req(`/api/demo-checkout/${order.id}`), p1(order.id)))) as { handled?: boolean; reason?: string };
assert.equal(paid.handled, true, paid.reason);
ok('checkout público con bump → pago en el checkout demo (simulado, misma ruta del webhook) CLP 8.980');

const after = await prisma.customerOrder.findFirstOrThrow({ where: { id: order.id, workspaceId: ws }, include: { deliveries: true } });
assert.equal(after.status, 'FULFILLED', 'producto digital: el pago lo deja entregado');
const stopped = await prisma.journeyEnrollment.findFirstOrThrow({ where: { id: enrollment.id, workspaceId: ws } });
assert.notEqual(stopped.status, 'ACTIVE', 'la compra detiene la recuperación');
const delivery = after.deliveries.at(-1);
assert.ok(delivery, 'hay entrega');
const deliveryView = JSON.stringify(await orderDeliveryView(ws, order.id));
assert.ok(deliveryView.includes('30 experiencias guiadas (PDF)') && deliveryView.includes('Audio 1 de 7'), `la entrega trae el archivo del producto y el del bump: ${deliveryView.slice(0, 600)}`);
const items = deliveryView;
console.log(JSON.stringify({ workspace: ws, order: order.id, total: withBump.total, lines: withBump.lines.map((l) => l.name), delivery: { status: delivery.status, id: delivery.id }, enrollment: stopped.status, items: items.length }, null, 2));
ok(`entrega con producto + bump (${delivery.status}); recuperación ${stopped.status}`);
console.log('ENSAYO P33 LOCAL OK (pago simulado; Mercado Pago TEST real = P27; WhatsApp real = Meta)');
await prisma.$disconnect();
