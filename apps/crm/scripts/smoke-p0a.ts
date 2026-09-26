/**
 * P0-A: operador de plataforma, estado de suscripcion unico y freno de consumo.
 *
 * Tres garantias que no pueden romperse:
 *  1. Un usuario normal (aunque sea OWNER) no es operador de plataforma ni ve
 *     datos de otros workspaces en su vista de operacion.
 *  2. La interfaz y los limites responden lo mismo sobre "esta al dia" (antes
 *     un ACTIVE vencido seguia consumiendo con la app bloqueada).
 *  3. Un workspace vencido no gasta en segundo plano: ni IA, ni mensajes por
 *     canal, ni WhatsApp encolado, ni emails. Uno en gracia si.
 *
 * Uso, desde apps/crm (exige TEST_DATABASE_URL con el marcador de base aislada):
 *   pnpm exec tsx scripts/smoke-p0a.ts
 */
import './fixtures/test-environment';
import {
  AgentRunStatus,
  ConversationMode,
  ConversationStatus,
  JobStatus,
  JobType,
  MessageStatus,
  OutboxStatus,
  WhatsAppChannelStatus,
} from '../generated/prisma/client';
import { prisma } from '../src/lib/prisma';
import { createCustomerWorkspace, getSubscriptionStatus } from '../src/lib/subscription';
import { activateForTests } from './fixtures/workspace';
import { isPlatformAdmin } from '../src/lib/platform-admin';
import { getPlatformOpsSummary, getWorkspaceOperations } from '../src/lib/ops-data';
import { checkAllowance, getEntitlements, hasCapability } from '../src/lib/billing/usage';
import { canWorkspaceConsume } from '../src/lib/billing/subscription-access';
import { runAgent } from '../src/lib/agents/runner';
import { ScriptedProvider } from '../src/lib/agents/provider';
import { sendChannelMessage } from '../src/lib/channels/outbound';
import { processOutbox, queueOutboundMessage } from '../src/lib/whatsapp/outbound';
import { sendEmail } from '../src/lib/email/send';

const results: { name: string; ok: boolean }[] = [];
let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const stamp = Date.now();
const DAY = 1000 * 60 * 60 * 24;

async function makeWorkspace(suffix: string) {
  const created = await createCustomerWorkspace({
    companyName: `p0a-${suffix}-${stamp}`,
    ownerName: 'Owner',
    email: `owner-${suffix}-${stamp}@p0a.test`,
    password: 'contrasena-de-prueba-1234',
  });
  await activateForTests(created.workspace.id);

  // Pagado y vigente al empezar: lo encolado "antes de vencer" nace valido.
  await prisma.workspaceSubscription.updateMany({
    where: { workspaceId: created.workspace.id },
    data: { status: 'ACTIVE', trialEndsAt: null, renewsAt: new Date(Date.now() + 20 * DAY) },
  });

  const channel = await prisma.whatsAppChannel.create({
    data: {
      workspaceId: created.workspace.id,
      wabaId: `waba-${suffix}-${stamp}`,
      phoneNumberId: `phone-${suffix}-${stamp}`,
      displayPhoneNumber: `+5690${suffix === 'a' ? '1' : suffix === 'b' ? '2' : '3'}000000`,
      status: WhatsAppChannelStatus.CONNECTED,
    },
  });

  const agent = await prisma.agentDefinition.findFirstOrThrow({
    where: { workspaceId: created.workspace.id },
    include: { versions: true },
  });
  await prisma.agentVersion.update({
    where: { id: agent.versions[0].id },
    data: { status: 'PUBLISHED', publishedAt: new Date() },
  });

  const contact = await prisma.contact.create({
    data: {
      workspaceId: created.workspace.id,
      firstName: 'Cliente',
      lastName: suffix.toUpperCase(),
      email: `cliente-${suffix}-${stamp}@p0a.test`,
      phone: `+5698${suffix === 'a' ? '1' : suffix === 'b' ? '2' : '3'}111111`,
    },
  });

  // El cliente escribio y acepto WhatsApp: sin eso ningun envio pasaria la
  // puerta de consentimiento y la prueba no mediria la suscripcion.
  await prisma.contactChannelConsent.create({
    data: {
      workspaceId: created.workspace.id,
      contactId: contact.id,
      channel: 'WHATSAPP',
      status: 'GRANTED',
      grantedAt: new Date(),
      source: 'smoke-p0a',
    },
  });

  const conversation = await prisma.conversation.create({
    data: {
      workspaceId: created.workspace.id,
      channelId: channel.id,
      contactId: contact.id,
      mode: ConversationMode.AI_ACTIVE,
      status: ConversationStatus.OPEN,
      customerServiceWindowEndsAt: new Date(Date.now() + DAY),
    },
  });

  return {
    workspaceId: created.workspace.id,
    userId: created.user.id,
    contactId: contact.id,
    conversationId: conversation.id,
    agentVersionId: agent.versions[0].id,
  };
}

async function setRenewal(workspaceId: string, daysFromNow: number) {
  await prisma.workspaceSubscription.updateMany({
    where: { workspaceId },
    data: { status: 'ACTIVE', trialEndsAt: null, renewsAt: new Date(Date.now() + daysFromNow * DAY) },
  });
}

const A = await makeWorkspace('a'); // vigente
const B = await makeWorkspace('b'); // vencera hace 30 dias
const C = await makeWorkspace('c'); // en gracia

// =============================================================================
console.log('\n== Operador de plataforma ==');
{
  check('Un OWNER no es operador de plataforma', !(await isPlatformAdmin(A.userId)));

  await prisma.platformAdmin.create({ data: { userId: A.userId, note: 'smoke p0a' } });
  check('Concedido por tabla, pasa a serlo', await isPlatformAdmin(A.userId));
  check('Y no contagia a otro usuario', !(await isPlatformAdmin(B.userId)));

  await prisma.platformAdmin.deleteMany({ where: { userId: A.userId } });
  check('Revocado, deja de serlo en la siguiente consulta', !(await isPlatformAdmin(A.userId)));
}

// =============================================================================
console.log('\n== Aislamiento de la vista de operacion ==');
{
  const secret = `dato-privado-de-B-${stamp}`;
  await prisma.job.create({
    data: {
      workspaceId: B.workspaceId,
      type: JobType.SEND_EMAIL,
      payload: {},
      status: JobStatus.DEAD,
      lastError: secret,
      dedupeKey: `p0a-dead-${stamp}`,
    },
  });
  await prisma.outboxEvent.create({
    data: {
      workspaceId: B.workspaceId,
      type: 'WHATSAPP_MESSAGE',
      payload: {},
      status: OutboxStatus.FAILED,
      idempotencyKey: `p0a-outbox-${stamp}`,
    },
  });

  const opsA = await getWorkspaceOperations(A.workspaceId);
  check(
    'A no ve los trabajos muertos de B',
    !opsA.deadJobs.some((job) => job.lastError === secret),
  );
  check('A no cuenta los envios fallidos de B', opsA.failedOutbox === 0, `failedOutbox=${opsA.failedOutbox}`);
  check(
    'A no ve la auditoria de B',
    opsA.auditLogs.every((log) => log.workspaceId === A.workspaceId),
  );

  const opsB = await getWorkspaceOperations(B.workspaceId);
  check('B si ve su propio trabajo muerto', opsB.deadJobs.some((job) => job.lastError === secret));

  const platform = await getPlatformOpsSummary();
  check('La vista de plataforma si ve el de B (es global)', platform.deadJobs.some((job) => job.lastError === secret));
}

// =============================================================================
console.log('\n== Estado de suscripcion: una sola respuesta ==');
await setRenewal(B.workspaceId, -30);
await setRenewal(C.workspaceId, -2);
{
  for (const [label, ws, expected] of [
    ['vigente', A, true],
    ['ACTIVE vencido hace 30 dias', B, false],
    ['en gracia (vencio hace 2 dias)', C, true],
  ] as const) {
    const ui = await getSubscriptionStatus(ws.workspaceId);
    const entitlements = await getEntitlements(ws.workspaceId);
    const contacts = await checkAllowance({ workspaceId: ws.workspaceId, metric: 'contacts' });
    check(`${label}: la interfaz dice ${expected ? 'activo' : 'vencido'}`, ui.isActive === expected, ui.state);
    check(`${label}: los limites dicen lo mismo`, entitlements?.active === expected, entitlements?.state);
    check(`${label}: checkAllowance coincide`, contacts.allowed === expected);
    check(`${label}: hasCapability coincide`, (await hasCapability(ws.workspaceId, 'WHATSAPP')) === expected);
    check(`${label}: el freno de consumo coincide`, (await canWorkspaceConsume(ws.workspaceId)) === expected);
  }

  const grace = await getSubscriptionStatus(C.workspaceId);
  check('En gracia el estado es GRACE con fecha de corte', grace.state === 'GRACE' && grace.graceEndsAt !== null);
}

// =============================================================================
console.log('\n== Sin consumo en segundo plano con la suscripcion vencida ==');
{
  const agentB = await runAgent({
    workspaceId: B.workspaceId,
    conversationId: B.conversationId,
    provider: new ScriptedProvider([{ text: 'no deberia salir' }]),
  });
  check(
    'Agente IA: vencido no corre',
    agentB.status === AgentRunStatus.ABORTED && agentB.skippedReason === 'la suscripcion no esta vigente',
    agentB.skippedReason,
  );

  const simulatorB = await runAgent({
    workspaceId: B.workspaceId,
    conversationId: B.conversationId,
    agentVersionId: B.agentVersionId,
    dryRun: true,
    provider: new ScriptedProvider([{ text: 'no deberia salir' }]),
  });
  check(
    'Simulador del agente: vencido tampoco gasta IA',
    simulatorB.status === AgentRunStatus.ABORTED && simulatorB.skippedReason === 'la suscripcion no esta vigente',
    simulatorB.skippedReason,
  );

  const agentC = await runAgent({
    workspaceId: C.workspaceId,
    conversationId: C.conversationId,
    provider: new ScriptedProvider([{ text: 'Hola, te ayudo.' }]),
  });
  check(
    'Agente IA: en gracia no lo frena la suscripcion',
    agentC.skippedReason !== 'la suscripcion no esta vigente',
    `${agentC.status} ${agentC.skippedReason ?? ''}`,
  );

  let channelError = '';
  try {
    await sendChannelMessage({ workspaceId: B.workspaceId, conversationId: B.conversationId, text: 'hola' });
  } catch (error) {
    channelError = error instanceof Error ? error.message : String(error);
  }
  check('Envio por canal: vencido se rechaza', channelError.includes('no está vigente'), channelError);

  const emailB = await sendEmail({
    workspaceId: B.workspaceId,
    contactId: B.contactId,
    subject: 'Prueba',
    bodyText: 'Prueba',
  });
  check(
    'Email: vencido no se envia',
    emailB.status === 'SKIPPED' && emailB.reason === 'SUBSCRIPTION_INACTIVE',
    JSON.stringify(emailB),
  );

  const emailA = await sendEmail({
    workspaceId: A.workspaceId,
    contactId: A.contactId,
    subject: 'Prueba',
    bodyText: 'Prueba',
  });
  check(
    'Email: vigente no lo frena la suscripcion',
    !(emailA.status === 'SKIPPED' && emailA.reason === 'SUBSCRIPTION_INACTIVE'),
    JSON.stringify(emailA),
  );
}

// =============================================================================
console.log('\n== WhatsApp encolado antes de vencer ==');
{
  // D vence DESPUES de encolar: es el caso de journeys y acciones programadas.
  const D = await makeWorkspace('d');
  const queued = await queueOutboundMessage({
    workspaceId: D.workspaceId,
    conversationId: D.conversationId,
    origin: 'HUMAN',
    text: 'Encolado cuando estaba al dia',
    senderType: 'USER',
    senderUserId: D.userId,
  });
  await setRenewal(D.workspaceId, -30);

  await processOutbox(200);

  const message = await prisma.message.findUniqueOrThrow({ where: { id: queued.id } });
  check(
    'Al procesar la cola no sale: queda fallido por suscripcion',
    message.status === MessageStatus.FAILED && message.errorCode === 'SUBSCRIPTION_INACTIVE',
    `${message.status} ${message.errorCode ?? ''}`,
  );

  const outbox = await prisma.outboxEvent.findFirstOrThrow({
    where: { workspaceId: D.workspaceId, payload: { path: ['messageId'], equals: queued.id } },
  });
  check('Y el evento no queda pendiente para reintentar', outbox.status === OutboxStatus.FAILED, outbox.status);
}

// --- Limpieza ---------------------------------------------------------------
const deleted = await prisma.workspace.deleteMany({ where: { slug: { startsWith: 'p0a-' } } });
console.log(`\nLimpieza: ${deleted.count} workspaces de prueba eliminados (cascade).`);

console.log(`\n== Resultado: ${results.length - failures}/${results.length} pruebas OK ==`);
await prisma.$disconnect();
process.exit(failures > 0 ? 1 : 0);
