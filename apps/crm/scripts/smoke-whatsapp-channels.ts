/**
 * Punto 8 — WhatsApp Channel Manager, contra la base de pruebas y por las rutas
 * reales (sesion firmada, roles, aislamiento, webhook firmado).
 *
 * Meta se simula en `fetch` (solo graph.facebook.com): estas pruebas validan
 * NUESTRO manejo de Embedded Signup, verificacion, webhooks y contexto, no la
 * conexion real con Meta. Nada sale a un canal: el outbox nunca se procesa y
 * el agente usa un proveedor guionado.
 *
 *  E2E. OWNER conecta un numero (Embedded Signup simulado), asigna agente y
 *       producto, llega un mensaje firmado, la conversacion entra al Inbox con
 *       ese producto y el agente que responde es el del numero.
 *  1-20. Los casos obligatorios de la especificacion (ver cada check).
 *
 * Uso, desde apps/crm (exige TEST_DATABASE_URL con el marcador de base aislada):
 *   pnpm exec tsx scripts/smoke-whatsapp-channels.ts
 */
import './fixtures/test-environment';
import { createHmac } from 'node:crypto';
import {
  AgentKind,
  AgentRunStatus,
  AgentVersionStatus,
  AutomationFlowStatus,
  PlanCode,
  WorkspaceRole,
} from '../generated/prisma/client';
import { crossTenantPrisma, prisma } from '../src/lib/prisma';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { assignCompSubscription } from '../src/lib/billing/subscription-admin';
import { addMembershipWithinPlan } from '../src/lib/entitlements/growth';
import { ScriptedProvider } from '../src/lib/agents/provider';
import { runAgent } from '../src/lib/agents/runner';
import { listConversations } from '../src/lib/conversations';
import { processWebhookEvent } from '../src/lib/whatsapp/inbound';
import { listChannels } from '../src/lib/whatsapp/channel-manager';
import { asUser } from './fixtures/request-context';
import { inboundTextPayload, statusUpdatePayload } from './fixtures/whatsapp';
import { POST as connectRoute } from '../src/app/api/integrations/whatsapp/connect/route';
import { POST as signupRoute } from '../src/app/api/integrations/whatsapp/embedded-signup/route';
import { GET as channelGet, PATCH as channelPatch } from '../src/app/api/integrations/whatsapp/channels/[id]/route';
import { POST as verifyRoute } from '../src/app/api/integrations/whatsapp/channels/[id]/verify/route';
import { POST as disconnectRoute } from '../src/app/api/integrations/whatsapp/channels/[id]/disconnect/route';
import { POST as testWebhookRoute } from '../src/app/api/integrations/whatsapp/channels/[id]/test-webhook/route';
import { POST as testSendRoute } from '../src/app/api/integrations/whatsapp/channels/[id]/test-send/route';
import { POST as webhookRoute } from '../src/app/api/webhooks/whatsapp/route';

process.env.PLATFORM_EMAIL_FROM = '';
process.env.META_APP_ID = '900000000000001';
process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID = '800000000000001';
process.env.WHATSAPP_VERIFY_TOKEN = 'verify-token-smoke';

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
const cli = { via: 'cli' as const, reason: 'smoke whatsapp channels' };
type Session = { id: string; workspaceId: string };
type ApiBody = { data?: Record<string, unknown> & { id?: string }; code?: string; message?: string };

// --- Meta simulado -------------------------------------------------------------

type MetaMode = 'ok' | 'invalid' | 'permission' | 'down' | 'unsubscribed';
const meta = {
  mode: 'ok' as MetaMode,
  /** phoneNumberId -> WABA a la que pertenece segun "Meta". */
  phones: new Map<string, { wabaId: string; display: string }>(),
  calls: [] as string[],
  sends: 0,
};
const BUSINESS_TOKEN = `business-token-from-meta-${stamp}-xxxxxxxx`;

globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
  const href = String(url instanceof Request ? url.url : url);
  if (!href.startsWith('https://graph.facebook.com/')) throw new Error(`fetch no simulado: ${href}`);
  const path = new URL(href).pathname.split('/').slice(2).join('/');
  meta.calls.push(`${init?.method ?? 'GET'} ${path}`);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (meta.mode === 'down') return json({ error: { code: 2, message: 'Service unavailable' } }, 503);
  if (meta.mode === 'invalid') return json({ error: { code: 190, message: 'Invalid OAuth access token' } }, 401);
  if (meta.mode === 'permission') return json({ error: { code: 200, message: 'Permissions error' } }, 403);
  if (path === 'oauth/access_token') {
    const code = new URL(href).searchParams.get('code');
    return code === 'expired-code-xxxxxxxx' ? json({ error: { code: 100 } }, 400) : json({ access_token: BUSINESS_TOKEN, token_type: 'bearer' });
  }
  const phoneList = path.match(/^(\w[\w-]*)\/phone_numbers$/);
  if (phoneList) {
    const data = [...meta.phones.entries()].filter(([, value]) => value.wabaId === phoneList[1]).map(([id, value]) => ({ id, display_phone_number: value.display, verified_name: 'Negocio Prueba', quality_rating: 'GREEN' }));
    return json({ data });
  }
  if (/\/subscribed_apps$/.test(path)) {
    if ((init?.method ?? 'GET') === 'POST') return json({ success: true });
    return json({ data: meta.mode === 'unsubscribed' ? [] : [{ whatsapp_business_api_data: { id: process.env.META_APP_ID } }] });
  }
  if (/\/register$/.test(path)) return json({ success: true });
  if (/\/messages$/.test(path)) {
    meta.sends += 1;
    return json({ messages: [{ id: `wamid.never-${meta.sends}` }] });
  }
  return json({ error: { code: 100 } }, 400);
}) as typeof fetch;

// --- Helpers -------------------------------------------------------------------

async function makeWorkspace(suffix: string, plan: PlanCode = PlanCode.SCALE) {
  const email = `owner-${suffix}-${stamp}@channels.test`;
  const created = await createCustomerWorkspace({ companyName: `channels-${suffix}-${stamp}`, ownerName: `Owner ${suffix}`, email, password: 'contrasena-de-prueba-1234' });
  createdWorkspaces.push(created.workspace.id);
  createdUsers.push(created.user.id);
  await assignCompSubscription({ workspaceId: created.workspace.id, planCode: plan, ...cli });
  const workspaceId = created.workspace.id;
  await prisma.workspaceActivation.upsert({ where: { workspaceId }, create: { workspaceId, status: 'ACTIVE', activatedAt: new Date() }, update: { status: 'ACTIVE', activatedAt: new Date() } });
  return { workspaceId, session: { id: created.user.id, workspaceId } as Session };
}

async function addMember(workspaceId: string, label: string, role: WorkspaceRole): Promise<Session> {
  const user = await prisma.user.create({ data: { name: label, email: `${label}-${stamp}@channels.test`, passwordHash: 'x' } });
  createdUsers.push(user.id);
  await addMembershipWithinPlan({ workspaceId, userId: user.id, role });
  return { id: user.id, workspaceId };
}

async function makeAgent(workspaceId: string, key: AgentKind, name: string, status: AgentVersionStatus = AgentVersionStatus.PUBLISHED) {
  return prisma.agentDefinition.create({
    data: { workspaceId, key, name, versions: { create: { version: 1, instructions: `Eres ${name}.`, model: 'gpt-5-mini', status, allowedTools: [] } } },
  });
}

async function makeProduct(workspaceId: string, name: string, status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE') {
  return prisma.product.create({ data: { workspaceId, name, type: 'PHYSICAL', status, variants: { create: { name: 'Unidad', priceMinor: 19990, inventory: 100, isDefault: true } } } });
}

async function makeFlow(workspaceId: string, name: string, scope: ('WHATSAPP' | 'INSTAGRAM')[], trigger: Record<string, unknown> = { type: 'MESSAGE_RECEIVED' }) {
  const flow = await prisma.automationFlow.create({ data: { workspaceId, name, status: AutomationFlowStatus.PUBLISHED, channelScope: scope } });
  await prisma.automationFlowVersion.create({
    data: {
      flowId: flow.id,
      version: 1,
      status: AutomationFlowStatus.PUBLISHED,
      trigger: trigger as never,
      nodes: [{ id: 'tag', type: 'ACTION', action: 'ADD_TAG', params: { tag: 'entro-por-whatsapp' } }, { id: 'end', type: 'END' }] as never,
      edges: [{ id: 'e1', from: 'tag', to: 'end' }] as never,
      publishedAt: new Date(),
    },
  });
  return flow;
}

const call = async (session: Session | null, handler: (request: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>, id: string, body?: unknown, method = 'POST') => {
  const response = await asUser(session, () =>
    handler(new Request(`http://localhost/api/integrations/whatsapp/channels/${id}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }), { params: Promise.resolve({ id }) }),
  );
  return { status: response.status, body: (await response.json().catch(() => ({}))) as ApiBody };
};
const callRoot = async (session: Session | null, handler: (request: Request) => Promise<Response>, url: string, body: unknown) => {
  const response = await asUser(session, () => handler(new Request(`http://localhost${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })));
  return { status: response.status, body: (await response.json().catch(() => ({}))) as ApiBody };
};

function signedWebhook(payload: unknown, secret = process.env.META_APP_SECRET!) {
  const raw = JSON.stringify(payload);
  const signature = `sha256=${createHmac('sha256', secret).update(raw, 'utf8').digest('hex')}`;
  return new Request('http://localhost/api/webhooks/whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature, 'x-forwarded-for': `10.8.${stamp % 200}.1` }, body: raw });
}

/** Entrega el webhook por la ruta real y procesa el evento como lo haria el worker. */
async function deliver(payload: unknown) {
  const response = await webhookRoute(signedWebhook(payload));
  const body = (await response.json()) as { duplicate?: boolean; queued?: boolean };
  const event = await prisma.webhookEvent.findFirst({ where: { provider: 'whatsapp' }, orderBy: { createdAt: 'desc' }, select: { id: true } });
  if (body.queued && event) await processWebhookEvent(event.id);
  return { status: response.status, body };
}

let seq = 0;
const nextPhone = () => `5697${String(stamp).slice(-5)}${String((seq += 1)).padStart(2, '0')}`;
const phoneId = (n: number) => `10${String(stamp).slice(-8)}${n}`;
const wabaId = (n: number) => `20${String(stamp).slice(-8)}${n}`;

async function main() {
  const A = await makeWorkspace('a');
  const B = await makeWorkspace('b');
  const memberA = await addMember(A.workspaceId, 'member-a', WorkspaceRole.MEMBER);
  const sellerA = await addMember(A.workspaceId, 'seller-a', WorkspaceRole.MEMBER);

  const supportAgent = await makeAgent(A.workspaceId, AgentKind.FULFILLMENT_SUPPORT, 'Agente Soporte WA');
  const draftAgent = await makeAgent(A.workspaceId, AgentKind.QUOTING, 'Agente sin publicar', AgentVersionStatus.DRAFT);
  const product = await makeProduct(A.workspaceId, 'Malla de seguridad 3x2');
  // Conocimiento comercial del producto (Punto 4): es lo que el agente recibe como contexto.
  await prisma.productSalesBrain.create({ data: { workspaceId: A.workspaceId, productId: product.id, productWhat: 'Malla de seguridad 3x2 para balcones', benefits: 'Protege a niños y mascotas' } });
  const archived = await makeProduct(A.workspaceId, 'Producto archivado', 'ARCHIVED');
  const productB = await makeProduct(B.workspaceId, 'Producto de B');
  const waFlow = await makeFlow(A.workspaceId, 'Bienvenida WhatsApp', ['WHATSAPP'], { type: 'MESSAGE_RECEIVED', keywords: ['hola'] });
  const igFlow = await makeFlow(A.workspaceId, 'Solo Instagram', ['INSTAGRAM']);

  // ---------------------------------------------------------------- E2E -----
  console.log('\n— E2E: conectar con Meta, asignar, recibir, Inbox con contexto —');
  meta.phones.set(phoneId(1), { wabaId: wabaId(1), display: '+56 9 7000 0001' });
  const signup = await callRoot(A.session, signupRoute, '/api/integrations/whatsapp/embedded-signup', { code: 'code-from-meta-xxxxxxxx', wabaId: wabaId(1), phoneNumberId: phoneId(1), pin: '123456' });
  const channelId = signup.body.data?.id ?? '';
  const stored = channelId ? await prisma.whatsAppChannel.findUnique({ where: { id: channelId } }) : null;
  check('E2E.1 Embedded Signup crea el canal verificado', signup.status === 201 && stored?.status === 'CONNECTED' && stored.connectionMethod === 'EMBEDDED_SIGNUP' && Boolean(stored.lastHealthCheckAt), `status ${signup.status}`);
  check('E2E.2 el token de negocio queda cifrado y no viaja en la respuesta', Boolean(stored?.accessTokenEncrypted) && stored?.accessTokenEncrypted !== BUSINESS_TOKEN && !JSON.stringify(signup.body).includes(BUSINESS_TOKEN));
  check('E2E.3 el servidor cambio el code, registro el numero y suscribio la app', ['GET oauth/access_token', `POST ${phoneId(1)}/register`, `POST ${wabaId(1)}/subscribed_apps`].every((c) => meta.calls.includes(c)));

  const assign = await call(A.session, channelPatch, channelId, { label: 'Ventas mallas', usage: 'SALES', defaultAgentId: supportAgent.id, defaultProductId: product.id }, 'PATCH');
  check('E2E.4 OWNER asigna agente y producto predeterminados', assign.status === 200 && assign.body.data?.defaultAgentId === supportAgent.id && assign.body.data?.defaultProductId === product.id);

  const customer = nextPhone();
  const e2eMessageId = `wamid.e2e-${stamp}`;
  const delivered = await deliver(inboundTextPayload({ phoneNumberId: phoneId(1), from: customer, messageId: e2eMessageId, text: 'Quiero cotizar una malla', profileName: 'Camila Prueba' }));
  const conversation = await prisma.conversation.findFirst({ where: { workspaceId: A.workspaceId, channelId }, include: { contact: true, messages: true } });
  check('E2E.5 el mensaje entra y crea contacto y conversación del número', delivered.status === 200 && conversation?.contact.phone === `+${customer}` && conversation.messages.some((m) => m.externalMessageId === e2eMessageId));
  check('E2E.6 la conversación toma el producto del número', conversation?.productId === product.id);
  const inbox = await asUser(A.session, () => listConversations());
  const inboxItem = inbox.find((item) => item.id === conversation?.id);
  check('E2E.7 aparece en el Inbox con el nombre del número', inboxItem?.lastMessagePreview === 'Quiero cotizar una malla' && inboxItem.channelLabel === 'Ventas mallas');
  const agentJob = await crossTenantPrisma.job.findFirst({ where: { dedupeKey: `agent:${conversation?.id}` } });
  check('E2E.8 se programa la respuesta del agente', Boolean(agentJob));
  const provider = new ScriptedProvider([{ text: 'Hola Camila, te ayudo con la malla 3x2.' }]);
  const run = conversation ? await runAgent({ workspaceId: A.workspaceId, conversationId: conversation.id, trigger: 'inbound_message', provider }) : null;
  const agentRun = run?.runId ? await prisma.agentRun.findUnique({ where: { id: run.runId } }) : null;
  check('E2E.9 responde el agente asignado al número, con el producto en contexto', agentRun?.agentDefinitionId === supportAgent.id && (provider.calls[0]?.instructions ?? '').includes('Malla de seguridad 3x2'), `run ${run?.status} ${run?.skippedReason ?? ''} agent=${agentRun?.agentDefinitionId === supportAgent.id} product=${(provider.calls[0]?.instructions ?? '').includes('Malla')} ctx=${JSON.stringify(run?.context?.productId)}`);
  const reply = await prisma.message.findFirst({ where: { workspaceId: A.workspaceId, conversationId: conversation?.id, direction: 'OUTBOUND' } });
  check('E2E.10 la respuesta queda en cola (no sale a Meta en la prueba)', reply?.status === 'QUEUED' && meta.sends === 0);

  // ---------------------------------------------------------------- 1-20 ----
  console.log('\n— Casos obligatorios —');

  // 1. Registrar configuracion (conexion manual de pilotos).
  meta.phones.set(phoneId(2), { wabaId: wabaId(2), display: '+56 9 7000 0002' });
  const manualToken = `manual-system-user-token-${stamp}`;
  const manual = await callRoot(A.session, connectRoute, '/api/integrations/whatsapp/connect', { wabaId: wabaId(2), phoneNumberId: phoneId(2), displayPhoneNumber: '+56 9 7000 0002', accessToken: manualToken });
  const manualId = manual.body.data?.id ?? '';
  const manualRow = manualId ? await prisma.whatsAppChannel.findUnique({ where: { id: manualId } }) : null;
  check('1. registra un segundo número (manual) verificado con Meta', manual.status === 201 && manualRow?.connectionMethod === 'MANUAL' && manualRow.status === 'CONNECTED' && !JSON.stringify(manual.body).includes(manualToken));

  // 2. Duplicados.
  const stolen = await callRoot(B.session, connectRoute, '/api/integrations/whatsapp/connect', { wabaId: wabaId(1), phoneNumberId: phoneId(1), displayPhoneNumber: 'x', accessToken: `b-token-${stamp}-xxxxxxxxxxxx` });
  const stillA = await prisma.whatsAppChannel.findUnique({ where: { phoneNumberId: phoneId(1) } });
  const again = await callRoot(A.session, connectRoute, '/api/integrations/whatsapp/connect', { wabaId: wabaId(2), phoneNumberId: phoneId(2), displayPhoneNumber: 'x', accessToken: manualToken });
  const rowsForPhone = await prisma.whatsAppChannel.count({ where: { phoneNumberId: phoneId(2) } });
  check('2. otro workspace no puede tomar un número ya conectado; repetir no duplica', stolen.status === 409 && stillA?.workspaceId === A.workspaceId && again.status === 201 && again.body.data?.id === manualId && rowsForPhone === 1, `B ${stolen.status}`);

  // 3. Agente.
  const badAgent = await call(A.session, channelPatch, manualId, { defaultAgentId: draftAgent.id }, 'PATCH');
  const goodAgent = await call(A.session, channelPatch, manualId, { defaultAgentId: supportAgent.id }, 'PATCH');
  check('3. asigna un agente publicado y rechaza uno sin publicar', badAgent.status === 400 && badAgent.body.code === 'INVALID_AGENT' && goodAgent.status === 200);

  // 4. Producto.
  const badProduct = await call(A.session, channelPatch, manualId, { defaultProductId: archived.id }, 'PATCH');
  const goodProduct = await call(A.session, channelPatch, manualId, { defaultProductId: product.id }, 'PATCH');
  check('4. asigna un producto activo y rechaza uno archivado', badProduct.status === 400 && goodProduct.status === 200);

  // 5. Automatizacion.
  const badFlow = await call(A.session, channelPatch, manualId, { defaultFlowId: igFlow.id }, 'PATCH');
  const goodFlow = await call(A.session, channelPatch, manualId, { defaultFlowId: waFlow.id }, 'PATCH');
  check('5. asigna una automatización de WhatsApp y rechaza una solo de Instagram', badFlow.status === 400 && badFlow.body.code === 'INVALID_FLOW' && goodFlow.status === 200);

  // 6. Persistencia y validacion.
  const hours = { aiSchedule: 'IN_HOURS', attentionTimezone: 'America/Santiago', attentionStartMinute: 0, attentionEndMinute: 0, attentionDays: [0, 1, 2, 3, 4, 5, 6], noProductBehavior: 'HUMAN' };
  await call(A.session, channelPatch, manualId, hours, 'PATCH');
  const reread = await call(A.session, channelGet, manualId, undefined, 'GET');
  const badTz = await call(A.session, channelPatch, manualId, { attentionTimezone: 'Marte/Olympus' }, 'PATCH');
  const unknownField = await call(A.session, channelPatch, manualId, { workspaceId: B.workspaceId }, 'PATCH');
  check('6. la configuración persiste y se valida (zona, campos desconocidos)', reread.body.data?.aiSchedule === 'IN_HOURS' && reread.body.data?.noProductBehavior === 'HUMAN' && reread.body.data?.defaultFlowId === waFlow.id && badTz.status === 400 && unknownField.status === 400 && !('accessTokenEncrypted' in (reread.body.data ?? {})));

  // 7. Permisos.
  const memberPatch = await call(memberA, channelPatch, manualId, { label: 'hack' }, 'PATCH');
  const memberConnect = await callRoot(memberA, connectRoute, '/api/integrations/whatsapp/connect', { wabaId: wabaId(2), phoneNumberId: phoneId(2), displayPhoneNumber: 'x', accessToken: manualToken });
  const memberDisconnect = await call(memberA, disconnectRoute, manualId);
  const memberRead = await call(memberA, channelGet, manualId, undefined, 'GET');
  check('7. un MEMBER puede ver pero no configurar, conectar ni desconectar', memberPatch.status === 403 && memberConnect.status === 403 && memberDisconnect.status === 403 && memberRead.status === 200);

  // 8. Aislamiento.
  const bRead = await call(B.session, channelGet, manualId, undefined, 'GET');
  const bPatch = await call(B.session, channelPatch, manualId, { label: 'de B' }, 'PATCH');
  const crossProduct = await call(A.session, channelPatch, manualId, { defaultProductId: productB.id }, 'PATCH');
  const bList = await asUser(B.session, () => listChannels(B.workspaceId));
  check('8. otro workspace no ve ni edita el número, ni se cruzan productos', bRead.status === 404 && bPatch.status === 404 && crossProduct.status === 400 && bList.every((c) => c.id !== manualId));

  // 9. Recibir webhook.
  const before9 = await prisma.whatsAppChannel.findUnique({ where: { id: manualId } });
  const msg9 = `wamid.nine-${stamp}`;
  const from9 = nextPhone();
  const res9 = await deliver(inboundTextPayload({ phoneNumberId: phoneId(2), from: from9, messageId: msg9, text: 'hola, consulta' }));
  const after9 = await prisma.whatsAppChannel.findUnique({ where: { id: manualId } });
  check('9. recibe el webhook firmado y anota la actividad real del número', res9.status === 200 && res9.body.queued === true && Boolean(after9?.lastWebhookAt && after9.lastInboundAt) && after9!.lastInboundAt!.getTime() !== before9?.lastInboundAt?.getTime());

  // 10. Webhook invalido.
  const eventsBefore = await prisma.webhookEvent.count({ where: { provider: 'whatsapp' } });
  const forged = await webhookRoute(signedWebhook(inboundTextPayload({ phoneNumberId: phoneId(2), from: nextPhone(), messageId: `wamid.forged-${stamp}`, text: 'falso' }), 'otro-secreto'));
  const eventsAfter = await prisma.webhookEvent.count({ where: { provider: 'whatsapp' } });
  check('10. rechaza un webhook con firma inválida sin guardar nada', forged.status === 401 && eventsBefore === eventsAfter);

  // 11. Dedupe.
  const dup = await deliver(inboundTextPayload({ phoneNumberId: phoneId(2), from: from9, messageId: msg9, text: 'hola, consulta' }));
  const copies = await crossTenantPrisma.message.count({ where: { externalMessageId: msg9 } });
  const flowRuns = await prisma.automationFlowRun.count({ where: { workspaceId: A.workspaceId, flowId: waFlow.id, triggerDedupeKey: `whatsapp:${msg9}` } });
  check('11. la reentrega de Meta no duplica mensaje ni automatización', dup.body.duplicate === true && copies === 1 && flowRuns === 1);

  // 12-13. Contacto y conversacion.
  const contact9 = await prisma.contact.findFirst({ where: { workspaceId: A.workspaceId, phone: `+${from9}` } });
  const conv9 = contact9 ? await prisma.conversation.findFirst({ where: { workspaceId: A.workspaceId, contactId: contact9.id } }) : null;
  check('12. crea el contacto en el workspace del número', Boolean(contact9) && (await crossTenantPrisma.contact.count({ where: { phone: `+${from9}`, workspaceId: B.workspaceId } })) === 0);
  check('13. crea la conversación asociada al número que recibió', conv9?.channelId === manualId && conv9.channelType === 'WHATSAPP');

  // 14. Inbox.
  const inboxA = await asUser(A.session, () => listConversations());
  const inboxB = await asUser(B.session, () => listConversations());
  check('14. el mensaje aparece en el Inbox del workspace y no en otro', inboxA.some((item) => item.id === conv9?.id && item.lastMessagePreview === 'hola, consulta') && !inboxB.some((item) => item.id === conv9?.id));

  // 15. Contexto por numero: producto del numero + automatizacion (que conduce)
  // en vez del agente.
  const flowRun9 = await prisma.automationFlowRun.findFirst({ where: { workspaceId: A.workspaceId, flowId: waFlow.id, conversationId: conv9?.id } });
  const agentJob9 = await crossTenantPrisma.job.findFirst({ where: { dedupeKey: `agent:${conv9?.id}` } });
  const audit9 = await prisma.auditLog.findFirst({ where: { workspaceId: A.workspaceId, entity: 'WhatsAppChannel', entityId: manualId, action: 'whatsapp.context_resolved' }, orderBy: { createdAt: 'desc' } });
  check('15. resuelve producto y automatización del número y lo registra', conv9?.productId === product.id && Boolean(flowRun9) && !agentJob9 && (audit9?.metadata as { productSource?: string } | null)?.productSource === 'CHANNEL_DEFAULT');

  // 16. Fallback humano.
  await call(A.session, channelPatch, manualId, { aiEnabled: false, defaultFlowId: null, fallbackUserId: sellerA.id }, 'PATCH');
  const from16 = nextPhone();
  await deliver(inboundTextPayload({ phoneNumberId: phoneId(2), from: from16, messageId: `wamid.sixteen-${stamp}`, text: 'necesito ayuda' }));
  const conv16 = await prisma.conversation.findFirst({ where: { workspaceId: A.workspaceId, contact: { phone: `+${from16}` } } });
  const agentJob16 = await crossTenantPrisma.job.findFirst({ where: { dedupeKey: `agent:${conv16?.id}` } });
  const fallbackAudit = await prisma.auditLog.findFirst({ where: { workspaceId: A.workspaceId, entityId: manualId, action: 'whatsapp.human_fallback' }, orderBy: { createdAt: 'desc' } });
  const aborted = conv16 ? await runAgent({ workspaceId: A.workspaceId, conversationId: conv16.id, provider: new ScriptedProvider([{ text: 'no debería' }]) }) : null;
  check('16. con la IA apagada queda para la persona asignada, con motivo, y el agente no responde', conv16?.assignedUserId === sellerA.id && !agentJob16 && (fallbackAudit?.metadata as { reason?: string } | null)?.reason?.includes('IA está desactivada') === true && aborted?.status === AgentRunStatus.ABORTED);

  // Sin configuracion valida: producto archivado despues de asignarlo.
  await call(A.session, channelPatch, manualId, { aiEnabled: true, noProductBehavior: 'AI_GENERAL', aiSchedule: 'ALWAYS' }, 'PATCH');
  await prisma.product.update({ where: { id: product.id }, data: { status: 'ARCHIVED' } });
  const from16b = nextPhone();
  await deliver(inboundTextPayload({ phoneNumberId: phoneId(2), from: from16b, messageId: `wamid.sixteen-b-${stamp}`, text: 'precio?' }));
  const conv16b = await prisma.conversation.findFirst({ where: { workspaceId: A.workspaceId, contact: { phone: `+${from16b}` } } });
  const warn = await prisma.auditLog.findFirst({ where: { workspaceId: A.workspaceId, entityId: manualId, action: 'whatsapp.context_resolved' }, orderBy: { createdAt: 'desc' } });
  check('16b. un producto que dejó de estar activo no se inventa: sin producto y con aviso', conv16b?.productId === null && JSON.stringify(warn?.metadata ?? {}).includes('producto predeterminado no está activo'));
  await prisma.product.update({ where: { id: product.id }, data: { status: 'ACTIVE' } });

  // 17. Desconexion.
  const disc = await call(A.session, disconnectRoute, manualId);
  const discRow = await prisma.whatsAppChannel.findUnique({ where: { id: manualId } });
  const from17 = nextPhone();
  await deliver(inboundTextPayload({ phoneNumberId: phoneId(2), from: from17, messageId: `wamid.seventeen-${stamp}`, text: 'sigue vivo?' }));
  const ignored = await crossTenantPrisma.message.count({ where: { externalMessageId: `wamid.seventeen-${stamp}` } });
  check('17. desconectar borra la credencial, deja de recibir y conserva la configuración', disc.status === 200 && discRow?.status === 'DISCONNECTED' && discRow.accessTokenEncrypted === null && ignored === 0 && discRow.defaultProductId === product.id);

  // 18. Reconexion.
  const reconnect = await callRoot(A.session, connectRoute, '/api/integrations/whatsapp/connect', { wabaId: wabaId(2), phoneNumberId: phoneId(2), displayPhoneNumber: 'x', accessToken: manualToken });
  const recRow = await prisma.whatsAppChannel.findUnique({ where: { id: manualId } });
  const recAudit = await prisma.auditLog.count({ where: { workspaceId: A.workspaceId, entityId: manualId, action: 'whatsapp.channel_reconnected' } });
  check('18. reconectar reactiva el mismo número con su configuración e historial', reconnect.status === 201 && reconnect.body.data?.reconnected === true && recRow?.status === 'CONNECTED' && recRow.defaultProductId === product.id && recAudit === 1);

  // 19. Errores.
  meta.mode = 'invalid';
  const badToken = await callRoot(A.session, connectRoute, '/api/integrations/whatsapp/connect', { wabaId: wabaId(3), phoneNumberId: phoneId(3), displayPhoneNumber: 'x', accessToken: `wrong-token-${stamp}-xxxxxxxx` });
  meta.mode = 'down';
  const down = await call(A.session, verifyRoute, manualId);
  const afterDown = await prisma.whatsAppChannel.findUnique({ where: { id: manualId } });
  meta.mode = 'permission';
  const perm = await call(A.session, verifyRoute, manualId);
  const afterPerm = (await asUser(A.session, () => listChannels(A.workspaceId))).find((c) => c.id === manualId);
  meta.mode = 'unsubscribed';
  const hook = await call(A.session, testWebhookRoute, channelId);
  meta.mode = 'ok';
  const expired = await callRoot(A.session, signupRoute, '/api/integrations/whatsapp/embedded-signup', { code: 'expired-code-xxxxxxxx', wabaId: wabaId(4), phoneNumberId: phoneId(4) });
  const failedSend = await deliver(statusUpdatePayload({ phoneNumberId: phoneId(1), messageId: reply?.externalMessageId ?? 'none', status: 'failed', errorCode: 131047, errorTitle: 'Re-engagement message' }));
  check('19a. token inválido: 400 claro, sin guardar canal', badToken.status === 400 && badToken.body.code === 'INVALID_CREDENTIALS' && (await prisma.whatsAppChannel.count({ where: { phoneNumberId: phoneId(3) } })) === 0);
  check('19b. Meta caída no marca el canal en error', down.status === 502 && afterDown?.status === 'CONNECTED');
  check('19c. permisos insuficientes se distinguen y quedan visibles', perm.status === 400 && perm.body.code === 'PERMISSION_DENIED' && afterPerm?.displayStatus === 'PERMISSION');
  check('19d. probar webhook pregunta a Meta y no da un falso positivo', hook.status === 200 && hook.body.data?.subscribed === false);
  check('19e. un code vencido de Embedded Signup se informa sin guardar nada', expired.status === 400 && (await prisma.whatsAppChannel.count({ where: { phoneNumberId: phoneId(4) } })) === 0);
  check('19f. el webhook procesa eventos de estado sin romperse', failedSend.status === 200);
  const auditFail = await prisma.auditLog.count({ where: { workspaceId: A.workspaceId, action: 'whatsapp.connect_failed' } });
  check('19g. los intentos fallidos quedan auditados', auditFail >= 2);

  // Envio de prueba autorizado: solo con ventana abierta, encolado, idempotente.
  meta.mode = 'ok';
  await call(A.session, verifyRoute, manualId);
  const sendBody = { conversationId: conv9!.id, text: 'Prueba de conexión' };
  const send1 = await call(A.session, testSendRoute, manualId, sendBody);
  const send2 = await call(A.session, testSendRoute, manualId, sendBody);
  const queued = await prisma.message.count({ where: { workspaceId: A.workspaceId, conversationId: conv9!.id, direction: 'OUTBOUND', text: 'Prueba de conexión' } });
  await prisma.conversation.update({ where: { id: conv9!.id }, data: { customerServiceWindowEndsAt: new Date(Date.now() - 1000) } });
  const closed = await call(A.session, testSendRoute, manualId, sendBody);
  check('19h. envío de prueba: solo en ventana, una vez y por el outbox', send1.status === 202 && send2.status === 202 && queued === 1 && closed.status === 409 && meta.sends === 0);

  // 20. Plan.
  const F = await makeWorkspace('free', PlanCode.FREE);
  meta.phones.set(phoneId(5), { wabaId: wabaId(5), display: '+56 9 7000 0005' });
  const callsBefore = meta.calls.length;
  const freeConnect = await callRoot(F.session, connectRoute, '/api/integrations/whatsapp/connect', { wabaId: wabaId(5), phoneNumberId: phoneId(5), displayPhoneNumber: 'x', accessToken: `free-token-${stamp}-xxxxxxxxxx` });
  check('20a. un plan sin canales no puede conectar (y ni se consulta a Meta)', freeConnect.status >= 400 && freeConnect.status < 500 && freeConnect.status !== 400 && meta.calls.length === callsBefore, `status ${freeConnect.status}`);
  const S = await makeWorkspace('start', PlanCode.START);
  const startChannel = await prisma.whatsAppChannel.create({ data: { workspaceId: S.workspaceId, wabaId: wabaId(6), phoneNumberId: phoneId(6), displayPhoneNumber: '+56 9 7000 0006', status: 'CONNECTED' } });
  const startAgent = await makeAgent(S.workspaceId, AgentKind.FULFILLMENT_SUPPORT, 'Agente START');
  const startAssign = await call(S.session, channelPatch, startChannel.id, { defaultAgentId: startAgent.id }, 'PATCH');
  const startCan = (await import('../src/lib/entitlements')).getWorkspaceEntitlements;
  const ent = await startCan(S.workspaceId);
  check('20b. asignar un agente respeta el plan', ent.can('agents') ? startAssign.status === 200 : startAssign.status === 402 || startAssign.status === 403, `agents=${ent.can('agents')} status ${startAssign.status}`);

  console.log(`\n${results.length - failures}/${results.length} OK`);
}

async function cleanup() {
  for (const workspaceId of createdWorkspaces) {
    await crossTenantPrisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
  }
  for (const userId of createdUsers) {
    await crossTenantPrisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
}

main()
  .catch((error) => {
    failures += 1;
    console.error(error);
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    process.exit(failures > 0 ? 1 : 0);
  });
