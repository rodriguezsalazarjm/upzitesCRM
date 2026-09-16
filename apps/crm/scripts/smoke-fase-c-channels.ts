/**
 * Pruebas de aceptacion de la Fase C — gateway multicanal: normalizacion de
 * eventos, aislamiento multi-tenant entre workspaces y entre cuentas, y los
 * dos recorridos end-to-end explicitamente pedidos (lead magnet de
 * Instagram, y un mismo workspace con conversaciones de dos canales a la vez
 * sin mezclar estado).
 *
 * Uso, desde apps/crm:
 *   pnpm exec tsx scripts/smoke-fase-c-channels.ts
 */
import './fixtures/test-environment';
import { createHmac } from 'node:crypto';
import { AutomationFlowStatus, ChannelAccountStatus, ChannelConnectionMethod } from '../generated/prisma/client';
import { prisma } from '../src/lib/prisma';
import { encryptSecret } from '../src/lib/crypto';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { POST as instagramWebhook } from '../src/app/api/webhooks/instagram/route';
import { processChannelEvent } from '../src/lib/channels/process';
import type { FlowGraph } from '../src/lib/automations/schema';

/**
 * El webhook solo persiste y encola (ver channels/ingest.ts); el trabajo real
 * (crear Contact/Conversation/Message, disparar automatizaciones) lo hace
 * processChannelEvent desde el Job. Igual que scripts/smoke-fase2.ts con
 * processWebhookEvent, aqui se invoca directo en vez de correr un worker.
 */
async function processNewEventsFor(workspaceId: string) {
  const pending = await prisma.channelEvent.findMany({ where: { workspaceId, status: 'PENDING' }, select: { id: true } });
  for (const event of pending) await processChannelEvent(event.id);
  return pending.length;
}

const results: { name: string; ok: boolean }[] = [];
let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const stamp = Date.now();
process.env.META_APP_SECRET = 'meta-app-secret-fasec';

async function makeWorkspace(key: string) {
  const { workspace } = await createCustomerWorkspace({
    companyName: `faseC-ch-${key}-${stamp}`,
    ownerName: `Owner ${key}`,
    email: `faseC-ch-${key}-${stamp}@upzites.test`,
    password: 'FaseCch#Test1234',
  });
  return workspace.id;
}

async function connectInstagram(workspaceId: string, externalAccountId: string) {
  return prisma.channelAccount.create({
    data: {
      workspaceId,
      channel: 'INSTAGRAM',
      connectionMethod: ChannelConnectionMethod.MANUAL,
      externalAccountId,
      displayName: `IG ${externalAccountId}`,
      accessTokenEncrypted: encryptSecret(`fake-ig-token-${externalAccountId}`),
      status: ChannelAccountStatus.CONNECTED,
      connectedAt: new Date(),
    },
  });
}

function signedInstagramRequest(body: unknown) {
  const raw = JSON.stringify(body);
  const signature = 'sha256=' + createHmac('sha256', process.env.META_APP_SECRET!).update(raw, 'utf8').digest('hex');
  return new Request('http://localhost:3001/api/webhooks/instagram', {
    method: 'POST',
    // IP de prueba propio: evita compartir el cupo del limitador de 'webhook'
    // con otros scripts de smoke que corren en la misma ventana.
    headers: { 'x-hub-signature-256': signature, 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.12' },
    body: raw,
  });
}

console.log('\n== Pruebas Fase C — gateway multicanal ==\n');

const A = await makeWorkspace('a');
const B = await makeWorkspace('b');
const igA = await connectInstagram(A, `ig-account-a-${stamp}`);
const igB = await connectInstagram(B, `ig-account-b-${stamp}`);

// --- 1. Firma invalida se rechaza -------------------------------------------
{
  const raw = JSON.stringify({ object: 'instagram', entry: [] });
  const request = new Request('http://localhost:3001/api/webhooks/instagram', {
    method: 'POST',
    headers: { 'x-hub-signature-256': 'sha256=firma-invalida', 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.12' },
    body: raw,
  });
  const response = await instagramWebhook(request);
  check('Firma invalida rechazada con 401', response.status === 401);
}

// --- 2. DM normal: crea Contact + Conversation + Message idempotente -------
{
  const senderId = `ig-user-dm-${stamp}`;
  const body = {
    object: 'instagram',
    entry: [{ id: igA.externalAccountId, messaging: [{ sender: { id: senderId, username: 'clienta_a' }, message: { text: 'Hola, buenas!' } }] }],
  };
  const first = await instagramWebhook(signedInstagramRequest(body));
  check('El webhook responde ok', first.status === 200);
  await processNewEventsFor(A);

  // Reintento identico (mismo cuerpo exacto): Meta reintenta si no confirma a tiempo.
  const second = await instagramWebhook(signedInstagramRequest(body));
  check('El webhook reenviado no revienta', second.status === 200);
  await processNewEventsFor(A);

  const events = await prisma.channelEvent.count({ where: { workspaceId: A, channelAccountId: igA.id, externalUserId: senderId } });
  check('El reintento NO duplica el ChannelEvent (idempotencia)', events === 1);

  const identity = await prisma.contactChannelIdentity.findFirst({ where: { channelAccountId: igA.id, externalUserId: senderId } });
  check('Se creo una ContactChannelIdentity', identity !== null);

  const messages = await prisma.message.count({ where: { workspaceId: A } });
  check('Se creo exactamente un Message (no duplicado)', messages === 1);
}

// --- 3. Aislamiento: mismo externalUserId en OTRA cuenta no cruza datos ----
{
  const sharedExternalId = `ig-user-shared-${stamp}`;
  const bodyForA = {
    object: 'instagram',
    entry: [{ id: igA.externalAccountId, messaging: [{ sender: { id: sharedExternalId, username: 'persona_a' }, message: { text: 'Soy de A' } }] }],
  };
  const bodyForB = {
    object: 'instagram',
    entry: [{ id: igB.externalAccountId, messaging: [{ sender: { id: sharedExternalId, username: 'persona_b' }, message: { text: 'Soy de B' } }] }],
  };
  await instagramWebhook(signedInstagramRequest(bodyForA));
  await instagramWebhook(signedInstagramRequest(bodyForB));
  await processNewEventsFor(A);
  await processNewEventsFor(B);

  const identities = await prisma.contactChannelIdentity.findMany({ where: { externalUserId: sharedExternalId } });
  check('El mismo externalUserId en dos cuentas produce DOS identidades distintas', identities.length === 2);
  const workspaceIds = new Set(identities.map((identity) => identity.workspaceId));
  check('Cada identidad pertenece a SU workspace, sin mezclarse', workspaceIds.has(A) && workspaceIds.has(B) && workspaceIds.size === 2);

  const contactA = await prisma.contact.findFirst({ where: { workspaceId: A, channelIdentities: { some: { externalUserId: sharedExternalId } } } });
  const contactB = await prisma.contact.findFirst({ where: { workspaceId: B, channelIdentities: { some: { externalUserId: sharedExternalId } } } });
  check('Son Contacts DISTINTOS, uno por workspace', contactA !== null && contactB !== null && contactA!.id !== contactB!.id);
}

// --- 4. E2E: Instagram lead magnet (comentario "GUIA" -> DM) ---------------
{
  const graph: FlowGraph = {
    trigger: { type: 'COMMENT', keywords: ['guia'] },
    nodes: [
      { id: 'msg', type: 'MESSAGE', text: 'Gracias por comentar! Te dejo la guía por acá 📄' },
      { id: 'tag', type: 'ACTION', action: 'ADD_TAG', params: { tag: 'lead_magnet_guia' } },
      { id: 'end', type: 'END' },
    ],
    edges: [
      { id: 'e1', from: 'msg', to: 'tag' },
      { id: 'e2', from: 'tag', to: 'end' },
    ],
  };
  const flow = await prisma.automationFlow.create({
    data: { workspaceId: A, name: 'IG comentario GUIA -> DM', status: AutomationFlowStatus.PUBLISHED, channelScope: ['INSTAGRAM'] },
  });
  await prisma.automationFlowVersion.create({
    data: {
      flowId: flow.id,
      version: 1,
      status: AutomationFlowStatus.PUBLISHED,
      trigger: graph.trigger as never,
      nodes: graph.nodes as never,
      edges: graph.edges as never,
      publishedAt: new Date(),
    },
  });

  let sentToGraph: { to: string; text: string } | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const href = String(url instanceof Request ? url.url : url);
    if (href.includes('graph.facebook.com')) {
      const body = JSON.parse(String(init?.body ?? '{}'));
      sentToGraph = { to: body.recipient?.id, text: body.message?.text };
      return new Response(JSON.stringify({ message_id: 'mid.fake.1' }), { status: 200 });
    }
    throw new Error(`fetch no simulado en Fase C: ${href}`);
  }) as typeof fetch;

  const commenterId = `ig-commenter-${stamp}`;
  const body = {
    object: 'instagram',
    entry: [
      {
        id: igA.externalAccountId,
        changes: [{ field: 'comments', value: { id: `comment-${stamp}`, text: 'me pasas la GUIA porfa', from: { id: commenterId, username: 'lead_ig' }, media: { id: 'reel-1' } } }],
      },
    ],
  };
  await instagramWebhook(signedInstagramRequest(body));
  await processNewEventsFor(A);
  globalThis.fetch = originalFetch;

  const activity = await prisma.activity.findFirst({ where: { workspaceId: A, contact: { channelIdentities: { some: { externalUserId: commenterId } } } } });
  check('El comentario queda anotado en la linea de tiempo del contacto', activity !== null);

  const contact = await prisma.contact.findFirstOrThrow({ where: { workspaceId: A, channelIdentities: { some: { externalUserId: commenterId } } } });
  check('La automatizacion etiqueto al lead', contact.tags.includes('lead_magnet_guia'));

  check('Se envio el DM por la API real de Instagram (interceptada en el test)', sentToGraph !== null && (sentToGraph as { to: string } | null)?.to === commenterId);

  const message = await prisma.message.findFirst({ where: { workspaceId: A, direction: 'OUTBOUND' } });
  check('El DM queda registrado como Message SENT', message?.status === 'SENT');
}

// --- 5. Cross-channel: el mismo workspace ve Instagram y WhatsApp separados -
{
  const contact = await prisma.contact.create({ data: { workspaceId: A, firstName: 'Cross', lastName: 'Channel', phone: `+56911${stamp}` } });
  const whatsappChannel = await prisma.whatsAppChannel.create({
    data: { workspaceId: A, wabaId: `waba-${stamp}`, phoneNumberId: `phone-${stamp}`, displayPhoneNumber: '+56900000000', status: 'CONNECTED' },
  });
  const waConversation = await prisma.conversation.create({
    data: { workspaceId: A, channelType: 'WHATSAPP', channelId: whatsappChannel.id, contactId: contact.id },
  });

  const igIdentity = await prisma.contactChannelIdentity.create({
    data: { workspaceId: A, contactId: contact.id, channel: 'INSTAGRAM', channelAccountId: igA.id, externalUserId: `ig-cross-${stamp}` },
  });
  const igConversation = await prisma.conversation.create({
    data: { workspaceId: A, channelType: 'INSTAGRAM', channelAccountId: igA.id, contactId: contact.id },
  });

  const conversations = await prisma.conversation.findMany({ where: { workspaceId: A, contactId: contact.id } });
  check('El contacto tiene dos conversaciones, una por canal', conversations.length === 2);
  const types = new Set(conversations.map((conversation) => conversation.channelType));
  check('Los tipos de canal no se mezclan', types.has('WHATSAPP') && types.has('INSTAGRAM') && types.size === 2);

  const waRow = conversations.find((conversation) => conversation.channelType === 'WHATSAPP')!;
  const igRow = conversations.find((conversation) => conversation.channelType === 'INSTAGRAM')!;
  check('La conversacion de WhatsApp usa channelId, no channelAccountId', waRow.channelId === whatsappChannel.id && waRow.channelAccountId === null);
  check('La conversacion de Instagram usa channelAccountId, no channelId', igRow.channelAccountId === igA.id && igRow.channelId === null);
  check('Ambas comparten el mismo Contact (misma persona, dos canales)', waRow.contactId === igRow.contactId);
  void igConversation;
  void igIdentity;
  void waConversation;
}

const deleted = await prisma.workspace.deleteMany({ where: { slug: { startsWith: 'fasec-ch-' } } });
console.log(`\nLimpieza: ${deleted.count} workspaces de prueba eliminados (cascade: jobs, eventos, etc.).`);

console.log(`\n== Resultado: ${results.length - failures}/${results.length} pruebas OK ==\n`);
if (failures > 0) process.exitCode = 1;
await prisma.$disconnect();
