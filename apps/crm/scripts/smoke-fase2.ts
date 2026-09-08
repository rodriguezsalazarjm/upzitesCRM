/**
 * Pruebas de aceptacion de la Fase 2 (WhatsApp e Inbox humano).
 *
 * Cubre lo que exige la spec para cerrar la fase:
 *   - un evento duplicado no duplica el mensaje
 *   - dos workspaces con numeros distintos no se cruzan
 *   - un mensaje fallido reintenta sin duplicar
 *   - un humano puede enviar y ver el estado
 *   - el takeover impide que responda la IA
 *
 * Corre contra la base real con fixtures que imitan los payloads de Meta.
 * No requiere credenciales: el envio saliente se prueba contra el outbox.
 *
 * Uso, desde apps/crm:
 *   pnpm exec tsx scripts/smoke-fase2.ts
 */
import 'dotenv/config';
import { createHmac } from 'node:crypto';
import {
  ConversationMode,
  ConversationStatus,
  MessageSenderType,
  MessageStatus,
  OutboxStatus,
  WhatsAppChannelStatus,
} from '../generated/prisma/client';
import { prisma } from '../src/lib/prisma';
import { encryptSecret, decryptSecret, isEncryptionConfigured } from '../src/lib/crypto';
import { ingestWebhookEvent, processWebhookEvent } from '../src/lib/whatsapp/inbound';
import { verifyMetaSignature } from '../src/lib/whatsapp/signature';
import { normalizeWebhookPayload } from '../src/lib/whatsapp/normalize';
import { OutboundError, processOutbox, queueOutboundMessage } from '../src/lib/whatsapp/outbound';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { inboundTextPayload, statusUpdatePayload, unsupportedEventPayload } from './fixtures/whatsapp';

const results: { name: string; ok: boolean }[] = [];
let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const stamp = Date.now();

async function makeWorkspace(key: string, phoneNumberId: string) {
  const { workspace, user } = await createCustomerWorkspace({
    companyName: `fase2-${key}-${stamp}`,
    ownerName: `Owner ${key}`,
    email: `fase2-${key}-${stamp}@upzites.test`,
    password: 'Fase2#Test1234',
  });

  const channel = await prisma.whatsAppChannel.create({
    data: {
      workspaceId: workspace.id,
      wabaId: `waba-${key}-${stamp}`,
      phoneNumberId,
      displayPhoneNumber: `5690000${key === 'a' ? '1111' : '2222'}`,
      accessTokenEncrypted: encryptSecret(`token-falso-${key}`),
      status: WhatsAppChannelStatus.CONNECTED,
    },
  });

  return { workspaceId: workspace.id, userId: user.id, channelId: channel.id, phoneNumberId };
}

/** Simula la entrega completa del webhook: ingesta idempotente + procesamiento. */
async function deliver(payload: unknown) {
  const rawBody = JSON.stringify(payload);
  const ingest = await ingestWebhookEvent(rawBody, payload);
  if (!ingest.duplicate) await processWebhookEvent(ingest.eventId);
  return ingest;
}

console.log('\n== Pruebas Fase 2 ==\n');

// --- 1. Cifrado de tokens ----------------------------------------------------
{
  check('El cifrado de integraciones esta configurado', isEncryptionConfigured());
  const secret = 'EAAG-token-de-prueba-123';
  const encrypted = encryptSecret(secret);
  check('El token cifrado no contiene el texto plano', !encrypted.includes(secret));
  check('El token se descifra correctamente', decryptSecret(encrypted) === secret);
  check('Dos cifrados del mismo token dan resultados distintos (IV aleatorio)',
    encryptSecret(secret) !== encryptSecret(secret));
}

// --- 2. Firma del webhook ----------------------------------------------------
{
  const body = JSON.stringify({ hola: 'mundo' });
  const appSecret = process.env.META_APP_SECRET ?? '';
  const valid = `sha256=${createHmac('sha256', appSecret).update(body).digest('hex')}`;

  check('Firma valida es aceptada',
    verifyMetaSignature({ rawBody: body, signatureHeader: valid }).valid);
  check('Firma invalida es rechazada',
    !verifyMetaSignature({ rawBody: body, signatureHeader: 'sha256=00ff' }).valid);
  check('Sin header de firma se rechaza',
    !verifyMetaSignature({ rawBody: body, signatureHeader: null }).valid);
  check('Un cuerpo alterado invalida la firma',
    !verifyMetaSignature({ rawBody: body + ' ', signatureHeader: valid }).valid);
}

// --- 3. Normalizacion --------------------------------------------------------
{
  const events = normalizeWebhookPayload(
    inboundTextPayload({ phoneNumberId: 'pn-x', from: '56911112222', messageId: 'wamid.X', text: 'hola' }),
  );
  check('Un mensaje entrante se normaliza a un evento', events.length === 1 && events[0].kind === 'message');

  const ignored = normalizeWebhookPayload(unsupportedEventPayload('pn-x'));
  check('Un evento no soportado no rompe la normalizacion', ignored.length === 0);

  const garbage = normalizeWebhookPayload({ cualquier: 'cosa' });
  check('Un payload desconocido devuelve lista vacia', garbage.length === 0);
}

const A = await makeWorkspace('a', `pn-a-${stamp}`);
const B = await makeWorkspace('b', `pn-b-${stamp}`);

// --- 4. Mensaje entrante -----------------------------------------------------
{
  const messageId = `wamid.A1.${stamp}`;
  await deliver(
    inboundTextPayload({
      phoneNumberId: A.phoneNumberId,
      from: '56911112222',
      messageId,
      text: 'Hola, quiero informacion',
      profileName: 'Ana Prueba',
    }),
  );

  const message = await prisma.message.findUnique({ where: { externalMessageId: messageId } });
  check('El mensaje entrante se guarda', message !== null);
  check('El mensaje queda en el workspace del numero', message?.workspaceId === A.workspaceId);

  const contact = await prisma.contact.findFirst({
    where: { workspaceId: A.workspaceId, phone: '+56911112222' },
  });
  check('Se crea el contacto desde el telefono', contact !== null);
  check('El nombre sale del perfil de WhatsApp', contact?.firstName === 'Ana');
  check('El contacto queda con fuente WhatsApp', contact?.source === 'WhatsApp');

  const consent = await prisma.contactChannelConsent.findFirst({
    where: { contactId: contact?.id, channel: 'WHATSAPP' },
  });
  check('Escribir primero otorga consentimiento de WhatsApp', consent?.status === 'GRANTED');

  const conversation = await prisma.conversation.findFirst({
    where: { workspaceId: A.workspaceId, contactId: contact?.id },
  });
  check('Se abre la conversacion', conversation?.status === ConversationStatus.OPEN);
  check('La conversacion queda esperando respuesta', conversation?.mode === ConversationMode.WAITING);
  check('Se cuenta como no leido', conversation?.unreadCount === 1);
  check('Se registra la ventana de atencion de 24h',
    conversation?.customerServiceWindowEndsAt !== null);
}

// --- 5. Idempotencia: evento duplicado --------------------------------------
{
  const messageId = `wamid.DUP.${stamp}`;
  const payload = inboundTextPayload({
    phoneNumberId: A.phoneNumberId,
    from: '56911113333',
    messageId,
    text: 'Mensaje duplicado',
  });

  const first = await deliver(payload);
  check('La primera entrega no es duplicada', !first.duplicate);

  // Meta reintrega el MISMO evento hasta 10 veces si no recibe 200 a tiempo.
  for (let i = 0; i < 9; i += 1) await deliver(payload);

  const count = await prisma.message.count({ where: { externalMessageId: messageId } });
  check('10 entregas del mismo evento producen UN solo mensaje', count === 1, `${count} mensajes`);

  const events = await prisma.webhookEvent.count({ where: { dedupeKey: { contains: messageId } } });
  check('El evento de webhook se guarda una sola vez', events === 1, `${events} eventos`);
}

// --- 6. Aislamiento entre workspaces ----------------------------------------
{
  const messageId = `wamid.B1.${stamp}`;
  await deliver(
    inboundTextPayload({
      phoneNumberId: B.phoneNumberId,
      from: '56944445555',
      messageId,
      text: 'Mensaje para el workspace B',
    }),
  );

  const message = await prisma.message.findUnique({ where: { externalMessageId: messageId } });
  check('El mensaje del numero B queda en el workspace B', message?.workspaceId === B.workspaceId);

  const leaked = await prisma.message.count({
    where: { workspaceId: A.workspaceId, externalMessageId: messageId },
  });
  check('El workspace A no ve el mensaje de B', leaked === 0);

  const conversationsA = await prisma.conversation.count({ where: { workspaceId: A.workspaceId } });
  const conversationsB = await prisma.conversation.count({ where: { workspaceId: B.workspaceId } });
  check('Cada workspace tiene sus propias conversaciones', conversationsA === 2 && conversationsB === 1,
    `A=${conversationsA} B=${conversationsB}`);

  // Un numero que no pertenece a ningun workspace no debe crear nada.
  const before = await prisma.message.count();
  await deliver(
    inboundTextPayload({
      phoneNumberId: `pn-desconocido-${stamp}`,
      from: '56999998888',
      messageId: `wamid.UNKNOWN.${stamp}`,
      text: 'Numero no registrado',
    }),
  );
  const after = await prisma.message.count();
  check('Un phoneNumberId desconocido no crea mensajes', before === after);
}

// --- 7. Envio humano y estados ----------------------------------------------
{
  const conversation = await prisma.conversation.findFirstOrThrow({
    where: { workspaceId: A.workspaceId },
    orderBy: { createdAt: 'asc' },
  });

  const message = await queueOutboundMessage({
    workspaceId: A.workspaceId,
    conversationId: conversation.id,
    text: 'Hola, gracias por escribir.',
    senderType: MessageSenderType.USER,
    senderUserId: A.userId,
  });

  check('El mensaje humano se persiste antes de enviarse', message.status === MessageStatus.QUEUED);

  const outbox = await prisma.outboxEvent.findUnique({
    where: { idempotencyKey: `message:${message.id}` },
  });
  check('Se crea el evento de outbox', outbox?.status === OutboxStatus.PENDING);

  // Sin credenciales reales, el envio falla. Lo importante es que el fallo sea
  // visible y no se pierda el mensaje.
  const processed = await processOutbox(10);
  check('El outbox procesa el pendiente', processed.processed >= 1);

  const afterSend = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
  check('Un envio sin credenciales deja el mensaje FAILED, no perdido',
    afterSend.status === MessageStatus.FAILED, `status=${afterSend.status}`);
  check('El mensaje fallido guarda el motivo', Boolean(afterSend.errorMessage));

  const outboxAfter = await prisma.outboxEvent.findUniqueOrThrow({
    where: { idempotencyKey: `message:${message.id}` },
  });
  check('El evento de outbox queda FAILED (dead letter)', outboxAfter.status === OutboxStatus.FAILED);

  // Reprocesar no debe duplicar nada.
  const again = await processOutbox(10);
  const total = await prisma.message.count({ where: { conversationId: conversation.id, direction: 'OUTBOUND' } });
  check('Reprocesar el outbox no duplica mensajes', total === 1, `${total} salientes, reprocesados=${again.processed}`);
}

// --- 8. Takeover: la IA no responde con humano activo -----------------------
{
  const conversation = await prisma.conversation.findFirstOrThrow({
    where: { workspaceId: A.workspaceId },
    orderBy: { createdAt: 'asc' },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { mode: ConversationMode.HUMAN_ACTIVE, assignedUserId: A.userId },
  });

  let blocked = false;
  try {
    await queueOutboundMessage({
      workspaceId: A.workspaceId,
      conversationId: conversation.id,
      text: 'Respuesta automatica',
      senderType: MessageSenderType.AI,
    });
  } catch (error) {
    blocked = error instanceof OutboundError && error.code === 'AI_BLOCKED';
  }
  check('Con humano activo la IA NO puede responder', blocked);

  // El humano si puede.
  const human = await queueOutboundMessage({
    workspaceId: A.workspaceId,
    conversationId: conversation.id,
    text: 'Respuesta del operador',
    senderType: MessageSenderType.USER,
    senderUserId: A.userId,
  });
  check('El humano si puede enviar con la conversacion tomada', human !== null);

  // Devuelta a la IA, vuelve a poder responder.
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { mode: ConversationMode.AI_ACTIVE },
  });
  const ai = await queueOutboundMessage({
    workspaceId: A.workspaceId,
    conversationId: conversation.id,
    text: 'Respuesta de IA',
    senderType: MessageSenderType.AI,
  });
  check('Devuelta a la IA, vuelve a poder responder', ai !== null);
}

// --- 9. Un workspace no puede enviar en la conversacion de otro -------------
{
  const conversationB = await prisma.conversation.findFirstOrThrow({
    where: { workspaceId: B.workspaceId },
  });

  let denied = false;
  try {
    await queueOutboundMessage({
      workspaceId: A.workspaceId,
      conversationId: conversationB.id,
      text: 'Mensaje cruzado',
      senderType: MessageSenderType.USER,
      senderUserId: A.userId,
    });
  } catch (error) {
    denied = error instanceof OutboundError && error.code === 'NOT_FOUND';
  }
  check('Un workspace no puede escribir en la conversacion de otro', denied);
}

// --- 10. Estados de mensaje por webhook -------------------------------------
{
  const conversation = await prisma.conversation.findFirstOrThrow({
    where: { workspaceId: A.workspaceId },
    orderBy: { createdAt: 'asc' },
  });

  // Se simula un mensaje ya enviado con id externo, para recibir sus estados.
  const externalId = `wamid.OUT.${stamp}`;
  const sent = await prisma.message.create({
    data: {
      workspaceId: A.workspaceId,
      conversationId: conversation.id,
      externalMessageId: externalId,
      direction: 'OUTBOUND',
      senderType: MessageSenderType.USER,
      text: 'Mensaje con seguimiento de estado',
      status: MessageStatus.SENT,
      sentAt: new Date(),
    },
  });

  await deliver(statusUpdatePayload({ phoneNumberId: A.phoneNumberId, messageId: externalId, status: 'delivered' }));
  let reloaded = await prisma.message.findUniqueOrThrow({ where: { id: sent.id } });
  check('El estado avanza a DELIVERED', reloaded.status === MessageStatus.DELIVERED);

  await deliver(statusUpdatePayload({ phoneNumberId: A.phoneNumberId, messageId: externalId, status: 'read' }));
  reloaded = await prisma.message.findUniqueOrThrow({ where: { id: sent.id } });
  check('El estado avanza a READ', reloaded.status === MessageStatus.READ);

  // Un `sent` que llega tarde no debe retroceder el estado.
  await deliver(statusUpdatePayload({ phoneNumberId: A.phoneNumberId, messageId: externalId, status: 'sent', timestamp: 1 }));
  reloaded = await prisma.message.findUniqueOrThrow({ where: { id: sent.id } });
  check('Un estado atrasado NO retrocede el mensaje', reloaded.status === MessageStatus.READ);

  // Un estado de otro workspace no debe aplicarse.
  await deliver(statusUpdatePayload({ phoneNumberId: B.phoneNumberId, messageId: externalId, status: 'failed', errorCode: 131047 }));
  reloaded = await prisma.message.findUniqueOrThrow({ where: { id: sent.id } });
  check('Un estado enviado por el canal de otro workspace se ignora', reloaded.status === MessageStatus.READ);
}

// --- 11. Reapertura de conversacion cerrada ---------------------------------
{
  const conversation = await prisma.conversation.findFirstOrThrow({
    where: { workspaceId: A.workspaceId },
    orderBy: { createdAt: 'asc' },
    include: { contact: true },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { status: ConversationStatus.CLOSED, closedAt: new Date() },
  });

  await deliver(
    inboundTextPayload({
      phoneNumberId: A.phoneNumberId,
      from: (conversation.contact.phone ?? '').replace('+', ''),
      messageId: `wamid.REOPEN.${stamp}`,
      text: 'Volvi a escribir',
    }),
  );

  const reopened = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
  check('Un mensaje nuevo reabre la conversacion cerrada', reopened.status === ConversationStatus.OPEN);
  check('No se crea una segunda conversacion para el mismo contacto', reopened.closedAt === null);

  const duplicates = await prisma.conversation.count({
    where: { channelId: A.channelId, contactId: conversation.contactId },
  });
  check('Sigue habiendo una sola conversacion por canal y contacto', duplicates === 1);
}

// --- Limpieza ---------------------------------------------------------------
const deleted = await prisma.workspace.deleteMany({ where: { slug: { startsWith: 'fase2-' } } });
await prisma.webhookEvent.deleteMany({ where: { dedupeKey: { contains: String(stamp) } } });
console.log(`\nLimpieza: ${deleted.count} workspaces de prueba eliminados (cascade).`);

console.log(`\n== Resultado: ${results.length - failures}/${results.length} pruebas OK ==`);
await prisma.$disconnect();
process.exit(failures > 0 ? 1 : 0);
