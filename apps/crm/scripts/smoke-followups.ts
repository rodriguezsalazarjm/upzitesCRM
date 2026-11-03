/**
 * Punto 7 — Seguimiento comercial configurable, contra la base de pruebas, con
 * RELOJ CONTROLADO (cada paso del motor recibe su `now`) y por las rutas reales
 * donde importa (sesion firmada, roles, aislamiento).
 *
 * Nada sale a un canal: los envios reales quedan como Message QUEUED + evento de
 * outbox, y este script NUNCA procesa el outbox. Esto valida el motor, no la
 * entrega de Meta.
 *
 *  E2E. OWNER configura -> lead consulta y no compra -> barrido lo inscribe ->
 *       pasos programados y ejecutados sin duplicar -> pago pendiente no
 *       detiene -> pago confirmado detiene -> no sale nada mas -> historial.
 *  1-20. Los casos obligatorios de la especificacion (ver cada check).
 *
 * Uso, desde apps/crm (exige TEST_DATABASE_URL con el marcador de base aislada):
 *   pnpm exec tsx scripts/smoke-followups.ts
 */
import './fixtures/test-environment';
import {
  ConsentChannel,
  ConversationMode,
  MessageDirection,
  MessageSenderType,
  OrderStatus,
  PaymentStatus,
  PlanCode,
  WhatsAppChannelStatus,
  WorkspaceRole,
} from '../generated/prisma/client';
import { crossTenantPrisma, prisma } from '../src/lib/prisma';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { assignCompSubscription } from '../src/lib/billing/subscription-admin';
import { addMembershipWithinPlan } from '../src/lib/entitlements/growth';
import { grantConsent } from '../src/lib/domain/consent';
import { encryptSecret } from '../src/lib/crypto';
import { ModelProviderError, ScriptedProvider, type ModelProvider } from '../src/lib/agents/provider';
import { advanceEnrollment, enroll } from '../src/lib/marketing/journeys';
import { processOrderPayment } from '../src/lib/commerce/payment-webhook';
import { activateHumanControl } from '../src/lib/whatsapp/human-control';
import { setFollowUpProviderForTests } from '../src/lib/followups/ai';
import { EXIT_REASON } from '../src/lib/followups/rules';
import { idempotencyKeyFor, WINDOW_BLOCK_REASON } from '../src/lib/followups/send';
import { getStrategy, runEnrollmentNow, testEnroll } from '../src/lib/followups/service';
import { stopFollowUpsOnReply } from '../src/lib/followups/stop';
import { scanFollowUpEntries } from '../src/lib/followups/triggers';
import { asUser } from './fixtures/request-context';
import { GET as listRoute, POST as createRoute } from '../src/app/api/followups/route';
import { GET as getRoute, PATCH as patchRoute } from '../src/app/api/followups/[id]/route';
import { POST as statusRoute } from '../src/app/api/followups/[id]/status/route';
import { POST as duplicateRoute } from '../src/app/api/followups/[id]/duplicate/route';
import { POST as testRoute } from '../src/app/api/followups/[id]/test/route';
import { POST as cancelRoute } from '../src/app/api/followups/enrollments/[id]/cancel/route';
import { POST as runNowRoute } from '../src/app/api/followups/enrollments/[id]/run-now/route';

process.env.PLATFORM_EMAIL_FROM = '';

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
const cli = { via: 'cli' as const, reason: 'smoke followups' };
type Session = { id: string; workspaceId: string };

// Reloj controlado: martes 10-nov-2026 12:00 en Santiago (UTC-3).
const T0 = new Date('2026-11-10T15:00:00Z');
const H = 3_600_000;
const at = (hours: number) => new Date(T0.getTime() + hours * H);

async function makeWorkspace(suffix: string) {
  const email = `owner-${suffix}-${stamp}@followups.test`;
  const created = await createCustomerWorkspace({ companyName: `followups-${suffix}-${stamp}`, ownerName: `Owner ${suffix}`, email, password: 'contrasena-de-prueba-1234' });
  createdWorkspaces.push(created.workspace.id);
  createdUsers.push(created.user.id);
  await assignCompSubscription({ workspaceId: created.workspace.id, planCode: PlanCode.SCALE, ...cli });
  const workspaceId = created.workspace.id;
  await prisma.workspaceActivation.upsert({ where: { workspaceId }, create: { workspaceId, status: 'ACTIVE', activatedAt: new Date() }, update: { status: 'ACTIVE', activatedAt: new Date() } });
  // Horario: lunes a viernes de 09:00 a 20:00 en Santiago; topes holgados para
  // que cada caso mida lo suyo.
  const policy = { timezone: 'America/Santiago', quietStartMinute: 20 * 60, quietEndMinute: 9 * 60, sendDays: [1, 2, 3, 4, 5], maxWhatsappPerDay: 10, maxConsecutiveNoReply: 10, outOfHoursBehavior: 'POSTPONE' as const };
  await prisma.messagingPolicy.upsert({ where: { workspaceId }, create: { workspaceId, ...policy }, update: policy });
  const channel = await prisma.whatsAppChannel.create({
    data: { workspaceId, wabaId: `waba-${suffix}-${stamp}`, phoneNumberId: `phone-${suffix}-${stamp}`, displayPhoneNumber: '+56900000000', status: WhatsAppChannelStatus.CONNECTED, accessTokenEncrypted: encryptSecret(`token-${stamp}`), lastHealthCheckAt: new Date(), webhookSubscribedAt: new Date() },
  });
  return { workspaceId, channelId: channel.id, session: { id: created.user.id, workspaceId } as Session };
}

async function addMember(workspaceId: string, label: string, role: WorkspaceRole): Promise<Session> {
  const user = await prisma.user.create({ data: { name: label, email: `${label}-${stamp}@followups.test`, passwordHash: 'x' } });
  createdUsers.push(user.id);
  await addMembershipWithinPlan({ workspaceId, userId: user.id, role });
  return { id: user.id, workspaceId };
}

async function makeProduct(workspaceId: string, name: string, price: number) {
  const product = await prisma.product.create({
    data: { workspaceId, name, type: 'PHYSICAL', status: 'ACTIVE', variants: { create: { name: 'Unidad', priceMinor: price, inventory: 100, isDefault: true } } },
    include: { variants: true },
  });
  return { id: product.id, variantId: product.variants[0].id, price };
}

let phoneSeq = 0;
type LeadOptions = {
  productId?: string | null;
  inquiryAt?: Date;
  outboundAt?: Date | null;
  windowEndsAt?: Date | null;
  mode?: ConversationMode;
  consent?: boolean;
};
/** Lead con conversacion de WhatsApp: consulto (`inquiryAt`) y el negocio contesto (`outboundAt`). */
async function makeLead(ws: { workspaceId: string; channelId: string }, firstName: string, options: LeadOptions = {}) {
  phoneSeq += 1;
  const inquiryAt = options.inquiryAt ?? at(-2);
  const outboundAt = options.outboundAt === undefined ? new Date(inquiryAt.getTime() + 60_000) : options.outboundAt;
  const contact = await prisma.contact.create({ data: { workspaceId: ws.workspaceId, firstName, lastName: 'Prueba', phone: `+5691${String(stamp).slice(-5)}${String(phoneSeq).padStart(2, '0')}` } });
  if (options.consent !== false) await grantConsent({ workspaceId: ws.workspaceId, contactId: contact.id, channel: ConsentChannel.WHATSAPP, source: 'smoke-followups' });
  const last = outboundAt && outboundAt > inquiryAt ? outboundAt : inquiryAt;
  const conversation = await prisma.conversation.create({
    data: {
      workspaceId: ws.workspaceId,
      channelId: ws.channelId,
      contactId: contact.id,
      productId: options.productId ?? null,
      mode: options.mode ?? ConversationMode.AI_ACTIVE,
      status: 'OPEN',
      lastInboundAt: inquiryAt,
      lastOutboundAt: outboundAt,
      lastMessageAt: last,
      customerServiceWindowEndsAt: options.windowEndsAt === undefined ? at(24 * 10) : options.windowEndsAt,
    },
  });
  await prisma.message.create({ data: { workspaceId: ws.workspaceId, conversationId: conversation.id, direction: MessageDirection.INBOUND, senderType: MessageSenderType.CONTACT, type: 'TEXT', text: '¿Cuánto cuesta y cómo lo compro?', status: 'DELIVERED', createdAt: inquiryAt } });
  if (outboundAt) {
    await prisma.message.create({ data: { workspaceId: ws.workspaceId, conversationId: conversation.id, direction: MessageDirection.OUTBOUND, senderType: MessageSenderType.AI, type: 'TEXT', text: 'Te cuento: ...', status: 'SENT', createdAt: outboundAt } });
  }
  return { contactId: contact.id, conversationId: conversation.id };
}

async function reply(workspaceId: string, conversationId: string, text: string, createdAt: Date) {
  await prisma.message.create({ data: { workspaceId, conversationId, direction: MessageDirection.INBOUND, senderType: MessageSenderType.CONTACT, type: 'TEXT', text, status: 'DELIVERED', createdAt } });
}

const jsonReq = (path: string, body?: unknown, method = 'POST') =>
  new Request(`http://localhost${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
async function body(response: Response) {
  return (await response.clone().json().catch(() => ({}))) as { code?: string; message?: string; data?: Record<string, unknown> & { id?: string } };
}

type StepSpec = { label?: string; action?: string; delayHours: number; messageMode?: 'FIXED' | 'AI'; body?: string; aiGoal?: string };
const wa = (delayHours: number, text: string, extra: Partial<StepSpec> = {}): StepSpec => ({ label: `Paso ${delayHours}h`, action: 'SEND_WHATSAPP', delayHours, messageMode: 'FIXED', body: text, ...extra });
function strategyBody(overrides: Record<string, unknown> & { steps?: StepSpec[] } = {}) {
  return {
    name: `Estrategia ${stamp}`,
    trigger: 'INQUIRY_NO_PURCHASE',
    productId: null,
    maxMessages: 3,
    minGapHours: 0,
    simulate: false,
    steps: [wa(1, 'Hola {{nombre}}, ¿pudiste revisarlo?'), wa(24, '¿Te ayudo con alguna duda?'), wa(72, 'Último mensaje por ahora.')],
    ...overrides,
  };
}

/** Crea por la ruta, activa por la ruta y fija la fecha de publicacion al reloj controlado. */
async function strategy(s: Session, overrides: Record<string, unknown> = {}) {
  const created = await asUser(s, () => createRoute(jsonReq('/api/followups', strategyBody(overrides))));
  const id = String((await body(created)).data?.id ?? '');
  const published = await asUser(s, () => statusRoute(jsonReq(`/api/followups/${id}/status`, { action: 'publish' }), params(id)));
  if (published.status !== 200) throw new Error(`no se pudo activar: ${(await body(published)).message}`);
  await prisma.journey.update({ where: { id }, data: { publishedAt: at(-48) } });
  return id;
}
const archive = (s: Session, id: string) => asUser(s, () => statusRoute(jsonReq(`/api/followups/${id}/status`, { action: 'archive' }), params(id)));
const enrollmentOf = (journeyId: string, contactId: string) => prisma.journeyEnrollment.findUniqueOrThrow({ where: { journeyId_contactId: { journeyId, contactId } } });
const runsOf = (enrollmentId: string) => prisma.journeyStepRun.findMany({ where: { enrollmentId }, orderBy: { position: 'asc' } });
const followUpMessages = (conversationId: string) => prisma.message.findMany({ where: { conversationId, direction: MessageDirection.OUTBOUND, senderType: MessageSenderType.SYSTEM }, orderBy: { createdAt: 'asc' } });
async function enrollAt(workspaceId: string, journeyId: string, lead: { contactId: string; conversationId: string }, triggeredAt: Date, now = triggeredAt) {
  const result = await enroll({ workspaceId, journeyId, contactId: lead.contactId, triggeredAt, conversationId: lead.conversationId, now });
  if (!result.enrolled) throw new Error(`no se inscribio: ${result.reason}`);
  return result.enrollmentId;
}
async function makeOrder(workspaceId: string, contactId: string, product: { variantId: string; price: number }, status: OrderStatus = OrderStatus.PENDING_PAYMENT) {
  return prisma.customerOrder.create({
    data: { workspaceId, contactId, status, currency: 'CLP', subtotal: product.price, total: product.price, lines: { create: { variantId: product.variantId, name: 'Unidad', unitPrice: product.price, quantity: 1, total: product.price } } },
  });
}
const payOrder = (workspaceId: string, orderId: string, amount: number, status: PaymentStatus, suffix: string) =>
  processOrderPayment({ orderId, externalPaymentId: `fu-${suffix}-${stamp}`, status, rawStatus: status.toLowerCase(), amount, currency: 'CLP', baseUrl: 'http://localhost', workspaceId, externalReference: orderId });

// =============================================================================
console.log('\n== Preparacion: A (OWNER/MEMBER) y B ==');
const A = await makeWorkspace('a');
const B = await makeWorkspace('b');
const memberA = await addMember(A.workspaceId, 'member-a', WorkspaceRole.MEMBER);
const actorA = { id: A.session.id, role: WorkspaceRole.OWNER, workspaceId: A.workspaceId };

try {
  const malla = await makeProduct(A.workspaceId, 'Malla de seguridad', 49990);
  const toldo = await makeProduct(A.workspaceId, 'Toldo retráctil', 89990);
  const productB = await makeProduct(B.workspaceId, 'Producto secreto de B', 1000);

  // --- 1. Creacion ----------------------------------------------------------------
  console.log('\n== 1. Creacion ==');
  const invalid = await asUser(A.session, () => createRoute(jsonReq('/api/followups', strategyBody({ steps: [wa(1, '')] }))));
  const unknownVar = await asUser(A.session, () => createRoute(jsonReq('/api/followups', strategyBody({ steps: [wa(1, 'Precio {{precio}}')] }))));
  const massAssign = await asUser(A.session, () => createRoute(jsonReq('/api/followups', { ...strategyBody(), workspaceId: B.workspaceId })));
  const foreignProduct = await asUser(A.session, () => createRoute(jsonReq('/api/followups', strategyBody({ productId: productB.id }))));
  check('1a. Validacion: sin texto, variable desconocida y mass assignment se rechazan (400); producto de otro workspace 404', invalid.status === 400 && unknownVar.status === 400 && massAssign.status === 400 && foreignProduct.status === 404, `${invalid.status}/${unknownVar.status}/${massAssign.status}/${foreignProduct.status}`);
  const draftResponse = await asUser(A.session, () => createRoute(jsonReq('/api/followups', strategyBody({ name: 'Borrador de prueba', productId: malla.id, steps: [wa(1, 'Hola {{nombre}}, ¿seguimos con {{producto}}?')] }))));
  const draftId = String((await body(draftResponse)).data?.id ?? '');
  const draft = await prisma.journey.findUniqueOrThrow({ where: { id: draftId }, include: { steps: true } });
  check('1b. Crear: nace en BORRADOR, con producto, limites y pasos guardados', draftResponse.status === 200 && draft.status === 'DRAFT' && draft.productId === malla.id && draft.maxMessages === 3 && draft.steps.length === 1 && draft.steps[0].channel === 'WHATSAPP');
  const edited = await asUser(A.session, () => patchRoute(jsonReq(`/api/followups/${draftId}`, strategyBody({ name: 'Borrador editado', steps: [wa(1, 'uno'), wa(24, 'dos')] }), 'PATCH'), params(draftId)));
  const afterEdit = await prisma.journey.findUniqueOrThrow({ where: { id: draftId }, include: { steps: { orderBy: { position: 'asc' } } } });
  check('1c. Editar un borrador reemplaza pasos y sube la version', edited.status === 200 && afterEdit.name === 'Borrador editado' && afterEdit.steps.map((s) => s.body).join(',') === 'uno,dos' && afterEdit.version === 2);
  const dup = await asUser(A.session, () => duplicateRoute(jsonReq(`/api/followups/${draftId}/duplicate`), params(draftId)));
  const dupRow = await prisma.journey.findUniqueOrThrow({ where: { id: String((await body(dup)).data?.id) }, include: { steps: true } });
  check('1d. Duplicar: copia en borrador, en modo prueba, con sus pasos', dup.status === 200 && dupRow.status === 'DRAFT' && dupRow.simulate && dupRow.steps.length === 2 && dupRow.name.endsWith('(copia)'));
  await asUser(A.session, () => statusRoute(jsonReq(`/api/followups/${draftId}/status`, { action: 'publish' }), params(draftId)));
  const editPublished = await asUser(A.session, () => patchRoute(jsonReq(`/api/followups/${draftId}`, strategyBody(), 'PATCH'), params(draftId)));
  check('1e. Una estrategia activa no se edita sin pausarla (409)', editPublished.status === 409, (await body(editPublished)).code);
  await archive(A.session, draftId);
  await archive(A.session, dupRow.id);

  // --- E2E: criterio de cierre ---------------------------------------------------------
  console.log('\n== E2E: consulta sin compra -> secuencia -> compra -> parada ==');
  const e2e = await strategy(A.session, { name: 'Consultó y no compró', productId: malla.id, steps: [wa(1, 'Hola {{nombre}}, ¿pudiste ver la {{producto}}?'), wa(24, '¿Te ayudo a decidir?'), wa(72, 'Último aviso.')] });
  const ana = await makeLead(A, 'Ana', { productId: malla.id, inquiryAt: at(-40 / 60), outboundAt: at(-39 / 60) });
  const notSettled = await makeLead(A, 'Recién', { productId: malla.id, inquiryAt: at(-10 / 60), outboundAt: null });
  const otherProduct = await makeLead(A, 'Otro', { productId: toldo.id, inquiryAt: at(-2) });
  const scan = await scanFollowUpEntries(200, T0);
  const anaEnrollment = await enrollmentOf(e2e, ana.contactId);
  const strays = await prisma.journeyEnrollment.count({ where: { journeyId: e2e, contactId: { in: [notSettled.contactId, otherProduct.contactId] } } });
  check('E2E-1. El barrido inscribe SOLO a quien consulto ese producto y lleva 30 min quieto', scan.enrolled >= 1 && strays === 0 && anaEnrollment.status === 'ACTIVE', JSON.stringify(scan));
  check('2a. Intervalo del primer paso: 1 h desde la consulta (no desde el barrido)', anaEnrollment.triggeredAt?.getTime() === at(-40 / 60).getTime() && anaEnrollment.nextRunAt?.getTime() === at(20 / 60).getTime(), anaEnrollment.nextRunAt?.toISOString());
  const early = await advanceEnrollment(anaEnrollment.id, T0);
  check('2b. Antes de tiempo no corre', early.outcome === 'NOT_DUE');
  const s1 = await advanceEnrollment(anaEnrollment.id, at(20 / 60));
  const afterS1 = await prisma.journeyEnrollment.findUniqueOrThrow({ where: { id: anaEnrollment.id } });
  const anaMsgs1 = await followUpMessages(ana.conversationId);
  const outbox1 = await prisma.outboxEvent.findUnique({ where: { idempotencyKey: idempotencyKeyFor(anaEnrollment.id, 1) } });
  check('3. Dentro del horario (martes 12:20) el paso 1 se ejecuta y registra el mensaje con variables', s1.outcome === 'DONE' && anaMsgs1.length === 1 && anaMsgs1[0].text === 'Hola Ana, ¿pudiste ver la Malla de seguridad?' && Boolean(outbox1), anaMsgs1[0]?.text ?? '');
  check('2c. Intervalo del paso 2: 24 h desde la ejecucion del paso 1', afterS1.nextRunAt?.getTime() === at(24 + 20 / 60).getTime() && afterS1.messagesSent === 1, afterS1.nextRunAt?.toISOString());
  await advanceEnrollment(anaEnrollment.id, at(24 + 20 / 60));
  const order = await makeOrder(A.workspaceId, ana.contactId, malla);
  const pending = await payOrder(A.workspaceId, order.id, malla.price, PaymentStatus.PENDING, 'pending');
  const afterPending = await prisma.journeyEnrollment.findUniqueOrThrow({ where: { id: anaEnrollment.id } });
  check('8. Pago pendiente NO cuenta como venta: la secuencia sigue', pending.handled !== undefined && afterPending.status === 'ACTIVE' && afterPending.messagesSent === 2, afterPending.status);
  const approved = await payOrder(A.workspaceId, order.id, malla.price, PaymentStatus.APPROVED, 'approved');
  const afterBuy = await prisma.journeyEnrollment.findUniqueOrThrow({ where: { id: anaEnrollment.id } });
  check('7. Compra confirmada: se detiene en el acto, con la compra vinculada y sin pasos pendientes', approved.handled && afterBuy.status === 'EXITED' && afterBuy.exitReason === EXIT_REASON.PURCHASED && afterBuy.purchaseOrderId === order.id && afterBuy.nextRunAt === null);
  const late = await advanceEnrollment(anaEnrollment.id, at(24 * 10));
  const anaMsgsEnd = await followUpMessages(ana.conversationId);
  const anaRuns = await runsOf(anaEnrollment.id);
  check('E2E-2. Despues de comprar no sale nada mas: 2 mensajes, 2 pasos registrados, sin duplicados', late.outcome === 'NOT_DUE' && anaMsgsEnd.length === 2 && anaRuns.length === 2 && new Set(anaMsgsEnd.map((m) => m.text)).size === 2);
  const detail = await getStrategy(A.workspaceId, e2e);
  const listed = await asUser(A.session, () => listRoute());
  const listedRow = ((await body(listed)).data as unknown as { id: string; stats: { purchases: number; sent: number } }[]).find((row) => row.id === e2e);
  check('E2E-3. Historial y metricas visibles: inscripcion, pasos, compra atribuida (1) y enviados (2)', detail.enrollments.some((row) => row.id === anaEnrollment.id && row.runs.length === 2) && detail.stats.purchases === 1 && detail.stats.sent === 2 && listedRow?.stats.purchases === 1);
  const rescan = await scanFollowUpEntries(200, at(48));
  check('E2E-4. Un barrido posterior no la vuelve a inscribir (una vez por estrategia)', (await prisma.journeyEnrollment.count({ where: { journeyId: e2e, contactId: ana.contactId } })) === 1, JSON.stringify(rescan));
  await archive(A.session, e2e);

  // --- 14. Idempotencia del disparador y de la secuencia equivalente ---------------
  console.log('\n== 14. Idempotencia ==');
  const s14 = await strategy(A.session, { name: 'Toldo 1', productId: toldo.id });
  const s14b = await strategy(A.session, { name: 'Toldo 2 (equivalente)', productId: toldo.id });
  await scanFollowUpEntries(200, T0);
  await scanFollowUpEntries(200, T0);
  const toldoEnrollments = await prisma.journeyEnrollment.findMany({ where: { contactId: otherProduct.contactId, status: 'ACTIVE' } });
  check('14a. Dos barridos y dos estrategias equivalentes: UNA sola secuencia activa para el contacto', toldoEnrollments.length === 1, String(toldoEnrollments.length));
  const toldoEnrollment = toldoEnrollments[0];
  await advanceEnrollment(toldoEnrollment.id, at(1));
  // El proceso "murio" despues de ejecutar el paso y antes de avanzar: vuelve a vencer el mismo paso.
  await prisma.journeyEnrollment.update({ where: { id: toldoEnrollment.id }, data: { currentPosition: 1, nextRunAt: at(1) } });
  const replay = await advanceEnrollment(toldoEnrollment.id, at(1.5));
  check('14b. Repetir un paso ya ejecutado no envia otra vez', replay.outcome === 'DONE' && (await followUpMessages(otherProduct.conversationId)).length === 1, replay.detail);
  await archive(A.session, s14);
  await archive(A.session, s14b);

  // --- Estrategia de base para los casos directos ----------------------------------
  const base = (name: string, overrides: Record<string, unknown> = {}) => strategy(A.session, { name, ...overrides });

  // --- 4. Fuera de horario ---------------------------------------------------------------
  console.log('\n== 4. Fuera de horario ==');
  const s4 = await base('Fuera de horario', { steps: [wa(1, 'Hola {{nombre}}')] });
  const l4 = await makeLead(A, 'Viernes');
  // Viernes 13-nov 19:30 local + 1 h = 20:30 (silencio) -> lunes 16-nov 09:00 local (12:00Z).
  const e4 = await enrollAt(A.workspaceId, s4, l4, new Date('2026-11-13T22:30:00Z'));
  const r4 = await prisma.journeyEnrollment.findUniqueOrThrow({ where: { id: e4 } });
  check('4a. Vence fuera de horario: se programa al proximo dia habil a la apertura', r4.nextRunAt?.toISOString() === '2026-11-16T12:00:00.000Z', r4.nextRunAt?.toISOString());
  await prisma.journeyEnrollment.update({ where: { id: e4 }, data: { nextRunAt: new Date('2026-11-14T15:00:00Z') } });
  const sat = await advanceEnrollment(e4, new Date('2026-11-14T15:00:00Z'));
  const r4b = await prisma.journeyEnrollment.findUniqueOrThrow({ where: { id: e4 } });
  check('4b. Sabado (dia no habil) con POSTPONE: se reprograma al lunes sin enviar', sat.outcome === 'RESCHEDULE' && r4b.nextRunAt?.toISOString() === '2026-11-16T12:00:00.000Z' && (await followUpMessages(l4.conversationId)).length === 0);
  await prisma.messagingPolicy.update({ where: { workspaceId: A.workspaceId }, data: { outOfHoursBehavior: 'SKIP' } });
  await prisma.journeyEnrollment.update({ where: { id: e4 }, data: { nextRunAt: new Date('2026-11-14T15:00:00Z') } });
  await advanceEnrollment(e4, new Date('2026-11-14T15:00:00Z'));
  const runs4 = await runsOf(e4);
  check('4c. Con SKIP el paso se omite con motivo y no se envia', runs4[0]?.status === 'SKIPPED' && /fuera del horario/.test(runs4[0]?.reason ?? '') && (await followUpMessages(l4.conversationId)).length === 0, runs4[0]?.reason ?? '');
  await prisma.messagingPolicy.update({ where: { workspaceId: A.workspaceId }, data: { outOfHoursBehavior: 'POSTPONE' } });

  // --- 5. Tres pasos -------------------------------------------------------------------------
  console.log('\n== 5. Tres pasos ==');
  const s5 = await base('Tres pasos', { steps: [wa(1, 'uno'), wa(24, 'dos'), wa(24, 'tres')] });
  const l5 = await makeLead(A, 'Tres');
  const e5 = await enrollAt(A.workspaceId, s5, l5, T0);
  for (const hour of [1, 25, 49]) await advanceEnrollment(e5, at(hour));
  const r5 = await prisma.journeyEnrollment.findUniqueOrThrow({ where: { id: e5 } });
  const m5 = await followUpMessages(l5.conversationId);
  const keys5 = await prisma.outboxEvent.count({ where: { workspaceId: A.workspaceId, idempotencyKey: { in: [1, 2, 3].map((p) => idempotencyKeyFor(e5, p)) } } });
  check('5. Tres pasos: tres mensajes distintos en orden, tres claves de outbox, inscripcion COMPLETED', m5.map((m) => m.text).join(',') === 'uno,dos,tres' && keys5 === 3 && r5.status === 'COMPLETED' && r5.messagesSent === 3);

  // --- 6. Respuesta (y opt-out) --------------------------------------------------------------
  console.log('\n== 6. Respuesta ==');
  const s6 = await base('Respuesta');
  const l6 = await makeLead(A, 'Responde');
  const e6 = await enrollAt(A.workspaceId, s6, l6, T0);
  await advanceEnrollment(e6, at(1));
  await reply(A.workspaceId, l6.conversationId, 'gracias, lo voy a pensar', at(2));
  await stopFollowUpsOnReply({ workspaceId: A.workspaceId, contactId: l6.contactId, text: 'gracias, lo voy a pensar' });
  const r6 = await prisma.journeyEnrollment.findUniqueOrThrow({ where: { id: e6 } });
  const after6 = await advanceEnrollment(e6, at(30));
  check('6a. Respuesta: se detiene en el acto y no envia el paso 2', r6.status === 'EXITED' && r6.exitReason === EXIT_REASON.REPLIED && after6.outcome === 'NOT_DUE' && (await followUpMessages(l6.conversationId)).length === 1);
  const l6b = await makeLead(A, 'SinGancho');
  const e6b = await enrollAt(A.workspaceId, s6, l6b, T0);
  await advanceEnrollment(e6b, at(1));
  await reply(A.workspaceId, l6b.conversationId, 'ok', at(3));
  const second6 = await advanceEnrollment(e6b, at(25));
  check('6b. Aunque el gancho no corra, el chequeo previo al paso detecta la respuesta', second6.outcome === 'EXIT' && second6.detail === EXIT_REASON.REPLIED && (await followUpMessages(l6b.conversationId)).length === 1);
  const l6c = await makeLead(A, 'Baja');
  await enrollAt(A.workspaceId, s6, l6c, T0);
  await stopFollowUpsOnReply({ workspaceId: A.workspaceId, contactId: l6c.contactId, text: 'No me escriban más por favor' });
  const r6c = await enrollmentOf(s6, l6c.contactId);
  const s6other = await base('Otra estrategia');
  const reenroll = await enroll({ workspaceId: A.workspaceId, journeyId: s6other, contactId: l6c.contactId, triggeredAt: at(5), now: at(5) });
  check('6c. Opt-out: cancela y no vuelve a entrar a ninguna estrategia', r6c.status === 'CANCELED' && r6c.exitReason === EXIT_REASON.OPTED_OUT && !reenroll.enrolled && reenroll.reason === 'OPTED_OUT');

  // --- 9. Toma humana -------------------------------------------------------------------------
  console.log('\n== 9. Toma humana ==');
  const s9 = await base('Humano');
  const l9 = await makeLead(A, 'Humano');
  const e9 = await enrollAt(A.workspaceId, s9, l9, T0);
  await advanceEnrollment(e9, at(1));
  const takeover = await activateHumanControl({ workspaceId: A.workspaceId, conversationId: l9.conversationId, assignedUserId: A.session.id });
  const r9 = await prisma.journeyEnrollment.findUniqueOrThrow({ where: { id: e9 } });
  const outbox9 = await prisma.outboxEvent.findUnique({ where: { idempotencyKey: idempotencyKeyFor(e9, 1) } });
  check('9. Toma humana: secuencia detenida y el mensaje automatico aun en cola se cancela', r9.status === 'EXITED' && r9.exitReason === EXIT_REASON.HUMAN && takeover?.cancelledAutomaticMessages === 1 && outbox9?.status === 'CANCELLED', `${r9.exitReason} / ${outbox9?.status}`);

  // --- 10. Pausa manual y 11. Desactivacion ---------------------------------------------------
  console.log('\n== 10-11. Pausa y desactivacion ==');
  const s10 = await base('Pausa');
  const l10 = await makeLead(A, 'Pausa');
  const e10 = await enrollAt(A.workspaceId, s10, l10, T0);
  const paused = await asUser(A.session, () => statusRoute(jsonReq(`/api/followups/${s10}/status`, { action: 'pause' }), params(s10)));
  const whilePaused = await advanceEnrollment(e10, at(1));
  const r10 = await prisma.journeyEnrollment.findUniqueOrThrow({ where: { id: e10 } });
  check('10a. Pausada: no escribe y conserva la inscripcion para despues', paused.status === 200 && whilePaused.outcome === 'NOT_ACTIVE' && r10.status === 'ACTIVE' && (await runsOf(e10)).length === 0 && r10.nextRunAt?.getTime() === at(2).getTime());
  await asUser(A.session, () => statusRoute(jsonReq(`/api/followups/${s10}/status`, { action: 'publish' }), params(s10)));
  const resumed = await advanceEnrollment(e10, at(2));
  check('10b. Reactivada: sigue en el mismo paso', resumed.outcome === 'DONE' && (await followUpMessages(l10.conversationId)).length === 1);
  const archived = await archive(A.session, s10);
  const r11 = await prisma.journeyEnrollment.findUniqueOrThrow({ where: { id: e10 } });
  const l11 = await makeLead(A, 'Tarde');
  const lateEnroll = await enroll({ workspaceId: A.workspaceId, journeyId: s10, contactId: l11.contactId, triggeredAt: at(3), now: at(3) });
  const afterArchive = await advanceEnrollment(e10, at(40));
  check('11. Desactivada: cancela las activas, no inscribe a nadie y no envia mas', archived.status === 200 && r11.status === 'CANCELED' && r11.exitReason === EXIT_REASON.ARCHIVED && !lateEnroll.enrolled && afterArchive.outcome === 'NOT_DUE');

  // --- 12. Maximo de intentos y separacion minima -------------------------------------------
  console.log('\n== 12. Limites ==');
  const s12 = await base('Maximo 2', { maxMessages: 2, steps: [wa(1, 'uno'), wa(1, 'dos'), wa(1, 'tres')] });
  const l12 = await makeLead(A, 'Maximo');
  const e12 = await enrollAt(A.workspaceId, s12, l12, T0);
  for (const hour of [1, 2, 3]) await advanceEnrollment(e12, at(hour));
  const r12 = await prisma.journeyEnrollment.findUniqueOrThrow({ where: { id: e12 } });
  check('12a. Maximo de mensajes aplicado en el backend: 2 enviados y sale con motivo', r12.status === 'EXITED' && r12.exitReason === EXIT_REASON.MAX_MESSAGES && (await followUpMessages(l12.conversationId)).length === 2);
  const s12b = await base('Separacion', { minGapHours: 12, steps: [wa(1, 'uno'), wa(1, 'dos')] });
  const l12b = await makeLead(A, 'Separacion');
  const e12b = await enrollAt(A.workspaceId, s12b, l12b, T0);
  await advanceEnrollment(e12b, at(1));
  const gap = await advanceEnrollment(e12b, at(2));
  const r12b = await prisma.journeyEnrollment.findUniqueOrThrow({ where: { id: e12b } });
  check('12b. Separacion minima: el paso 2 espera 12 h desde el mensaje anterior', gap.outcome === 'RESCHEDULE' && r12b.nextRunAt?.getTime() === at(13).getTime(), r12b.nextRunAt?.toISOString());
  const forged = await asUser(A.session, () => createRoute(jsonReq('/api/followups', strategyBody({ maxMessages: 50 }))));
  check('12c. Un maximo fuera de rango no se acepta ni por la API', forged.status === 400);

  // --- 13. Concurrencia --------------------------------------------------------------------------
  console.log('\n== 13. Concurrencia ==');
  const s13 = await base('Concurrencia');
  const l13 = await makeLead(A, 'Concurrente');
  const e13 = await enrollAt(A.workspaceId, s13, l13, T0);
  const race = await Promise.all(Array.from({ length: 6 }, () => advanceEnrollment(e13, at(1))));
  check('13. Seis workers a la vez: un solo paso ejecutado y un solo mensaje', race.filter((r) => r.outcome === 'DONE').length === 1 && race.filter((r) => r.outcome === 'NOT_DUE').length === 5 && (await followUpMessages(l13.conversationId)).length === 1 && (await runsOf(e13)).length === 1);

  // --- 15. Reintento seguro y 16. reinicio del worker -------------------------------------
  console.log('\n== 15-16. Reintento seguro y reinicio ==');
  const s15 = await base('Reintento');
  const l15 = await makeLead(A, 'Reintento');
  const e15 = await enrollAt(A.workspaceId, s15, l15, T0);
  // Reinicio a mitad: el worker tomo el paso (lease) y murio tras reservarlo (SENDING).
  await prisma.journeyEnrollment.update({ where: { id: e15 }, data: { nextRunAt: at(1 + 10 / 60) } });
  const step15 = await prisma.journeyStep.findFirstOrThrow({ where: { journeyId: s15, position: 1 } });
  await prisma.journeyStepRun.create({ data: { workspaceId: A.workspaceId, journeyId: s15, enrollmentId: e15, stepId: step15.id, position: 1, label: step15.label, status: 'SENDING', channel: 'WHATSAPP', text: 'Texto reservado antes del reinicio', executedAt: at(1) } });
  const duringLease = await advanceEnrollment(e15, at(1 + 5 / 60));
  check('16a. Mientras dura el lease nadie retoma el paso (no hay doble ejecucion)', duringLease.outcome === 'NOT_DUE');
  const recovered = await advanceEnrollment(e15, at(1 + 11 / 60));
  const m15 = await followUpMessages(l15.conversationId);
  check('16b. Vencido el lease, el paso se retoma desde la base con el MISMO texto reservado', recovered.outcome === 'DONE' && m15.length === 1 && m15[0].text === 'Texto reservado antes del reinicio');
  // Murio DESPUES de que el canal acepto el mensaje: se retoma con la misma clave.
  await prisma.journeyStepRun.update({ where: { enrollmentId_position: { enrollmentId: e15, position: 1 } }, data: { status: 'SENDING' } });
  await prisma.journeyEnrollment.update({ where: { id: e15 }, data: { currentPosition: 1, nextRunAt: at(2) } });
  await advanceEnrollment(e15, at(2));
  const run15 = await prisma.journeyStepRun.findUniqueOrThrow({ where: { enrollmentId_position: { enrollmentId: e15, position: 1 } } });
  check('15a. Reintento tras un envio ya aceptado: la clave de outbox devuelve el mismo mensaje (sin duplicar)', (await followUpMessages(l15.conversationId)).length === 1 && run15.status === 'SENT' && run15.messageId === m15[0].id && (await prisma.outboxEvent.count({ where: { workspaceId: A.workspaceId, idempotencyKey: idempotencyKeyFor(e15, 1) } })) === 1);
  const s15ig = await base('Instagram incierto', { steps: [{ label: 'IG', action: 'SEND_INSTAGRAM', delayHours: 1, messageMode: 'FIXED', body: 'hola por IG' }] });
  const l15ig = await makeLead(A, 'Instagram');
  const e15ig = await enrollAt(A.workspaceId, s15ig, l15ig, T0);
  const stepIg = await prisma.journeyStep.findFirstOrThrow({ where: { journeyId: s15ig, position: 1 } });
  await prisma.journeyStepRun.create({ data: { workspaceId: A.workspaceId, journeyId: s15ig, enrollmentId: e15ig, stepId: stepIg.id, position: 1, label: 'IG', status: 'SENDING', channel: 'INSTAGRAM', text: 'hola por IG', executedAt: at(1) } });
  await advanceEnrollment(e15ig, at(1));
  const runIg = await prisma.journeyStepRun.findUniqueOrThrow({ where: { enrollmentId_position: { enrollmentId: e15ig, position: 1 } } });
  check('15b. Envio directo (Instagram) con resultado incierto: FAILED sin reintentar, nunca un posible duplicado', runIg.status === 'FAILED' && /no se reintenta/.test(runIg.reason ?? '') && (await prisma.message.count({ where: { workspaceId: A.workspaceId, text: 'hola por IG' } })) === 0);

  // --- 17. Aislamiento ------------------------------------------------------------------------
  console.log('\n== 17. Aislamiento ==');
  const getB = await asUser(B.session, () => getRoute(jsonReq(`/api/followups/${s13}`, undefined, 'GET'), params(s13)));
  const patchB = await asUser(B.session, () => patchRoute(jsonReq(`/api/followups/${s13}`, strategyBody(), 'PATCH'), params(s13)));
  const statusB = await asUser(B.session, () => statusRoute(jsonReq(`/api/followups/${s13}/status`, { action: 'archive' }), params(s13)));
  const cancelB = await asUser(B.session, () => cancelRoute(jsonReq(`/api/followups/enrollments/${e12b}/cancel`), params(e12b)));
  const testB = await asUser(B.session, () => testRoute(jsonReq(`/api/followups/${s13}/test`, { contactId: l13.contactId }), params(s13)));
  const listB = (await body(await asUser(B.session, () => listRoute()))).data as unknown as { id: string }[];
  const stopB = await stopFollowUpsOnReply({ workspaceId: B.workspaceId, contactId: l12b.contactId, text: 'hola' });
  const stillActive = await prisma.journeyEnrollment.findUniqueOrThrow({ where: { id: e12b } });
  check('17. Otro workspace no lee, edita, activa, cancela ni inscribe; sus ganchos no tocan a A', getB.status === 404 && patchB.status === 404 && statusB.status === 404 && cancelB.status === 404 && testB.status === 404 && !listB.some((row) => row.id === s13) && stopB === 0 && stillActive.status === 'ACTIVE', `${getB.status}/${patchB.status}/${statusB.status}/${cancelB.status}/${testB.status}`);

  // --- 18. Roles ------------------------------------------------------------------------------
  console.log('\n== 18. Roles ==');
  const memberList = await asUser(memberA, () => listRoute());
  const memberCreate = await asUser(memberA, () => createRoute(jsonReq('/api/followups', strategyBody())));
  const memberStatus = await asUser(memberA, () => statusRoute(jsonReq(`/api/followups/${s13}/status`, { action: 'pause' }), params(s13)));
  const memberCancel = await asUser(memberA, () => cancelRoute(jsonReq(`/api/followups/enrollments/${e12b}/cancel`), params(e12b)));
  const memberRun = await asUser(memberA, () => runNowRoute(jsonReq(`/api/followups/enrollments/${e12b}/run-now`), params(e12b)));
  check('18. MEMBER ve las estrategias pero no crea, activa, pausa, cancela ni adelanta (403)', memberList.status === 200 && memberCreate.status === 403 && memberStatus.status === 403 && memberCancel.status === 403 && memberRun.status === 403);
  const ownerCancel = await asUser(A.session, () => cancelRoute(jsonReq(`/api/followups/enrollments/${e12b}/cancel`), params(e12b)));
  const r12bCanceled = await prisma.journeyEnrollment.findUniqueOrThrow({ where: { id: e12b } });
  check('18b. OWNER cancela un seguimiento puntual con motivo', ownerCancel.status === 200 && r12bCanceled.status === 'CANCELED' && r12bCanceled.exitReason === EXIT_REASON.MANUAL);

  // --- 19. Mensaje con IA -------------------------------------------------------------------
  console.log('\n== 19. IA ==');
  const s19 = await base('IA', {
    productId: malla.id,
    steps: [
      wa(1, 'Respaldo uno', { messageMode: 'AI', aiGoal: 'recordar el beneficio principal' }),
      wa(1, 'Respaldo dos', { messageMode: 'AI', aiGoal: 'ofrecer resolver dudas' }),
      wa(1, '', { messageMode: 'AI', aiGoal: 'cerrar con amabilidad' }),
    ],
  });
  const l19 = await makeLead(A, 'Ines', { productId: malla.id });
  const e19 = await enrollAt(A.workspaceId, s19, l19, T0);
  const scripted = new ScriptedProvider([{ text: 'Hola Ines, la Malla de seguridad protege a tu familia. ¿Te ayudo?' }, { text: 'Te dejo un 20% de descuento solo por hoy' }]);
  setFollowUpProviderForTests(scripted);
  await advanceEnrollment(e19, at(1));
  await advanceEnrollment(e19, at(2));
  const failing: ModelProvider = { name: 'falla', complete: async () => { throw new ModelProviderError('timeout', true); } };
  setFollowUpProviderForTests(failing);
  await advanceEnrollment(e19, at(3));
  setFollowUpProviderForTests(null);
  const runs19 = await runsOf(e19);
  const instructions = scripted.calls[0]?.instructions ?? '';
  check('19a. IA: genera con el contexto autorizado (producto, negocio, objetivo) y queda marcado', runs19[0]?.status === 'SENT' && runs19[0].aiGenerated && runs19[0].text?.startsWith('Hola Ines') === true && instructions.includes('Malla de seguridad') && instructions.includes('recordar el beneficio principal'));
  check('19b. IA: nada de otro workspace en el contexto', !instructions.includes(productB.id) && !instructions.includes('Producto secreto de B'));
  check('19c. IA inventa un descuento: se descarta y sale el texto de respaldo', runs19[1]?.status === 'SENT' && !runs19[1].aiGenerated && runs19[1].text === 'Respaldo dos' && /descuento/.test(runs19[1].reason ?? ''), runs19[1]?.reason ?? '');
  check('19d. IA sin respuesta y sin respaldo: el paso falla con motivo, no envia nada', runs19[2]?.status === 'FAILED' && /no respondió/.test(runs19[2].reason ?? '') && (await followUpMessages(l19.conversationId)).length === 2, runs19[2]?.reason ?? '');

  // --- 20. Canal o plantilla bloqueados ------------------------------------------------------
  console.log('\n== 20. Bloqueos de canal ==');
  const s20 = await base('Bloqueos', { steps: [wa(1, 'uno')] });
  const l20 = await makeLead(A, 'Ventana', { windowEndsAt: at(-1) });
  const e20 = await enrollAt(A.workspaceId, s20, l20, T0);
  await advanceEnrollment(e20, at(1));
  const r20 = await runsOf(e20);
  check('20a. Fuera de la ventana de 24 h: BLOQUEADO por plantilla, nunca texto libre', r20[0]?.status === 'BLOCKED' && r20[0].reason === WINDOW_BLOCK_REASON && (await followUpMessages(l20.conversationId)).length === 0);
  const l20b = await makeLead(A, 'Espera', { mode: ConversationMode.WAITING });
  const e20b = await enrollAt(A.workspaceId, s20, l20b, T0);
  await advanceEnrollment(e20b, at(1));
  const l20c = await makeLead(A, 'SinPermiso', { consent: false });
  const e20c = await enrollAt(A.workspaceId, s20, l20c, T0);
  await advanceEnrollment(e20c, at(1));
  const [r20b, r20c] = [await runsOf(e20b), await runsOf(e20c)];
  check('20b. Conversacion fuera de modo automatico y contacto sin consentimiento: bloqueados con motivo visible', r20b[0]?.status === 'BLOCKED' && /modo automático/.test(r20b[0].reason ?? '') && r20c[0]?.status === 'BLOCKED' && /NO_CONSENT/.test(r20c[0].reason ?? '') && (await followUpMessages(l20b.conversationId)).length === 0 && (await followUpMessages(l20c.conversationId)).length === 0);

  // --- Modo prueba ------------------------------------------------------------------------------
  console.log('\n== Modo prueba ==');
  const sSim = await base('Simulada', { simulate: true, steps: [wa(1, 'Hola {{nombre}} (prueba)'), wa(24, 'dos')] });
  const lSim = await makeLead(A, 'Simulado');
  const simEnroll = await testEnroll(actorA, sSim, lSim.contactId, T0);
  const forced = await runEnrollmentNow(actorA, simEnroll.enrollmentId, T0);
  const simRuns = await runsOf(simEnroll.enrollmentId);
  const simStats = (await getStrategy(A.workspaceId, sSim)).stats;
  check('Prueba-1. Simulada: el paso corre (adelantado), queda SIMULATED y NO crea mensaje', forced.outcome === 'DONE' && simRuns[0]?.status === 'SIMULATED' && simRuns[0].text === 'Hola Simulado (prueba)' && (await followUpMessages(lSim.conversationId)).length === 0);
  check('Prueba-2. Las metricas reales no mezclan lo simulado', simStats.sent === 0 && simStats.started === 0 && simStats.simulatedStarted === 1 && simStats.simulatedMessages === 1);
  const realRunNow = await asUser(A.session, () => runNowRoute(jsonReq(`/api/followups/enrollments/${e19}/run-now`), params(e19)));
  const realTest = await asUser(A.session, () => testRoute(jsonReq(`/api/followups/${s20}/test`, { contactId: lSim.contactId }), params(s20)));
  check('Prueba-3. Adelantar o inscribir a mano solo existe en modo prueba (409 en una real)', realRunNow.status === 409 && realTest.status === 409);

  const audits = await prisma.auditLog.groupBy({ by: ['action'], where: { workspaceId: A.workspaceId, action: { in: ['followup.created', 'followup.published', 'followup.paused', 'followup.archived', 'journey.enrolled', 'journey.exited'] } }, _count: true });
  check('Auditoria por workspace: creacion, activacion, pausa, desactivacion, inscripciones y salidas', audits.length === 6, audits.map((a) => a.action).join(','));
} finally {
  setFollowUpProviderForTests(null);
  await crossTenantPrisma.platformAuditLog.deleteMany({ where: { OR: [{ targetWorkspaceId: { in: createdWorkspaces } }, { actorUserId: { in: createdUsers } }] } });
  const memberUsers = (await prisma.workspaceMembership.findMany({ where: { workspaceId: { in: createdWorkspaces } }, select: { userId: true } })).map((m) => m.userId);
  await crossTenantPrisma.workspace.deleteMany({ where: { id: { in: createdWorkspaces } } });
  await crossTenantPrisma.user.deleteMany({ where: { id: { in: [...new Set([...createdUsers, ...memberUsers])] } } });
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n== Resultado: ${passed}/${results.length} pruebas OK ==`);
await prisma.$disconnect();
if (failures > 0) process.exit(1);
