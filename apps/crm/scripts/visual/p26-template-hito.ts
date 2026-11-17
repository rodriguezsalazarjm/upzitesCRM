/**
 * Hito P26 (crm_pruebas, Meta SIMULADO: nada sale a internet).
 * Sync de plantillas desde la WABA → estrategia de recuperacion (checkout
 * abandonado) con plantilla en el paso → el paso vence con la ventana de 24 h
 * cerrada → sale la PLANTILLA por el outbox real (request a Graph con nombre,
 * idioma y parametros) → queda en la conversacion como TEMPLATE con el texto
 * final → webhook Meta la pausa → el siguiente paso se bloquea con el motivo,
 * sin texto libre → reintento de un fallido vuelve a salir como plantilla.
 * Lo que este hito NO prueba: una plantilla aprobada real entregada por Meta.
 * Idempotente: borra lo que crea (y devuelve a su hora el outbox ajeno pendiente).
 * Uso: NODE_OPTIONS="--require ./scripts/visual/preload.cjs" node node_modules/tsx/dist/cli.mjs scripts/visual/p26-template-hito.ts
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../src/lib/prisma';
import { createStrategy, setStrategyStatus } from '../../src/lib/followups/service';
import { runMessageStep } from '../../src/lib/followups/send';
import { processOutbox, retryMessage } from '../../src/lib/whatsapp/outbound';
import { ingestWebhookEvent, processWebhookEvent } from '../../src/lib/whatsapp/inbound';
import { syncTemplates } from '../../src/lib/whatsapp/templates';

const ok = (label: string) => console.log(`OK  ${label}`);
const run = randomBytes(4).toString('hex');
const owner = await prisma.user.findFirstOrThrow({ where: { email: 'owner-a@visual.test' }, select: { id: true, memberships: { where: { role: 'OWNER' }, select: { workspaceId: true, workspace: { select: { name: true } } } } } });
// Workspace A tiene suscripcion vigente; B es el "otro tenant" del chequeo de aislamiento.
const workspaceId = owner.memberships.find((m) => m.workspace.name.startsWith('Visual Flow A'))!.workspaceId;
const otherWorkspaceId = owner.memberships.find((m) => m.workspaceId !== workspaceId)!.workspaceId;
const actor = { id: owner.id, workspaceId, role: 'OWNER' as const };
const wabaId = `waba-p26-${run}`;
const phoneNumberId = `pn-p26-${run}`;
process.env.WHATSAPP_SYSTEM_ACCESS_TOKEN = 'p26-no-real';

// Meta simulado: lista de plantillas de la WABA y envio de mensajes.
const graphCalls: { url: string; body?: Record<string, unknown> }[] = [];
let sendFails = false;
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  if (!url.startsWith('https://graph.facebook.com/')) return originalFetch(input, init);
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
  graphCalls.push({ url, body });
  if (url.includes(`/${wabaId}/message_templates`)) {
    return Response.json({ data: [
      { id: `tpl-${run}`, name: 'recuperacion_carrito', language: 'es', status: 'APPROVED', category: 'MARKETING', components: [{ type: 'BODY', text: 'Hola {{1}}, tu {{2}} sigue reservado. ¿Te ayudo a terminar la compra?' }] },
      { id: `tpl2-${run}`, name: 'en_revision', language: 'es', status: 'PENDING', category: 'MARKETING', components: [{ type: 'BODY', text: 'Hola {{1}}' }] },
    ] });
  }
  if (url.endsWith(`/${phoneNumberId}/messages`)) {
    if (sendFails) return Response.json({ error: { code: 131000, message: 'Something went wrong' } }, { status: 500 });
    return Response.json({ messages: [{ id: `wamid.p26-${run}-${graphCalls.length}` }] });
  }
  return Response.json({ error: { code: 100 } }, { status: 400 });
}) as typeof fetch;

// El outbox procesa todo lo pendiente: lo ajeno se aparta y se devuelve al final.
const foreign = await prisma.outboxEvent.findMany({ where: { status: 'PENDING' }, select: { id: true, availableAt: true } });
await prisma.outboxEvent.updateMany({ where: { id: { in: foreign.map((e) => e.id) } }, data: { availableAt: new Date('2100-01-01') } });

const created: { channelId?: string; otherChannelId?: string; contactId?: string; journeyId?: string; productId?: string } = {};
try {
  const product = await prisma.product.create({ data: { workspaceId, name: `Malla P26 ${run}` } });
  created.productId = product.id;
  const channel = await prisma.whatsAppChannel.create({ data: { workspaceId, wabaId, phoneNumberId, displayPhoneNumber: '+56 9 0000 0026', label: `QA P26 ${run}`, status: 'CONNECTED' } });
  created.channelId = channel.id;
  const contact = await prisma.contact.create({ data: { workspaceId, firstName: 'Ana', lastName: `P26 ${run}`, phone: `+5690026${run.slice(0, 4).replace(/\D/g, '0')}` } });
  created.contactId = contact.id;
  await prisma.contactChannelConsent.create({ data: { workspaceId, contactId: contact.id, channel: 'WHATSAPP', status: 'GRANTED', grantedAt: new Date(), source: 'hito-p26' } });
  // La ultima vez que escribio fue hace 3 dias: la ventana de 24 h esta cerrada.
  const conversation = await prisma.conversation.create({
    data: { workspaceId, contactId: contact.id, channelType: 'WHATSAPP', channelId: channel.id, mode: 'AI_ACTIVE', status: 'OPEN', lastInboundAt: new Date(Date.now() - 72 * 3_600_000), customerServiceWindowEndsAt: new Date(Date.now() - 48 * 3_600_000), lastMessageAt: new Date(Date.now() - 72 * 3_600_000) } as never,
  });

  // 1. Sync: estado, idioma, categoria y cuerpo desde Meta.
  const sync = await syncTemplates(actor, channel.id);
  assert.equal(sync.synced, 2);
  const tpl = await prisma.whatsAppTemplate.findFirstOrThrow({ where: { channelId: channel.id, name: 'recuperacion_carrito' } });
  assert.equal(tpl.status, 'APPROVED');
  assert.equal(tpl.category, 'MARKETING');
  assert.deepEqual(tpl.variables, [], 'cuerpo creado fuera del CRM: variables sin asignar');
  await prisma.whatsAppTemplate.update({ where: { id: tpl.id }, data: { variables: ['nombre', 'producto'] } });
  ok('1. sync desde la WABA: estado Meta, idioma, categoría y cuerpo');

  // 2. Recuperacion con plantilla en el paso; una plantilla ajena no se acepta.
  const otherChannel = await prisma.whatsAppChannel.create({ data: { workspaceId: otherWorkspaceId, wabaId: `${wabaId}-b`, phoneNumberId: `${phoneNumberId}-b`, displayPhoneNumber: '+56 9 0000 0027', status: 'CONNECTED' } });
  created.otherChannelId = otherChannel.id;
  const otherWs = await prisma.whatsAppTemplate.create({ data: { workspaceId: otherWorkspaceId, channelId: otherChannel.id, name: 'ajena', language: 'es', category: 'MARKETING', status: 'APPROVED', body: 'x' } });
  const step = (templateId: string | null, label: string) => ({ label, action: 'SEND_WHATSAPP' as const, delayHours: 1, messageMode: 'FIXED' as const, body: 'Hola {{nombre}}, ¿seguimos?', aiGoal: '', whatsappTemplateId: templateId });
  const input = { name: `Carrito P26 ${run}`, description: '', trigger: 'CHECKOUT_ABANDONED' as const, productId: product.id, maxMessages: 3, minGapHours: 0, simulate: false, steps: [step(tpl.id, 'Recordar'), step(tpl.id, 'Segundo aviso')] };
  await assert.rejects(createStrategy(actor, { ...input, steps: [step(otherWs.id, 'x')] }), /no existe en este workspace/);
  const journey = await createStrategy(actor, input);
  created.journeyId = journey.id;
  await setStrategyStatus(actor, journey.id, 'publish').catch(async () => prisma.journey.update({ where: { id: journey.id }, data: { status: 'PUBLISHED' } }));
  const steps = await prisma.journeyStep.findMany({ where: { journeyId: journey.id }, orderBy: { position: 'asc' } });
  assert.equal(steps[0].whatsappTemplateId, tpl.id);
  ok("2. recuperación guarda la plantilla por paso; plantilla de otro workspace rechazada");

  // 3. Paso vence +24 h: sale la plantilla, no texto libre.
  const fullJourney = await prisma.journey.findUniqueOrThrow({ where: { id: journey.id } });
  const enrollment = await prisma.journeyEnrollment.create({ data: { workspaceId, journeyId: journey.id, contactId: contact.id, conversationId: conversation.id, cancelKey: `p26-${run}`, status: 'ACTIVE', nextRunAt: new Date() } as never });
  // Hora dentro del horario permitido por defecto (miercoles 15:00 Chile).
  const now = new Date('2026-11-18T18:00:00Z');
  const outcome = await runMessageStep(enrollment, fullJourney, steps[0], now);
  assert.equal(outcome.kind, 'DONE', JSON.stringify(outcome));
  const runRow = await prisma.journeyStepRun.findFirstOrThrow({ where: { enrollmentId: enrollment.id, position: 1 } });
  assert.equal(runRow.status, 'SENT');
  assert.match(runRow.reason ?? '', /con plantilla recuperacion_carrito \(es\)/);
  ok('3. recovery +24 h usa la plantilla aprobada (paso SENT, registro "con plantilla")');

  // 4. Outbox real → Graph con type=template, nombre, idioma y parametros.
  const result = await processOutbox(20);
  assert.equal(result.sent, 1, JSON.stringify(result));
  const sentCall = graphCalls.find((c) => c.url.endsWith('/messages'));
  assert.deepEqual(sentCall?.body?.template, { name: 'recuperacion_carrito', language: { code: 'es' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }, { type: 'text', text: `Malla P26 ${run}` }] }] });
  const message = await prisma.message.findFirstOrThrow({ where: { id: runRow.messageId!, workspaceId } });
  assert.equal(message.type, 'TEMPLATE');
  assert.equal(message.status, 'SENT');
  assert.equal(message.conversationId, conversation.id);
  assert.equal(message.text, `Hola Ana, tu Malla P26 ${run} sigue reservado. ¿Te ayudo a terminar la compra?`);
  ok('4. outbox envía type=template a Graph; queda en la conversación como TEMPLATE, SENT, con el texto final');

  // 5. Webhook de estado de Meta: la plantilla queda pausada.
  const webhook = { object: 'whatsapp_business_account', entry: [{ id: wabaId, changes: [{ field: 'message_template_status_update', value: { event: 'PAUSED', message_template_id: `tpl-${run}`, message_template_name: 'recuperacion_carrito', message_template_language: 'es', reason: 'NONE' } }] }] };
  const raw = JSON.stringify(webhook);
  const ingested = await ingestWebhookEvent(raw, webhook);
  await processWebhookEvent(ingested.eventId);
  assert.equal((await prisma.whatsAppTemplate.findUniqueOrThrow({ where: { id: tpl.id } })).status, 'PAUSED');
  const spoof = { ...webhook, entry: [{ ...webhook.entry[0], id: 'waba-ajena' }] };
  spoof.entry[0].changes[0].value.event = 'APPROVED';
  const spoofed = await ingestWebhookEvent(JSON.stringify(spoof), spoof);
  await processWebhookEvent(spoofed.eventId);
  assert.equal((await prisma.whatsAppTemplate.findUniqueOrThrow({ where: { id: tpl.id } })).status, 'PAUSED', 'otra WABA no cambia el estado');
  ok('5. webhook message_template_status_update → PAUSED; una WABA ajena no lo cambia');

  // 6. Fallback: plantilla pausada → paso bloqueado con motivo claro, nada encolado.
  // El tope de frecuencia del workspace frenaria el 2.º envio al mismo contacto: se limpia para probar la plantilla.
  const clearCaps = () => prisma.contactSendLog.deleteMany({ where: { contactId: contact.id, workspaceId } });
  await clearCaps();
  const before = await prisma.message.count({ where: { conversationId: conversation.id } });
  const blocked = await runMessageStep(enrollment, fullJourney, steps[1], now);
  assert.equal(blocked.kind, 'SKIPPED', JSON.stringify(blocked));
  const blockedRun = await prisma.journeyStepRun.findFirstOrThrow({ where: { enrollmentId: enrollment.id, position: 2 } });
  assert.equal(blockedRun.status, 'BLOCKED');
  assert.match(blockedRun.reason ?? '', /plantilla «recuperacion_carrito» no está aprobada por Meta \(Pausada por Meta\)/);
  assert.equal(await prisma.message.count({ where: { conversationId: conversation.id } }), before, 'no sale texto libre');
  ok(`6. fallback: "${blockedRun.reason}"`);

  // 7. Reintento de una plantilla fallida: vuelve a salir como plantilla.
  await prisma.whatsAppTemplate.update({ where: { id: tpl.id }, data: { status: 'APPROVED' } });
  await prisma.journeyStepRun.deleteMany({ where: { enrollmentId: enrollment.id, position: 2 } });
  await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { lastMessageAt: null } });
  sendFails = true;
  await clearCaps();
  await runMessageStep(await prisma.journeyEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } }), fullJourney, steps[1], now);
  for (let i = 0; i < 4; i += 1) {
    await prisma.outboxEvent.updateMany({ where: { workspaceId, status: 'PENDING', id: { notIn: foreign.map((e) => e.id) } }, data: { availableAt: new Date() } });
    await processOutbox(20);
  }
  const second = await prisma.journeyStepRun.findFirstOrThrow({ where: { enrollmentId: enrollment.id, position: 2 } });
  const failedMsg = await prisma.message.findFirstOrThrow({ where: { id: second.messageId!, workspaceId } });
  assert.equal(failedMsg.status, 'FAILED');
  sendFails = false;
  graphCalls.length = 0;
  await retryMessage({ workspaceId, messageId: failedMsg.id });
  await processOutbox(20);
  assert.equal(graphCalls.at(-1)?.body?.type, 'template');
  assert.equal((await prisma.message.findUniqueOrThrow({ where: { id: failedMsg.id } })).status, 'SENT');
  ok('7. reintento de un envío fallido sale otra vez como plantilla, no como texto');
} finally {
  globalThis.fetch = originalFetch;
  for (const e of foreign) await prisma.outboxEvent.updateMany({ where: { id: e.id, status: 'PENDING' }, data: { availableAt: e.availableAt } });
  if (created.journeyId) {
    await prisma.journeyStepRun.deleteMany({ where: { journeyId: created.journeyId } });
    await prisma.journeyEnrollment.deleteMany({ where: { journeyId: created.journeyId } });
    await prisma.contactSendLog.deleteMany({ where: { journeyId: created.journeyId } });
    await prisma.journey.delete({ where: { id: created.journeyId } });
  }
  if (created.contactId) {
    const convs = await prisma.conversation.findMany({ where: { contactId: created.contactId }, select: { id: true } });
    const msgs = await prisma.message.findMany({ where: { conversationId: { in: convs.map((c) => c.id) } }, select: { id: true } });
    for (const m of msgs) await prisma.outboxEvent.deleteMany({ where: { workspaceId, payload: { path: ['messageId'], equals: m.id } } });
    await prisma.contact.delete({ where: { id: created.contactId } });
  }
  await prisma.webhookEvent.deleteMany({ where: { provider: 'whatsapp', payload: { path: ['entry', '0', 'changes', '0', 'value', 'message_template_id'], equals: `tpl-${run}` } } }).catch(() => undefined);
  if (created.channelId) await prisma.whatsAppChannel.delete({ where: { id: created.channelId } });
  if (created.otherChannelId) await prisma.whatsAppChannel.delete({ where: { id: created.otherChannelId } });
  if (created.productId) await prisma.product.delete({ where: { id: created.productId } });
  await prisma.$disconnect();
}
console.log('Hito P26 local: 7/7. Falta una plantilla aprobada real entregada por Meta.');
