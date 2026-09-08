import {
  ConversationMode,
  MessageDirection,
  MessageSenderType,
  MessageStatus,
  MessageType,
  OutboxStatus,
  OutboxType,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { recordAudit } from '../domain/audit';
import { sendTextMessage } from './client';

/** Reintentos con espera creciente: 1, 5 y 15 minutos. */
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

export class OutboundError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'CONVERSATION_CLOSED' | 'AI_BLOCKED' | 'NO_CONSENT',
  ) {
    super(message);
    this.name = 'OutboundError';
  }
}

export type QueueMessageInput = {
  workspaceId: string;
  conversationId: string;
  text: string;
  senderType: MessageSenderType;
  senderUserId?: string | null;
  agentRunId?: string | null;
};

/**
 * Encola un mensaje saliente.
 *
 * Primero persiste el Message (QUEUED) y el OutboxEvent, y recien despues se
 * intenta el envio. Asi una llamada fallida a Meta no deja el CRM diciendo que
 * mando algo que nunca salio.
 */
export async function queueOutboundMessage(input: QueueMessageInput) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, workspaceId: input.workspaceId },
    select: { id: true, mode: true, contactId: true, channelId: true, contact: { select: { phone: true } } },
  });

  if (!conversation) {
    throw new OutboundError('Conversacion no encontrada en este workspace.', 'NOT_FOUND');
  }

  // Regla de la spec: la IA no responde cuando hay un humano a cargo.
  if (input.senderType === MessageSenderType.AI && conversation.mode === ConversationMode.HUMAN_ACTIVE) {
    throw new OutboundError('La conversacion esta tomada por un humano: la IA no responde.', 'AI_BLOCKED');
  }

  const message = await prisma.message.create({
    data: {
      workspaceId: input.workspaceId,
      conversationId: conversation.id,
      direction: MessageDirection.OUTBOUND,
      senderType: input.senderType,
      senderUserId: input.senderUserId ?? null,
      agentRunId: input.agentRunId ?? null,
      type: MessageType.TEXT,
      text: input.text,
      status: MessageStatus.QUEUED,
    },
  });

  await prisma.outboxEvent.create({
    data: {
      workspaceId: input.workspaceId,
      type: OutboxType.WHATSAPP_MESSAGE,
      // El id del mensaje ES la clave de idempotencia: un reintento del worker
      // no puede producir dos envios.
      idempotencyKey: `message:${message.id}`,
      payload: {
        messageId: message.id,
        conversationId: conversation.id,
        to: conversation.contact.phone ?? '',
        text: input.text,
      },
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastOutboundAt: new Date(), lastMessageAt: new Date() },
  });

  return message;
}

export type ProcessOutboxResult = {
  processed: number;
  sent: number;
  failed: number;
  retried: number;
};

/**
 * Procesa el outbox pendiente. En la Fase 3 lo llamara la cola durable; hoy se
 * invoca desde /api/internal/process-outbox.
 */
export async function processOutbox(limit = 20): Promise<ProcessOutboxResult> {
  const now = new Date();
  const pending = await prisma.outboxEvent.findMany({
    where: { status: OutboxStatus.PENDING, availableAt: { lte: now } },
    orderBy: { availableAt: 'asc' },
    take: limit,
  });

  const result: ProcessOutboxResult = { processed: 0, sent: 0, failed: 0, retried: 0 };

  for (const event of pending) {
    // Lock optimista: solo procesa quien logra moverlo a PROCESSING.
    const claimed = await prisma.outboxEvent.updateMany({
      where: { id: event.id, status: OutboxStatus.PENDING },
      data: { status: OutboxStatus.PROCESSING, attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue;

    result.processed += 1;
    const attempts = event.attempts + 1;
    const payload = event.payload as { messageId: string; to: string; text: string };

    try {
      const message = await prisma.message.findUnique({
        where: { id: payload.messageId },
        select: { id: true, status: true, conversation: { select: { channelId: true } } },
      });

      if (!message) {
        await markFailed(event.id, payload.messageId, 'El mensaje ya no existe.');
        result.failed += 1;
        continue;
      }

      // Idempotencia: si otra corrida ya lo envio, no se reenvia.
      if (message.status !== MessageStatus.QUEUED) {
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: OutboxStatus.SENT, processedAt: new Date() },
        });
        continue;
      }

      const channel = await prisma.whatsAppChannel.findUnique({
        where: { id: message.conversation.channelId },
        select: { phoneNumberId: true, accessTokenEncrypted: true },
      });

      if (!channel) {
        await markFailed(event.id, payload.messageId, 'El canal de WhatsApp ya no existe.');
        result.failed += 1;
        continue;
      }

      const sent = await sendTextMessage({ channel, to: payload.to, text: payload.text });

      if (sent.ok) {
        await prisma.$transaction([
          prisma.message.update({
            where: { id: payload.messageId },
            data: {
              externalMessageId: sent.externalMessageId,
              status: MessageStatus.SENT,
              sentAt: new Date(),
              errorCode: null,
              errorMessage: null,
            },
          }),
          prisma.outboxEvent.update({
            where: { id: event.id },
            data: { status: OutboxStatus.SENT, processedAt: new Date(), error: null },
          }),
        ]);
        result.sent += 1;
        continue;
      }

      if (sent.retryable && attempts < MAX_ATTEMPTS) {
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: OutboxStatus.PENDING,
            availableAt: new Date(Date.now() + RETRY_DELAYS_MS[attempts - 1]),
            error: sent.errorMessage,
          },
        });
        result.retried += 1;
        continue;
      }

      await markFailed(event.id, payload.messageId, sent.errorMessage, sent.errorCode);
      result.failed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'error desconocido';

      if (attempts < MAX_ATTEMPTS) {
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: OutboxStatus.PENDING,
            availableAt: new Date(Date.now() + RETRY_DELAYS_MS[attempts - 1]),
            error: message,
          },
        });
        result.retried += 1;
      } else {
        await markFailed(event.id, payload.messageId, message);
        result.failed += 1;
      }
    }
  }

  return result;
}

/** Estado terminal: dead letter. El mensaje queda FAILED y visible en la bandeja. */
async function markFailed(outboxId: string, messageId: string, error: string, code?: string) {
  const event = await prisma.outboxEvent.update({
    where: { id: outboxId },
    data: { status: OutboxStatus.FAILED, processedAt: new Date(), error },
  });

  await prisma.message.updateMany({
    where: { id: messageId, status: MessageStatus.QUEUED },
    data: {
      status: MessageStatus.FAILED,
      failedAt: new Date(),
      errorCode: code ?? null,
      errorMessage: error,
    },
  });

  if (event.workspaceId) {
    await recordAudit({
      workspaceId: event.workspaceId,
      action: 'whatsapp.send_failed',
      entity: 'Message',
      entityId: messageId,
      metadata: { error, code: code ?? null },
    });
  }
}

/** Reencola un mensaje fallido, desde el boton de reintento de la bandeja. */
export async function retryMessage(input: { workspaceId: string; messageId: string; actorId?: string }) {
  const message = await prisma.message.findFirst({
    where: { id: input.messageId, workspaceId: input.workspaceId, status: MessageStatus.FAILED },
    select: { id: true, text: true, conversationId: true, conversation: { select: { contact: { select: { phone: true } } } } },
  });

  if (!message) throw new OutboundError('Mensaje fallido no encontrado.', 'NOT_FOUND');

  await prisma.message.update({
    where: { id: message.id },
    data: { status: MessageStatus.QUEUED, failedAt: null, errorCode: null, errorMessage: null },
  });

  await prisma.outboxEvent.upsert({
    where: { idempotencyKey: `message:${message.id}` },
    create: {
      workspaceId: input.workspaceId,
      type: OutboxType.WHATSAPP_MESSAGE,
      idempotencyKey: `message:${message.id}`,
      payload: {
        messageId: message.id,
        conversationId: message.conversationId,
        to: message.conversation.contact.phone ?? '',
        text: message.text ?? '',
      },
    },
    update: { status: OutboxStatus.PENDING, availableAt: new Date(), attempts: 0, error: null },
  });

  return message.id;
}
