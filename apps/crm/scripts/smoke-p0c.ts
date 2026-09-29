/**
 * P0-C: Entitlements y enforcement.
 *
 * Catalogo FREE/START/PRO/SCALE, API central can/limit/usage/remaining, gates
 * server-side (el endpoint directo no evade), degradacion reversible con
 * `planLimitedAt` (nunca borra, conserva lo mas antiguo, OWNER primero),
 * SUSPENDED como bloqueo total, creditos de IA y 5 Minutos con Dios (SCALE +
 * COMP) sin mezclar commerce con SaaS billing.
 *
 * Uso, desde apps/crm (exige TEST_DATABASE_URL con el marcador de base aislada):
 *   pnpm exec tsx scripts/smoke-p0c.ts
 */
import './fixtures/test-environment';
import {
  AgentKind,
  AgentRunStatus,
  AgentVersionStatus,
  AutomationTrigger,
  ChannelAccountStatus,
  ConversationMode,
  ConversationStatus,
  JourneyStatus,
  JourneyTrigger,
  MembershipStatus,
  PlanCode,
  ProductStatus,
  ProductType,
  WhatsAppChannelStatus,
  WorkspaceRole,
} from '../generated/prisma/client';
import { crossTenantPrisma, prisma } from '../src/lib/prisma';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { resolveSubscription } from '../src/lib/billing/subscription-access';
import {
  activateManualSubscription,
  assignCompSubscription,
  resumeSubscription,
  setWorkspaceInternal,
  suspendSubscription,
} from '../src/lib/billing/subscription-admin';
import { currentPeriod } from '../src/lib/billing/usage';
import {
  assertCanGrow,
  EntitlementError,
  getWorkspaceEntitlements,
  isEntitlementError,
} from '../src/lib/entitlements';
import { checkAiCredits, recordAiCredits } from '../src/lib/entitlements/ai-credits';
import { assertChannelConnectAllowed } from '../src/lib/entitlements/channels';
import { reconcileWorkspaceEntitlements } from '../src/lib/entitlements/reconcile';
import { createFlow, saveFlow } from '../src/lib/automations/service';
import type { FlowGraph } from '../src/lib/automations/schema';
import { createOrder } from '../src/lib/commerce/orders';
import { upsertLeadContact } from '../src/lib/capture';
import { resolveContactForChannelIdentity } from '../src/lib/channels/identity';
import { addMembershipWithinPlan } from '../src/lib/entitlements/growth';
import { createOrderCheckout, CheckoutError } from '../src/lib/commerce/checkout';
import { runAgent } from '../src/lib/agents/runner';
import { ScriptedProvider } from '../src/lib/agents/provider';
import { resolveAccess } from '../src/lib/workspace-access';
import { grantConsent } from '../src/lib/domain/consent';
import { asUser, throughProxy } from './fixtures/request-context';
import { activateForTests } from './fixtures/workspace';
import { POST as createContact, GET as listContacts } from '../src/app/api/contacts/route';
import { DELETE as deleteContact, PATCH as patchContact } from '../src/app/api/contacts/[id]/route';
import { POST as importContacts } from '../src/app/api/contacts/import/route';
import { POST as createRule } from '../src/app/api/automations/rules/route';
import { POST as connectChannel } from '../src/app/api/integrations/channels/[channel]/connect/route';
import { POST as createProduct } from '../src/app/api/products/route';
import { POST as orderCheckout } from '../src/app/api/orders/[id]/checkout/route';
import { POST as mpConnect } from '../src/app/api/integrations/mercado-pago/connect/route';
import { GET as shopifyConnect } from '../src/app/api/integrations/shopify/connect/route';
import { POST as publishAgent } from '../src/app/api/agents/[id]/publish/route';
import { POST as publishJourney } from '../src/app/api/journeys/[id]/publish/route';
import { GET as authMe } from '../src/app/api/auth/me/route';

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
const cli = { via: 'cli' as const, reason: 'smoke p0c' };
const createdWorkspaces: string[] = [];

type Ws = { workspaceId: string; userId: string; session: { id: string; workspaceId: string } };

async function makeWorkspace(suffix: string): Promise<Ws> {
  const created = await createCustomerWorkspace({
    companyName: `p0c-${suffix}-${stamp}`,
    ownerName: `Owner ${suffix}`,
    email: `owner-${suffix}-${stamp}@p0c.test`,
    password: 'contrasena-de-prueba-1234',
  });
  createdWorkspaces.push(created.workspace.id);
  return {
    workspaceId: created.workspace.id,
    userId: created.user.id,
    session: { id: created.user.id, workspaceId: created.workspace.id },
  };
}

function json(path: string, method: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function codeOf(response: Response) {
  const body = (await response.clone().json().catch(() => ({}))) as { code?: string };
  return body.code;
}

async function addMember(ws: Ws, role: WorkspaceRole, createdAt: Date) {
  const user = await prisma.user.create({
    data: {
      workspaceId: ws.workspaceId,
      name: `${role} ${createdAt.getTime()}`,
      email: `${role.toLowerCase()}-${createdAt.getTime()}-${stamp}@p0c.test`,
      passwordHash: 'x',
      memberships: { create: { workspaceId: ws.workspaceId, role, createdAt } },
    },
  });
  return prisma.workspaceMembership.findUniqueOrThrow({ where: { userId_workspaceId: { userId: user.id, workspaceId: ws.workspaceId } } });
}

let channelSeq = 0;
async function addChannelAccount(ws: Ws, createdAt: Date) {
  channelSeq += 1;
  return prisma.channelAccount.create({
    data: {
      workspaceId: ws.workspaceId,
      channel: 'INSTAGRAM',
      externalAccountId: `ig-p0c-${stamp}-${channelSeq}`,
      status: ChannelAccountStatus.CONNECTED,
      accessTokenEncrypted: 'cifrado-de-prueba',
      connectedAt: createdAt,
      createdAt,
    },
  });
}

async function addWhatsApp(ws: Ws, createdAt: Date) {
  channelSeq += 1;
  return prisma.whatsAppChannel.create({
    data: {
      workspaceId: ws.workspaceId,
      wabaId: `waba-p0c-${stamp}-${channelSeq}`,
      phoneNumberId: `pn-p0c-${stamp}-${channelSeq}`,
      displayPhoneNumber: `+5690000${channelSeq}`,
      status: WhatsAppChannelStatus.CONNECTED,
      accessTokenEncrypted: 'cifrado-de-prueba',
      createdAt,
    },
  });
}

async function addCustomRule(ws: Ws, createdAt: Date, name = `regla ${createdAt.getTime()}`) {
  return prisma.automationRule.create({
    data: {
      workspaceId: ws.workspaceId,
      name,
      trigger: AutomationTrigger.LEAD_CREATED,
      actions: [{ type: 'ADD_TAG', tag: 'p0c' }] as never,
      createdAt,
    },
  });
}

const internalGraph: FlowGraph = {
  trigger: { type: 'NEW_CONTACT' },
  nodes: [
    { id: 'tag', type: 'ACTION', action: 'ADD_TAG', params: { tag: 'nuevo' } },
    { id: 'end', type: 'END' },
  ],
  edges: [{ id: 'e1', from: 'tag', to: 'end' }],
} as FlowGraph;

async function publishNewFlow(ws: Ws, graph: FlowGraph, name: string) {
  const flow = await createFlow(ws.workspaceId, ws.userId, name, 'WHATSAPP', graph);
  try {
    await saveFlow(ws.workspaceId, flow.id, ws.userId, { action: 'publish', versionId: flow.versions[0].id });
    return { flowId: flow.id, published: true as const };
  } catch (error) {
    return { flowId: flow.id, published: false as const, error };
  }
}

async function makeProduct(ws: Ws) {
  const product = await prisma.product.create({
    data: {
      workspaceId: ws.workspaceId,
      name: 'Producto P0-C',
      type: ProductType.DIGITAL,
      status: ProductStatus.ACTIVE,
      variants: { create: { name: 'Acceso', priceClp: 4990, isDefault: true, inventory: null } },
    },
    include: { variants: true },
  });
  return product.variants[0];
}

// =============================================================================
console.log('\n== 1-7. FREE ==');
const F = await makeWorkspace('free');
{
  const ent = await getWorkspaceEntitlements(F.workspaceId);
  check('1. FREE: 1 usuario (limit=1, usage=1)', ent.limit('users.max') === 1 && (await ent.usage('users')) === 1);
  let usersBlocked = false;
  try {
    await assertCanGrow(F.workspaceId, 'users.max');
  } catch (error) {
    usersBlocked = isEntitlementError(error) && error.code === 'PLAN_LIMIT';
  }
  check('   un segundo usuario queda bloqueado', usersBlocked);

  await prisma.contact.createMany({
    data: Array.from({ length: 299 }, (_, i) => ({ workspaceId: F.workspaceId, firstName: 'C', lastName: `${i}`, source: 'p0c' })),
  });
  const c300 = await asUser(F.session, () => createContact(json('/api/contacts', 'POST', { firstName: 'Tres', lastName: 'Cientos' })));
  check('2. FREE: el contacto 300 se crea', c300.status === 201, `${c300.status}`);
  const c301 = await asUser(F.session, () => createContact(json('/api/contacts', 'POST', { firstName: 'Tres', lastName: 'Cientos Uno' })));
  check('3. el contacto 301 queda bloqueado (409 PLAN_LIMIT)', c301.status === 409 && (await codeOf(c301)) === 'PLAN_LIMIT', `${c301.status}`);

  // Importar tambien crea: se corta en el limite y actualiza lo existente.
  const csv = 'name,email\nNuevo Importado,nuevo-import-' + stamp + '@p0c.test';
  const imported = await asUser(F.session, () => importContacts(new Request('http://localhost/api/contacts/import', { method: 'POST', body: csv })));
  check('   importar en el limite no crea contactos', imported.status === 409 && (await prisma.contact.count({ where: { workspaceId: F.workspaceId } })) === 300);

  // Contactos ENTRANTES: nunca se pierden por el limite (se auditan).
  const lead = await upsertLeadContact({ workspaceId: F.workspaceId, name: 'Lead Formulario', email: `lead-${stamp}@p0c.test`, source: 'form-p0c' });
  const igAccount = await prisma.channelAccount.create({
    data: { workspaceId: F.workspaceId, channel: 'INSTAGRAM', externalAccountId: `ig-in-${stamp}`, status: ChannelAccountStatus.CONNECTED },
  });
  const igContact = await resolveContactForChannelIdentity({
    workspaceId: F.workspaceId,
    channel: 'INSTAGRAM',
    channelAccountId: igAccount.id,
    externalUserId: `igsid-${stamp}`,
    displayName: 'Cliente Instagram',
  });
  const inboundAudits = await prisma.auditLog.count({ where: { workspaceId: F.workspaceId, action: 'contacts.inbound_over_limit' } });
  check(
    '   entrantes sobre el limite SI se guardan (formulario + Instagram) y se auditan',
    Boolean(lead.id && igContact.id) && (await prisma.contact.count({ where: { workspaceId: F.workspaceId } })) === 302 && inboundAudits === 2,
    `audits=${inboundAudits}`,
  );
  // El canal era solo para simular la entrada: FREE no tiene canales.
  await prisma.channelAccount.update({ where: { id: igAccount.id }, data: { status: ChannelAccountStatus.DISCONNECTED } });
  const manualOver = await asUser(F.session, () => createContact(json('/api/contacts', 'POST', { firstName: 'Manual', lastName: 'Sobre' })));
  const editOver = await asUser(F.session, () => patchContact(json(`/api/contacts/${lead.id}`, 'PATCH', { firstName: 'Editado' }), { params: Promise.resolve({ id: lead.id }) }));
  const deleteOver = await asUser(F.session, () => deleteContact(json(`/api/contacts/${igContact.id}`, 'DELETE'), { params: Promise.resolve({ id: igContact.id }) }));
  check(
    '   sobre el limite: crear a mano bloqueado; editar y eliminar permitidos; nada se borra solo',
    manualOver.status === 409 && editOver.status === 200 && deleteOver.status === 200 && (await prisma.contact.count({ where: { workspaceId: F.workspaceId } })) === 301,
    `${manualOver.status}/${editOver.status}/${deleteOver.status}`,
  );
  await prisma.contact.delete({ where: { id: lead.id } });

  const presetRules = await prisma.automationRule.count({ where: { workspaceId: F.workspaceId, isActive: true, presetKey: { not: null } } });
  const internalRule = (n: number) => ({ name: `Interna ${n}`, trigger: 'LEAD_CREATED', actions: [{ type: 'ADD_TAG', tag: `t${n}` }] });
  const r1 = await asUser(F.session, () => createRule(json('/api/automations/rules', 'POST', internalRule(1))));
  const r2 = await asUser(F.session, () => createRule(json('/api/automations/rules', 'POST', internalRule(2))));
  const flow3 = await publishNewFlow(F, internalGraph, 'Interna 3 (flujo)');
  check(
    '4. FREE: 3 automatizaciones internas activas (2 reglas + 1 flujo)',
    r1.status === 201 && r2.status === 201 && flow3.published && (await (await getWorkspaceEntitlements(F.workspaceId)).usage('automations.active')) === 3,
  );
  check('   las reglas de sistema del alta no ocupan cupo', presetRules > 0);
  const r4 = await asUser(F.session, () => createRule(json('/api/automations/rules', 'POST', internalRule(4))));
  const flow4 = await publishNewFlow(F, internalGraph, 'Interna 4 (flujo)');
  check(
    '5. la cuarta queda bloqueada (regla 409 y flujo PLAN_LIMIT)',
    r4.status === 409 && !flow4.published && isEntitlementError(flow4.error) && flow4.error.code === 'PLAN_LIMIT',
  );

  const aiGraph = {
    trigger: { type: 'NEW_CONTACT' },
    nodes: [{ id: 'ia', type: 'AI', goal: 'Vender', maxTurns: 3, allowedTools: [], exitConditions: [] }, { id: 'end', type: 'END' }],
    edges: [{ id: 'e1', from: 'ia', to: 'end' }],
  } as unknown as FlowGraph;
  const aiFlow = await publishNewFlow(F, aiGraph, 'Con IA');
  check(
    '6. FREE: automatizacion con nodo IA no publica (PLAN_FEATURE ai)',
    !aiFlow.published && isEntitlementError(aiFlow.error) && aiFlow.error.code === 'PLAN_FEATURE' && aiFlow.error.details.key === 'ai',
  );
  const waGraph = {
    trigger: { type: 'NEW_CONTACT' },
    nodes: [{ id: 'msg', type: 'MESSAGE', text: 'Hola' }, { id: 'end', type: 'END' }],
    edges: [{ id: 'e1', from: 'msg', to: 'end' }],
  } as unknown as FlowGraph;
  const waFlow = await publishNewFlow(F, waGraph, 'Con WhatsApp');
  check(
    '7. FREE: automatizacion con WhatsApp no publica (PLAN_FEATURE channels.messaging)',
    !waFlow.published && isEntitlementError(waFlow.error) && waFlow.error.details.key === 'channels.messaging',
  );
  const sendRule = await asUser(F.session, () =>
    createRule(json('/api/automations/rules', 'POST', { name: 'Envia', trigger: 'LEAD_CREATED', actions: [{ type: 'SEND_MESSAGE', text: 'hola' }] })),
  );
  check('   ni una regla con SEND_MESSAGE (403 PLAN_FEATURE)', sendRule.status === 403 && (await codeOf(sendRule)) === 'PLAN_FEATURE');
  check('   nada quedo publicado', (await prisma.automationFlow.count({ where: { id: { in: [aiFlow.flowId, waFlow.flowId] }, status: 'PUBLISHED' } })) === 0);
}

// =============================================================================
console.log('\n== 8-9, 11, 13, 24. START ==');
const S = await makeWorkspace('start');
{
  await activateManualSubscription({ workspaceId: S.workspaceId, planCode: PlanCode.START, ...cli });
  const connect = (channel: string, id: string) =>
    asUser(S.session, () =>
      connectChannel(json(`/api/integrations/channels/${channel}/connect`, 'POST', { externalAccountId: id, accessToken: 'token-de-prueba-123' }), {
        params: Promise.resolve({ channel }),
      }),
    );
  const ig = await connect('instagram', `ig-s-${stamp}`);
  const fb = await connect('messenger', `fb-s-${stamp}`);
  check('8. START: 2 canales conectados (Instagram + Messenger)', ig.status === 201 && fb.status === 201, `${ig.status}/${fb.status}`);
  const again = await connect('instagram', `ig-s-${stamp}`);
  check('   reconectar un canal ya contado no suma', again.status === 201);
  const third = await connect('instagram', `ig-s2-${stamp}`);
  let waBlocked = false;
  try {
    await assertChannelConnectAllowed(S.workspaceId, { channel: 'WHATSAPP', phoneNumberId: `pn-s-${stamp}` });
  } catch (error) {
    waBlocked = isEntitlementError(error) && error.code === 'PLAN_LIMIT';
  }
  check('9. el tercer canal queda bloqueado, sea del proveedor que sea', third.status === 409 && waBlocked, `${third.status}`);

  const product = await asUser(S.session, () =>
    createProduct(json('/api/products', 'POST', { name: 'X', priceClp: 1000, type: 'PHYSICAL', inventory: 1, status: 'DRAFT' })),
  );
  let orderBlocked = false;
  try {
    await createOrder({ workspaceId: S.workspaceId, items: [{ variantId: 'no-importa', quantity: 1 }] });
  } catch (error) {
    orderBlocked = isEntitlementError(error) && error.code === 'PLAN_FEATURE';
  }
  const foreignOrder = await prisma.customerOrder.create({ data: { workspaceId: S.workspaceId, status: 'DRAFT', total: 1000, subtotal: 1000 } });
  const checkout = await asUser(S.session, () => orderCheckout(json(`/api/orders/${foreignOrder.id}/checkout`, 'POST'), { params: Promise.resolve({ id: foreignOrder.id }) }));
  const mp = await asUser(S.session, () =>
    mpConnect(json('/api/integrations/mercado-pago/connect', 'POST', { accessToken: 'TEST-0000000000000000000000', webhookSecret: 'secreto-123456', mode: 'TEST' })),
  );
  check(
    '11. START: commerce bloqueado server-side (productos, pedidos, checkout, Mercado Pago)',
    product.status === 403 && orderBlocked && checkout.status === 403 && mp.status === 403,
    `${product.status}/${checkout.status}/${mp.status}`,
  );
  const shopify = await asUser(S.session, () => shopifyConnect(new Request('http://localhost/api/integrations/shopify/connect?shop=tienda.myshopify.com')));
  check('13. Shopify en START: 403 PLAN_FEATURE', shopify.status === 403 && (await codeOf(shopify)) === 'PLAN_FEATURE');

  const ent = await getWorkspaceEntitlements(S.workspaceId);
  const contacts = await ent.usage('contacts');
  check(
    '24. can/limit/usage/remaining',
    ent.can('quotes') &&
      !ent.can('commerce.orders') &&
      ent.limit('contacts.max') === 2500 &&
      ent.limit('channels.max') === 2 &&
      (await ent.usage('channels')) === 2 &&
      (await ent.remaining('channels.max')) === 0 &&
      (await ent.remaining('contacts.max')) === 2500 - contacts,
  );

  // 26. START consume creditos de IA por el runner real (proveedor guionado).
  await activateForTests(S.workspaceId);
  await activateManualSubscription({ workspaceId: S.workspaceId, planCode: PlanCode.START, ...cli });
  const definition = await prisma.agentDefinition.findFirstOrThrow({ where: { workspaceId: S.workspaceId, key: AgentKind.SALES }, include: { versions: true } });
  const publish = await asUser(S.session, () =>
    publishAgent(json(`/api/agents/${definition.id}/publish`, 'POST', { versionId: definition.versions[0].id }), { params: Promise.resolve({ id: definition.id }) }),
  );
  check('   START publica su agente (1 de 1)', publish.status === 200, `${publish.status}`);
  const wa = await prisma.whatsAppChannel.create({
    data: { workspaceId: S.workspaceId, wabaId: `waba-s-${stamp}`, phoneNumberId: `pn-s-run-${stamp}`, displayPhoneNumber: '+56900001111', status: 'CONNECTED' },
  });
  const contact = await prisma.contact.create({ data: { workspaceId: S.workspaceId, firstName: 'Ana', lastName: 'IA', phone: '+56911112222', source: 'p0c' } });
  await grantConsent({ workspaceId: S.workspaceId, contactId: contact.id, channel: 'WHATSAPP', source: 'smoke-p0c' });
  const conversation = await prisma.conversation.create({
    data: { workspaceId: S.workspaceId, channelId: wa.id, contactId: contact.id, mode: ConversationMode.AI_ACTIVE, status: ConversationStatus.OPEN },
  });
  await prisma.message.create({
    data: { workspaceId: S.workspaceId, conversationId: conversation.id, direction: 'INBOUND', senderType: 'CONTACT', type: 'TEXT', text: 'Hola', status: 'DELIVERED' },
  });
  const before = await ent.usage('ai.credits');
  const run = await runAgent({
    workspaceId: S.workspaceId,
    conversationId: conversation.id,
    provider: new ScriptedProvider([{ text: 'Hola, te ayudo.', inputTokens: 600, outputTokens: 100 }]),
  });
  const after = await (await getWorkspaceEntitlements(S.workspaceId)).usage('ai.credits');
  check('26. START: el runner consume creditos (600 in + 100 out = 1 credito)', run.status === AgentRunStatus.COMPLETED && after - before === 1, `${run.status} ${run.skippedReason ?? ""} ${before}→${after}`);

  // 27. Limite mensual: con el cupo agotado no se inicia otra ejecucion.
  await prisma.usageCounter.upsert({
    where: { workspaceId_period_metric: { workspaceId: S.workspaceId, period: currentPeriod(), metric: 'ai_credits' } },
    create: { workspaceId: S.workspaceId, period: currentPeriod(), metric: 'ai_credits', quantity: 200 },
    update: { quantity: 200 },
  });
  const exhausted = await checkAiCredits(S.workspaceId);
  const provider = new ScriptedProvider([{ text: 'No deberia' }]);
  const blockedRun = await runAgent({ workspaceId: S.workspaceId, conversationId: conversation.id, provider });
  check(
    '27. limite mensual de IA bloquea consumo adicional',
    !exhausted.allowed && exhausted.reason === 'CREDITS_EXHAUSTED' && blockedRun.status === AgentRunStatus.ABORTED && provider.calls.length === 0,
  );

  // 28. Mes nuevo: ventana logica nueva (el contador del mes pasado queda).
  const nextMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 2));
  const fresh = await checkAiCredits(S.workspaceId, { now: nextMonth });
  await recordAiCredits({ workspaceId: S.workspaceId, provider: 'scripted', model: 'x', inputTokens: 1000, outputTokens: 0, occurredAt: nextMonth });
  const nextEnt = await getWorkspaceEntitlements(S.workspaceId, prisma, nextMonth);
  check(
    '28. mes nuevo: la ventana de uso empieza en cero',
    fresh.allowed && fresh.usedCredits === 0 && (await nextEnt.usage('ai.credits')) === 1 && (await (await getWorkspaceEntitlements(S.workspaceId)).usage('ai.credits')) === 200,
  );
}

// =============================================================================
console.log('\n== 10, 12. PRO ==');
const P = await makeWorkspace('pro');
{
  await activateManualSubscription({ workspaceId: P.workspaceId, planCode: PlanCode.PRO, ...cli });
  const product = await asUser(P.session, () =>
    createProduct(json('/api/products', 'POST', { name: 'Curso', priceClp: 9990, type: 'DIGITAL', status: 'DRAFT' })),
  );
  const variant = await makeProduct(P);
  const order = await createOrder({ workspaceId: P.workspaceId, items: [{ variantId: variant.id, quantity: 1 }] });
  let checkoutCode: string | undefined;
  try {
    await createOrderCheckout({ workspaceId: P.workspaceId, orderId: order.id });
  } catch (error) {
    checkoutCode = error instanceof CheckoutError ? error.code : isEntitlementError(error) ? error.code : 'OTRO';
  }
  check(
    '10. PRO: commerce permitido (producto 201, pedido creado, checkout pasa el plan)',
    product.status === 201 && Boolean(order.id) && checkoutCode === 'NOT_CONFIGURED',
    `${product.status} ${checkoutCode}`,
  );
  const shopify = await asUser(P.session, () => shopifyConnect(new Request('http://localhost/api/integrations/shopify/connect?shop=tienda.myshopify.com')));
  check('12. Shopify en PRO: el plan lo permite (no 403)', shopify.status !== 403, `${shopify.status}`);
}

// =============================================================================
console.log('\n== 14-19. Downgrade PRO → START y upgrade ==');
const D = await makeWorkspace('downgrade');
{
  await activateManualSubscription({ workspaceId: D.workspaceId, planCode: PlanCode.PRO, ...cli });
  const ownerMembership = await prisma.workspaceMembership.findUniqueOrThrow({ where: { userId_workspaceId: { userId: D.userId, workspaceId: D.workspaceId } } });
  // El MEMBER es MAS ANTIGUO que el OWNER: aun asi el OWNER se conserva.
  const member = await addMember(D, WorkspaceRole.MEMBER, at(-400));
  const admin = await addMember(D, WorkspaceRole.ADMIN, at(-300));

  // 4 canales (2 WhatsApp + 2 Instagram), del mas antiguo al mas nuevo.
  const ch1 = await addWhatsApp(D, at(-50));
  const ch2 = await addChannelAccount(D, at(-40));
  const ch3 = await addWhatsApp(D, at(-30));
  const ch4 = await addChannelAccount(D, at(-20));

  // 12 automatizaciones a medida (START permite 10).
  const rules = [];
  for (let i = 0; i < 12; i += 1) rules.push(await addCustomRule(D, at(-100 + i)));
  const pausedRule = await prisma.automationRule.create({
    data: { workspaceId: D.workspaceId, name: 'Pausada por el usuario', trigger: AutomationTrigger.LEAD_CREATED, isActive: false, actions: [{ type: 'ADD_TAG', tag: 'x' }] as never },
  });

  // Journeys: uno de recuperacion (PRO) publicado y otro que el usuario pausa.
  const recovery = await prisma.journey.create({
    data: { workspaceId: D.workspaceId, key: `rec-${stamp}`, name: 'Recuperar checkout', status: JourneyStatus.PUBLISHED, trigger: JourneyTrigger.CHECKOUT_ABANDONED, steps: { create: { position: 1, label: 'Tarea', action: 'CREATE_TASK' } } },
  });
  const pausedLater = await prisma.journey.create({
    data: { workspaceId: D.workspaceId, key: `rec2-${stamp}`, name: 'Recuperar 2', status: JourneyStatus.PUBLISHED, trigger: JourneyTrigger.CHECKOUT_ABANDONED, steps: { create: { position: 1, label: 'Tarea', action: 'CREATE_TASK' } } },
  });

  // 2 agentes en vivo (START permite 1).
  const salesAgent = await prisma.agentDefinition.findFirstOrThrow({ where: { workspaceId: D.workspaceId, key: AgentKind.SALES }, include: { versions: true } });
  await prisma.agentVersion.update({ where: { id: salesAgent.versions[0].id }, data: { status: AgentVersionStatus.PUBLISHED } });
  const supportAgent = await prisma.agentDefinition.create({
    data: {
      workspaceId: D.workspaceId,
      key: AgentKind.FULFILLMENT_SUPPORT,
      name: 'Soporte',
      versions: { create: { version: 1, instructions: 'Ayuda', model: 'gpt-5-mini', status: AgentVersionStatus.PUBLISHED } },
    },
  });

  const snapshot = async () => ({
    members: await prisma.workspaceMembership.count({ where: { workspaceId: D.workspaceId } }),
    channels: (await prisma.whatsAppChannel.count({ where: { workspaceId: D.workspaceId } })) + (await prisma.channelAccount.count({ where: { workspaceId: D.workspaceId } })),
    connected:
      (await prisma.whatsAppChannel.count({ where: { workspaceId: D.workspaceId, status: 'CONNECTED', accessTokenEncrypted: { not: null } } })) +
      (await prisma.channelAccount.count({ where: { workspaceId: D.workspaceId, status: 'CONNECTED', accessTokenEncrypted: { not: null } } })),
    activeRules: await prisma.automationRule.count({ where: { workspaceId: D.workspaceId, isActive: true } }),
    rules: await prisma.automationRule.count({ where: { workspaceId: D.workspaceId } }),
    journeys: await prisma.journey.count({ where: { workspaceId: D.workspaceId, status: JourneyStatus.PUBLISHED } }),
    agents: await prisma.agentDefinition.count({ where: { workspaceId: D.workspaceId, isActive: true } }),
    activeMembers: await prisma.workspaceMembership.count({ where: { workspaceId: D.workspaceId, status: MembershipStatus.ACTIVE } }),
  });
  const reconciledOnPro = await reconcileWorkspaceEntitlements(D.workspaceId);
  check('   en PRO no hay nada limitado', reconciledOnPro.skipped === null && reconciledOnPro.channels.limited === 0 && reconciledOnPro.automations.limited === 0);
  const beforeDowngrade = await snapshot();

  // --- Downgrade: la operacion de billing reconcilia sola.
  await activateManualSubscription({ workspaceId: D.workspaceId, planCode: PlanCode.START, ...cli });
  const limited = async () => ({
    channels: [
      ...(await prisma.whatsAppChannel.findMany({ where: { workspaceId: D.workspaceId, planLimitedAt: { not: null } }, select: { id: true } })),
      ...(await prisma.channelAccount.findMany({ where: { workspaceId: D.workspaceId, planLimitedAt: { not: null } }, select: { id: true } })),
    ].map((c) => c.id),
    rules: (await prisma.automationRule.findMany({ where: { workspaceId: D.workspaceId, planLimitedAt: { not: null } }, select: { id: true } })).map((r) => r.id),
    members: (await prisma.workspaceMembership.findMany({ where: { workspaceId: D.workspaceId, planLimitedAt: { not: null } }, select: { id: true } })).map((m) => m.id),
    journeys: (await prisma.journey.findMany({ where: { workspaceId: D.workspaceId, planLimitedAt: { not: null } }, select: { id: true } })).map((j) => j.id),
    agents: (await prisma.agentDefinition.findMany({ where: { workspaceId: D.workspaceId, planLimitedAt: { not: null } }, select: { id: true } })).map((a) => a.id),
  });
  const down = await limited();
  check('14. downgrade PRO → START aplicado', (await resolveSubscription(D.workspaceId)).effectivePlan === PlanCode.START);
  check(
    '15. extras planLimited: 2 canales mas nuevos, 2 reglas mas nuevas, 1 usuario, 1 agente, journeys de recuperacion',
    JSON.stringify([...down.channels].sort()) === JSON.stringify([ch3.id, ch4.id].sort()) &&
      JSON.stringify([...down.rules].sort()) === JSON.stringify([rules[10].id, rules[11].id].sort()) &&
      down.members.length === 1 &&
      JSON.stringify(down.agents) === JSON.stringify([supportAgent.id]) &&
      down.journeys.length === 2,
    JSON.stringify({ c: down.channels.length, r: down.rules.length, m: down.members.length, a: down.agents.length, j: down.journeys.length }),
  );
  check('   los mas antiguos quedan habilitados', !down.channels.includes(ch1.id) && !down.channels.includes(ch2.id) && !down.rules.includes(rules[0].id));
  const afterDowngrade = await snapshot();
  check('16. no se borro ni desconecto nada (mismo conteo, mismos estados, credenciales intactas)', JSON.stringify(afterDowngrade) === JSON.stringify(beforeDowngrade), JSON.stringify(afterDowngrade));

  // Idempotente: reconciliar de nuevo no cambia nada.
  const firstMark = await prisma.channelAccount.findUniqueOrThrow({ where: { id: ch4.id }, select: { planLimitedAt: true } });
  const again = await reconcileWorkspaceEntitlements(D.workspaceId);
  const secondMark = await prisma.channelAccount.findUniqueOrThrow({ where: { id: ch4.id }, select: { planLimitedAt: true } });
  check(
    '   reconciliar dos veces es idempotente (ni la fecha de la marca cambia)',
    again.skipped === null && again.channels.newlyLimited === 0 && again.automations.newlyLimited === 0 && firstMark.planLimitedAt?.getTime() === secondMark.planLimitedAt?.getTime(),
  );

  // 19. OWNER nunca queda limitado antes que un MEMBER (aunque el MEMBER sea mas antiguo).
  const ownerRow = await prisma.workspaceMembership.findUniqueOrThrow({ where: { id: ownerMembership.id } });
  const adminRow = await prisma.workspaceMembership.findUniqueOrThrow({ where: { id: admin.id } });
  const memberRow = await prisma.workspaceMembership.findUniqueOrThrow({ where: { id: member.id } });
  const memberAccess = resolveAccess({
    now: new Date(),
    activeWorkspaceId: D.workspaceId,
    supportSessionId: null,
    user: { id: member.userId, platformRole: 'USER' },
    membership: { role: memberRow.role, status: memberRow.status, planLimitedAt: memberRow.planLimitedAt, workspace: { id: D.workspaceId, name: 'D', slug: 'd' } },
    supportSession: null,
  });
  check(
    '19. OWNER y ADMIN conservados; el MEMBER (mas antiguo) queda limitado y sin acceso',
    ownerRow.planLimitedAt === null && adminRow.planLimitedAt === null && memberRow.planLimitedAt !== null && !memberAccess.ok && memberAccess.reason === 'MEMBERSHIP_PLAN_LIMITED',
  );

  // El usuario pausa a mano un journey limitado.
  await prisma.journey.update({ where: { id: pausedLater.id }, data: { status: JourneyStatus.PAUSED, pausedAt: new Date() } });

  // --- Upgrade
  await activateManualSubscription({ workspaceId: D.workspaceId, planCode: PlanCode.PRO, ...cli });
  const up = await limited();
  check(
    '17. upgrade START → PRO libera todo',
    up.channels.length === 0 && up.rules.length === 0 && up.members.length === 0 && up.journeys.length === 0 && up.agents.length === 0,
    JSON.stringify(up),
  );
  const pausedJourney = await prisma.journey.findUniqueOrThrow({ where: { id: pausedLater.id } });
  const pausedRuleAfter = await prisma.automationRule.findUniqueOrThrow({ where: { id: pausedRule.id } });
  const recoveryAfter = await prisma.journey.findUniqueOrThrow({ where: { id: recovery.id } });
  check(
    '18. lo pausado a mano sigue pausado tras el upgrade (el status no se toca)',
    pausedJourney.status === JourneyStatus.PAUSED && pausedJourney.planLimitedAt === null && !pausedRuleAfter.isActive && recoveryAfter.status === JourneyStatus.PUBLISHED,
  );
}

// =============================================================================
console.log('\n== 20-21. Contactos sobre el limite tras un downgrade ==');
const C = await makeWorkspace('contacts');
{
  await activateManualSubscription({ workspaceId: C.workspaceId, planCode: PlanCode.START, ...cli });
  await prisma.contact.createMany({
    data: Array.from({ length: 305 }, (_, i) => ({ workspaceId: C.workspaceId, firstName: 'C', lastName: `${i}`, source: 'p0c' })),
  });
  // Vence sin gracia (trial) → FREE efectivo: 305 contactos sobre un limite de 300.
  await prisma.workspaceSubscription.update({ where: { workspaceId: C.workspaceId }, data: { billingSource: 'TRIAL', currentPeriodEnd: at(-1) } });
  const state = await resolveSubscription(C.workspaceId);
  const list = await asUser(C.session, () => listContacts());
  const listed = ((await list.json()) as { data: unknown[] }).data.length;
  const one = await prisma.contact.findFirstOrThrow({ where: { workspaceId: C.workspaceId } });
  const edited = await asUser(C.session, () =>
    patchContact(json(`/api/contacts/${one.id}`, 'PATCH', { firstName: 'Editado' }), { params: Promise.resolve({ id: one.id }) }),
  );
  check(
    '20. sobre el limite los contactos siguen visibles y editables',
    state.effectivePlan === PlanCode.FREE && listed > 0 && edited.status === 200 && (await prisma.contact.count({ where: { workspaceId: C.workspaceId } })) === 305,
    `${state.effectivePlan} ${listed} ${edited.status}`,
  );
  const extra = await asUser(C.session, () => createContact(json('/api/contacts', 'POST', { firstName: 'Uno', lastName: 'Mas' })));
  check('21. crear otro contacto sobre el limite falla (409)', extra.status === 409);
}

// =============================================================================
console.log('\n== Carreras de cupo: solo N operaciones concurrentes tienen exito ==');
{
  const R = await makeWorkspace('races');
  await activateManualSubscription({ workspaceId: R.workspaceId, planCode: PlanCode.START, ...cli });
  const ok = (settled: PromiseSettledResult<unknown>[]) => settled.filter((r) => r.status === 'fulfilled').length;

  // Memberships: START = 2 usuarios; el OWNER ocupa 1 → cabe 1 de 4.
  const candidates = await Promise.all(
    [1, 2, 3, 4].map((n) =>
      prisma.user.create({ data: { workspaceId: R.workspaceId, name: `Cand ${n}`, email: `cand-${n}-${stamp}@p0c.test`, passwordHash: 'x' } }),
    ),
  );
  const members = await Promise.allSettled(
    candidates.map((c) => addMembershipWithinPlan({ workspaceId: R.workspaceId, userId: c.id, role: WorkspaceRole.MEMBER })),
  );
  const activeMembers = await prisma.workspaceMembership.count({ where: { workspaceId: R.workspaceId, status: MembershipStatus.ACTIVE } });
  check('Carrera memberships: 4 altas simultaneas, solo 1 entra (2/2)', ok(members) === 1 && activeMembers === 2, `${ok(members)} ${activeMembers}`);

  // Canales: START = 2 → 5 conexiones simultaneas, solo 2 entran.
  const connects = await Promise.all(
    [1, 2, 3, 4, 5].map((n) =>
      asUser(R.session, () =>
        connectChannel(json('/api/integrations/channels/instagram/connect', 'POST', { externalAccountId: `ig-race-${stamp}-${n}`, accessToken: 'token-de-prueba-123' }), {
          params: Promise.resolve({ channel: 'instagram' }),
        }),
      ),
    ),
  );
  const connected = connects.filter((r) => r.status === 201).length;
  const channelsNow = await (await getWorkspaceEntitlements(R.workspaceId)).usage('channels');
  check(
    'Carrera canales: 5 conexiones simultaneas, solo 2 entran',
    connected === 2 && channelsNow === 2 && connects.filter((r) => r.status === 409).length === 3,
    `${connected} ${channelsNow}`,
  );

  // Publicacion: START = 10 → 7 ocupadas; 6 simultaneas (3 flujos + 3 reglas) → solo 3.
  for (let i = 0; i < 7; i += 1) await addCustomRule(R, at(-10 + i));
  const drafts = await Promise.all([1, 2, 3].map((n) => createFlow(R.workspaceId, R.userId, `Carrera ${n}`, 'WHATSAPP', internalGraph)));
  const publications = await Promise.allSettled([
    ...drafts.map((flow) => saveFlow(R.workspaceId, flow.id, R.userId, { action: 'publish', versionId: flow.versions[0].id })),
    ...[1, 2, 3].map((n) =>
      asUser(R.session, () =>
        createRule(json('/api/automations/rules', 'POST', { name: `Carrera regla ${n}`, trigger: 'LEAD_CREATED', actions: [{ type: 'ADD_TAG', tag: 'c' }] })),
      ).then((r) => (r.status === 201 ? r : Promise.reject(new Error(String(r.status))))),
    ),
  ]);
  const automationsNow = await (await getWorkspaceEntitlements(R.workspaceId)).usage('automations.active');
  check(
    'Carrera automatizaciones: 6 publicaciones simultaneas, solo 3 entran (10/10)',
    ok(publications) === 3 && automationsNow === 10,
    `${ok(publications)} ${automationsNow}`,
  );

  // Agentes: START = 1 → 3 publicaciones simultaneas de agentes distintos, solo 1.
  const sales = await prisma.agentDefinition.findFirstOrThrow({ where: { workspaceId: R.workspaceId, key: AgentKind.SALES }, include: { versions: true } });
  const extra = await Promise.all(
    [AgentKind.QUOTING, AgentKind.CHECKOUT_RECOVERY].map((key) =>
      prisma.agentDefinition.create({
        data: { workspaceId: R.workspaceId, key, name: key, versions: { create: { version: 1, instructions: 'x', model: 'gpt-5-mini' } } },
        include: { versions: true },
      }),
    ),
  );
  const agentPublishes = await Promise.all(
    [sales, ...extra].map((agent) =>
      asUser(R.session, () =>
        publishAgent(json(`/api/agents/${agent.id}/publish`, 'POST', { versionId: agent.versions[0].id }), { params: Promise.resolve({ id: agent.id }) }),
      ),
    ),
  );
  const liveAgents = await (await getWorkspaceEntitlements(R.workspaceId)).usage('agents');
  check(
    'Carrera agentes: 3 publicaciones simultaneas, solo 1 entra',
    agentPublishes.filter((r) => r.status === 200).length === 1 && liveAgents === 1,
    `${liveAgents}`,
  );

  // Contactos: START = 2500 → a 2 del limite, 5 altas simultaneas, solo 2.
  const existing = await prisma.contact.count({ where: { workspaceId: R.workspaceId } });
  await prisma.contact.createMany({
    data: Array.from({ length: 2498 - existing }, (_, i) => ({ workspaceId: R.workspaceId, firstName: 'C', lastName: `${i}`, source: 'p0c' })),
  });
  const creates = await Promise.all(
    [1, 2, 3, 4, 5].map((n) => asUser(R.session, () => createContact(json('/api/contacts', 'POST', { firstName: 'Carrera', lastName: `${n}` })))),
  );
  check(
    'Carrera contactos: 5 altas simultaneas a 2 del limite, solo 2 entran',
    creates.filter((r) => r.status === 201).length === 2 && (await prisma.contact.count({ where: { workspaceId: R.workspaceId } })) === 2500,
  );
}

// =============================================================================
console.log('\n== 22-23. SUSPENDED y endpoint directo ==');
{
  await suspendSubscription({ workspaceId: P.workspaceId, ...cli, reason: 'Revision' });
  const viaProxy = await throughProxy({ user: P.session, method: 'GET', path: '/api/contacts' }, () => listContacts());
  const mutation = await throughProxy(
    { user: P.session, method: 'POST', path: '/api/contacts', body: { firstName: 'X', lastName: 'Y' } },
    (request) => createContact(request),
  );
  const me = await throughProxy({ user: P.session, method: 'GET', path: '/api/auth/me' }, () => authMe());
  let grow: EntitlementError | null = null;
  try {
    await assertCanGrow(P.workspaceId, 'contacts.max');
  } catch (error) {
    if (isEntitlementError(error)) grow = error;
  }
  const direct = await asUser(P.session, () => createContact(json('/api/contacts', 'POST', { firstName: 'Directo', lastName: 'Suspendido' })));
  const ent = await getWorkspaceEntitlements(P.workspaceId);
  check(
    '22. SUSPENDED bloquea: API 423 (lectura y escritura), gates WORKSPACE_SUSPENDED, todo en cero',
    viaProxy.status === 423 && mutation.status === 423 && grow?.code === 'WORKSPACE_SUSPENDED' && direct.status === 423 && !ent.can('commerce.orders') && ent.limit('contacts.max') === 0,
    `${viaProxy.status}/${mutation.status}/${direct.status}`,
  );
  check('    auth/estado minimo sigue disponible', me.status !== 423, `${me.status}`);
  check('    SUSPENDED no baja a FREE', (await resolveSubscription(P.workspaceId)).effectivePlan === PlanCode.PRO);
  await resumeSubscription({ workspaceId: P.workspaceId, ...cli });

  // 23. FREE llamando directo a la API (sin proxy ni UI) no evade nada.
  const product = await asUser(F.session, () => createProduct(json('/api/products', 'POST', { name: 'X', priceClp: 1, type: 'PHYSICAL', inventory: 1 })));
  const definition = await prisma.agentDefinition.findFirstOrThrow({ where: { workspaceId: F.workspaceId, key: AgentKind.SALES }, include: { versions: true } });
  const agent = await asUser(F.session, () =>
    publishAgent(json(`/api/agents/${definition.id}/publish`, 'POST', { versionId: definition.versions[0].id }), { params: Promise.resolve({ id: definition.id }) }),
  );
  const journey = await prisma.journey.findFirst({ where: { workspaceId: F.workspaceId } });
  const journeyPublish = journey
    ? await asUser(F.session, () => publishJourney(json(`/api/journeys/${journey.id}/publish`, 'POST'), { params: Promise.resolve({ id: journey.id }) }))
    : null;
  const ig = await asUser(F.session, () =>
    connectChannel(json('/api/integrations/channels/instagram/connect', 'POST', { externalAccountId: `ig-free-${stamp}`, accessToken: 'token-de-prueba-123' }), {
      params: Promise.resolve({ channel: 'instagram' }),
    }),
  );
  check(
    '23. endpoint directo no evade: FREE no crea productos, no publica agente/journey, no conecta canales',
    product.status === 403 && agent.status === 403 && (journeyPublish === null || journeyPublish.status === 403) && ig.status === 409,
    `${product.status}/${agent.status}/${journeyPublish?.status}/${ig.status}`,
  );
  check('    y el agente sigue en borrador', (await prisma.agentVersion.count({ where: { agentDefinitionId: definition.id, status: AgentVersionStatus.PUBLISHED } })) === 0);
}

// =============================================================================
console.log('\n== 25. Creditos IA en FREE ==');
{
  const free = await checkAiCredits(F.workspaceId);
  check('25. FREE: 0 creditos, la IA queda bloqueada', !free.allowed && free.limitCredits === 0);
}

// =============================================================================
console.log('\n== 29-30. 5 Minutos con Dios (SCALE + COMP) ==');
const M = await makeWorkspace('5mcd');
{
  await setWorkspaceInternal({ workspaceId: M.workspaceId, isInternal: true, ...cli, reason: 'Negocio propio' });
  await assignCompSubscription({ workspaceId: M.workspaceId, planCode: PlanCode.SCALE, ...cli, reason: 'Negocio propio' });
  const saasBefore = await prisma.workspaceSubscription.findUniqueOrThrow({ where: { workspaceId: M.workspaceId } });
  const saasPaymentsBefore = await prisma.subscriptionPayment.count({ where: { workspaceId: M.workspaceId } });

  const ent = await getWorkspaceEntitlements(M.workspaceId);
  const product = await asUser(M.session, () =>
    createProduct(json('/api/products', 'POST', { name: '5 Minutos con Dios', priceClp: 5990, type: 'DIGITAL', status: 'DRAFT' })),
  );
  const variant = await makeProduct(M);
  const order = await createOrder({ workspaceId: M.workspaceId, items: [{ variantId: variant.id, quantity: 1 }] });
  let checkoutCode: string | undefined;
  try {
    await createOrderCheckout({ workspaceId: M.workspaceId, orderId: order.id });
  } catch (error) {
    checkoutCode = error instanceof CheckoutError ? error.code : isEntitlementError(error) ? error.code : 'OTRO';
  }
  const flow = await publishNewFlow(M, internalGraph, 'Bienvenida 5MCD');
  const channel = await asUser(M.session, () =>
    connectChannel(json('/api/integrations/channels/instagram/connect', 'POST', { externalAccountId: `ig-5mcd-${stamp}`, accessToken: 'token-de-prueba-123' }), {
      params: Promise.resolve({ channel: 'instagram' }),
    }),
  );
  const ai = await checkAiCredits(M.workspaceId);
  const reconciled = await reconcileWorkspaceEntitlements(M.workspaceId);
  check(
    '29. 5MCD SCALE+COMP: productos, pedidos, checkout, automatizaciones, canales e IA',
    ent.can('commerce.orders') &&
      product.status === 201 &&
      Boolean(order.id) &&
      checkoutCode === 'NOT_CONFIGURED' &&
      flow.published &&
      channel.status === 201 &&
      ai.allowed &&
      reconciled.skipped === null &&
      reconciled.channels.limited === 0,
    `${product.status} ${checkoutCode} ${flow.published} ${channel.status} ${ai.reason}`,
  );
  const saasAfter = await prisma.workspaceSubscription.findUniqueOrThrow({ where: { workspaceId: M.workspaceId } });
  check(
    '30. commerce nunca modifica SaaS billing (suscripcion y SubscriptionPayment intactos)',
    saasAfter.updatedAt.getTime() === saasBefore.updatedAt.getTime() &&
      saasAfter.billingSource === 'COMP' &&
      (await prisma.subscriptionPayment.count({ where: { workspaceId: M.workspaceId } })) === saasPaymentsBefore,
  );
}

// =============================================================================
await crossTenantPrisma.platformAuditLog.deleteMany({ where: { targetWorkspaceId: { in: createdWorkspaces } } });
// Step 2: borrar un workspace ya no borra la cuenta global (SetNull). Se
// borran explicitamente las cuentas de prueba de estos workspaces.
const testUsers = (await prisma.workspaceMembership.findMany({ where: { workspaceId: { in: createdWorkspaces } }, select: { userId: true } })).map((m) => m.userId);
const cleaned = await crossTenantPrisma.workspace.deleteMany({ where: { id: { in: createdWorkspaces } } });
await prisma.user.deleteMany({ where: { id: { in: [...new Set(testUsers)] } } });
console.log(`\nLimpieza: ${cleaned.count} workspaces de prueba eliminados (cascade).`);

const passed = results.filter((result) => result.ok).length;
console.log(`\n== Resultado: ${passed}/${results.length} pruebas OK ==`);
await prisma.$disconnect();
if (failures > 0) process.exit(1);
