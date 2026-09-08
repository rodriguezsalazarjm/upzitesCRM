import {
  ActivityType,
  ConsentChannel,
  ConsentStatus,
  ConversationMode,
  ConversationStatus,
  MessageDirection,
  MessageSenderType,
  MessageStatus,
  WebhookEventStatus,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { cancelForContact } from '../domain';
import { recordAudit } from '../domain/audit';
import {
  dedupeKeyFor,
  normalizeWebhookPayload,
  toE164,
  type NormalizedEvent,
  type NormalizedInboundMessage,
  type NormalizedStatusUpdate,
} from './normalize';

export const PROVIDER = 'whatsapp';

/** Ventana de atencion al cliente de WhatsApp: 24 horas desde el ultimo entrante. */
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type IngestResult = {
  eventId: string;
  duplicate: boolean;
  events: number;
};

/**
 * Paso 1 del webhook: persistir el evento crudo de forma idempotente.
 *
 * El webhook no debe procesar nada aqui — solo guardar y responder 200 rapido.
 * Si el evento ya existe (Meta reintenta), se devuelve `duplicate: true` y no
 * se vuelve a encolar.
 */
export async function ingestWebhookEvent(rawBody: string, parsed: unknown): Promise<IngestResult> {
  const events = normalizeWebhookPayload(parsed);
  const dedupeKey = dedupeKeyFor(events, rawBody);

  const existing = await prisma.webhookEvent.findUnique({
    where: { provider_dedupeKey: { provider: PROVIDER, dedupeKey } },
    select: { id: true },
  });

  if (existing) {
    return { eventId: existing.id, duplicate: true, events: events.length };
  }

  try {
    const created = await prisma.webhookEvent.create({
      data: {
        provider: PROVIDER,
        dedupeKey,
        externalId: events[0]?.kind === 'message' ? events[0].externalMessageId : null,
        payload: parsed as never,
        status: events.length > 0 ? WebhookEventStatus.PENDING : WebhookEventStatus.IGNORED,
      },
    });
    return { eventId: created.id, duplicate: false, events: events.length };
  } catch {
    // Carrera con otra entrega del mismo evento: el unique gano en la otra
    // request. Se trata como duplicado, que es lo que es.
    const raced = await prisma.webhookEvent.findUnique({
      where: { provider_dedupeKey: { provider: PROVIDER, dedupeKey } },
      select: { id: true },
    });
    if (raced) return { eventId: raced.id, duplicate: true, events: events.length };
    throw new Error('No se pudo persistir el evento de webhook.');
  }
}

/**
 * Paso 2: procesar un evento ya persistido.
 *
 * En la Fase 3 lo llamara un consumidor de cola. Por ahora se invoca justo
 * despues de guardar, pero la separacion ya esta hecha: el webhook nunca
 * depende de que esto termine.
 */
export async function processWebhookEvent(eventId: string) {
  const event = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
  if (!event || event.status === WebhookEventStatus.PROCESSED) {
    return { processed: 0, skipped: true };
  }

  await prisma.webhookEvent.update({
    where: { id: event.id },
    data: { status: WebhookEventStatus.PROCESSING, attempts: { increment: 1 } },
  });

  try {
    const events = normalizeWebhookPayload(event.payload);
    let processed = 0;

    for (const normalized of events) {
      const done = await applyEvent(normalized);
      if (done) processed += 1;
    }

    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: WebhookEventStatus.PROCESSED, processedAt: new Date(), error: null },
    });

    return { processed, skipped: false };
  } catch (error) {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: WebhookEventStatus.FAILED,
        error: error instanceof Error ? error.message : 'error desconocido',
      },
    });
    throw error;
  }
}

async function applyEvent(event: NormalizedEvent) {
  return event.kind === 'message' ? applyInboundMessage(event) : applyStatusUpdate(event);
}

/**
 * Resuelve el workspace por `phoneNumberId`.
 *
 * Regla de seguridad de la spec: NUNCA se toma el workspace de un campo del
 * payload. El unico vinculo confiable es el numero, que se registro al conectar
 * el canal.
 */
async function resolveChannel(phoneNumberId: string) {
  return prisma.whatsAppChannel.findUnique({
    where: { phoneNumberId },
    select: { id: true, workspaceId: true, status: true },
  });
}

async function applyInboundMessage(event: NormalizedInboundMessage) {
  const channel = await resolveChannel(event.phoneNumberId);
  if (!channel) return false;

  // Idempotencia a nivel de mensaje: si ya existe ese id externo, no se duplica
  // aunque el evento completo llegue con otra clave.
  const existing = await prisma.message.findUnique({
    where: { externalMessageId: event.externalMessageId },
    select: { id: true },
  });
  if (existing) return false;

  const phone = toE164(event.from);

  const contactId = await prisma.$transaction(async (tx) => {
    const contact = await upsertContactByPhone(tx, {
      workspaceId: channel.workspaceId,
      phone,
      profileName: event.profileName,
    });

    const now = event.timestamp;
    const conversation = await tx.conversation.upsert({
      where: { channelId_contactId: { channelId: channel.id, contactId: contact.id } },
      create: {
        workspaceId: channel.workspaceId,
        channelId: channel.id,
        contactId: contact.id,
        mode: ConversationMode.WAITING,
        status: ConversationStatus.OPEN,
        lastInboundAt: now,
        lastMessageAt: now,
        customerServiceWindowEndsAt: new Date(now.getTime() + SERVICE_WINDOW_MS),
        unreadCount: 1,
      },
      update: {
        // Un entrante reabre la conversacion cerrada en vez de crear otra.
        status: ConversationStatus.OPEN,
        closedAt: null,
        lastInboundAt: now,
        lastMessageAt: now,
        customerServiceWindowEndsAt: new Date(now.getTime() + SERVICE_WINDOW_MS),
        unreadCount: { increment: 1 },
      },
    });

    await tx.message.create({
      data: {
        workspaceId: channel.workspaceId,
        conversationId: conversation.id,
        externalMessageId: event.externalMessageId,
        direction: MessageDirection.INBOUND,
        senderType: MessageSenderType.CONTACT,
        type: event.type,
        text: event.text,
        payload: event.payload as never,
        status: MessageStatus.DELIVERED,
        sentAt: now,
        deliveredAt: now,
      },
    });

    await tx.contact.update({
      where: { id: contact.id },
      data: { lastActivityAt: now },
    });

    return contact.id;
  });

  // El contacto respondio: se cancelan sus seguimientos pendientes. Va fuera de
  // la transaccion porque es un efecto secundario: si falla, el mensaje ya esta
  // guardado y una accion de mas es preferible a perder el mensaje.
  await cancelForContact({
    workspaceId: channel.workspaceId,
    contactId,
    reason: 'el contacto respondio',
    types: ['FOLLOW_UP', 'CHECKOUT_RECOVERY'],
  });

  return true;
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Busca o crea el contacto a partir del telefono.
 *
 * No se usa `upsert` porque `phone` no es unico en el esquema: un workspace
 * puede tener dos contactos con el mismo telefono cargados a mano. Se toma el
 * mas antiguo para no fragmentar el historial.
 */
async function upsertContactByPhone(
  tx: Tx,
  input: { workspaceId: string; phone: string; profileName?: string },
) {
  const existing = await tx.contact.findFirst({
    where: { workspaceId: input.workspaceId, phone: input.phone },
    orderBy: { createdAt: 'asc' },
  });

  if (existing) return existing;

  const parts = (input.profileName ?? '').trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? 'Contacto';
  const lastName = parts.slice(1).join(' ') || 'WhatsApp';

  const contact = await tx.contact.create({
    data: {
      workspaceId: input.workspaceId,
      firstName,
      lastName,
      phone: input.phone,
      source: 'WhatsApp',
      tags: ['whatsapp'],
      lastActivityAt: new Date(),
    },
  });

  // Escribir primero es consentimiento suficiente para responder por ese canal.
  // No habilita marketing: eso requiere un opt-in explicito aparte.
  await tx.contactChannelConsent.create({
    data: {
      workspaceId: input.workspaceId,
      contactId: contact.id,
      channel: ConsentChannel.WHATSAPP,
      status: ConsentStatus.GRANTED,
      source: 'inbound-message',
      evidence: { reason: 'el contacto inicio la conversacion' },
      grantedAt: new Date(),
    },
  });

  await tx.activity.create({
    data: {
      workspaceId: input.workspaceId,
      contactId: contact.id,
      type: ActivityType.NOTE,
      title: 'Nuevo contacto desde WhatsApp',
      description: input.profileName ? `Perfil: ${input.profileName}` : undefined,
    },
  });

  return contact;
}

async function applyStatusUpdate(event: NormalizedStatusUpdate) {
  const channel = await resolveChannel(event.phoneNumberId);
  if (!channel) return false;

  const message = await prisma.message.findUnique({
    where: { externalMessageId: event.externalMessageId },
    select: { id: true, workspaceId: true, status: true },
  });

  // Solo se aceptan estados de mensajes del propio workspace del canal.
  if (!message || message.workspaceId !== channel.workspaceId) return false;

  // Los estados solo avanzan: un `sent` que llega tarde no pisa un `read`.
  const ORDER: Record<string, number> = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };
  if (event.status !== MessageStatus.FAILED && ORDER[event.status] <= ORDER[message.status]) {
    return false;
  }

  await prisma.message.update({
    where: { id: message.id },
    data: {
      status: event.status,
      sentAt: event.status === MessageStatus.SENT ? event.timestamp : undefined,
      deliveredAt: event.status === MessageStatus.DELIVERED ? event.timestamp : undefined,
      readAt: event.status === MessageStatus.READ ? event.timestamp : undefined,
      failedAt: event.status === MessageStatus.FAILED ? event.timestamp : undefined,
      errorCode: event.errorCode,
      errorMessage: event.errorMessage,
    },
  });

  if (event.status === MessageStatus.FAILED) {
    await recordAudit({
      workspaceId: channel.workspaceId,
      action: 'whatsapp.message_failed',
      entity: 'Message',
      entityId: message.id,
      metadata: { errorCode: event.errorCode ?? null, errorMessage: event.errorMessage ?? null },
    });
  }

  return true;
}
