import {
  ConversationMode,
  MessageDirection,
  MessageSenderType,
  MessageStatus,
  MessageType,
  OutboxStatus,
  OutboxType,
  Prisma,
} from '../../../generated/prisma/client';
import { recordAudit } from '../domain/audit';
import { prisma } from '../prisma';
import { sendTextMessage } from './client';
import { queuePushSafely } from '../push/events';
import {
  inferOutboundOrigin,
  isOriginCompatibleWithSender,
  type OutboundOrigin,
  type OutboxMessagePayload,
  pausesOnHumanTakeover,
  shouldCancelAutomaticSend,
} from './outbound-policy';

const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
export const TAKEOVER_CANCEL_REASON = 'Cancelado porque una persona tomó la conversación.';

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
  origin: OutboundOrigin;
  idempotencyKey?: string;
  senderUserId?: string | null;
  agentRunId?: string | null;
};

export async function lockConversation(
  tx: Prisma.TransactionClient,
  conversationId: string,
  workspaceId: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "conversations"
    WHERE "id" = ${conversationId} AND "workspace_id" = ${workspaceId}
    FOR UPDATE
  `;
  return rows.length > 0;
}

/**
 * Persiste el mensaje y el outbox bajo el mismo bloqueo de fila que takeover.
 * La automatización no puede validar AI_ACTIVE y encolarse después de la toma.
 */
export async function queueOutboundMessage(input: QueueMessageInput) {
  if (!isOriginCompatibleWithSender(input.origin, input.senderType)) {
    throw new Error('La procedencia del mensaje no coincide con su remitente.');
  }
  return prisma.$transaction(async (tx) => {
    if (!(await lockConversation(tx, input.conversationId, input.workspaceId))) {
      throw new OutboundError('Conversacion no encontrada en este workspace.', 'NOT_FOUND');
    }

    const conversation = await tx.conversation.findFirst({
      where: { id: input.conversationId, workspaceId: input.workspaceId },
      select: {
        id: true,
        mode: true,
        status: true,
        lockVersion: true,
        customerServiceWindowEndsAt: true,
        contact: {
          select: {
            phone: true,
            consents: {
              where: { channel: 'WHATSAPP' },
              select: { status: true },
              take: 1,
            },
          },
        },
        channel: { select: { status: true } },
      },
    });

    if (!conversation) {
      throw new OutboundError('Conversacion no encontrada en este workspace.', 'NOT_FOUND');
    }
    if (conversation.status === 'CLOSED') {
      throw new OutboundError('La conversacion esta cerrada.', 'CONVERSATION_CLOSED');
    }
    if (!conversation.channel || conversation.channel.status !== 'CONNECTED') {
      throw new OutboundError(
        'El canal de WhatsApp requiere atencion antes de enviar.',
        'CONVERSATION_CLOSED',
      );
    }
    if (!conversation.contact.phone) {
      throw new OutboundError('El contacto no tiene un telefono de WhatsApp.', 'NOT_FOUND');
    }
    if (conversation.contact.consents[0]?.status !== 'GRANTED') {
      throw new OutboundError('El contacto no autorizo respuestas por WhatsApp.', 'NO_CONSENT');
    }
    if (
      input.senderType === MessageSenderType.USER &&
      (!conversation.customerServiceWindowEndsAt ||
        conversation.customerServiceWindowEndsAt <= new Date())
    ) {
      throw new OutboundError(
        'La ventana de 24 horas termino. Debes usar una plantilla aprobada para volver a contactar.',
        'CONVERSATION_CLOSED',
      );
    }
    if (pausesOnHumanTakeover(input.origin) && conversation.mode !== ConversationMode.AI_ACTIVE) {
      throw new OutboundError(
        'La conversación está a cargo de una persona: la respuesta automática no se enviará.',
        'AI_BLOCKED',
      );
    }

    if (input.idempotencyKey) {
      const existingEvent = await tx.outboxEvent.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { workspaceId: true, payload: true },
      });
      if (existingEvent) {
        const existingPayload = existingEvent.payload as Partial<OutboxMessagePayload>;
        const existingMessage = existingPayload.messageId
          ? await tx.message.findFirst({
              where: { id: existingPayload.messageId, workspaceId: input.workspaceId },
            })
          : null;
        if (
          existingEvent.workspaceId !== input.workspaceId ||
          existingPayload.conversationId !== conversation.id ||
          !existingMessage
        ) {
          throw new Error('La clave de idempotencia ya pertenece a otro envío.');
        }
        if (
          existingMessage.status === MessageStatus.FAILED ||
          existingMessage.status === MessageStatus.CANCELLED
        ) {
          throw new OutboundError(
            'El intento anterior no se envió. Reinténtalo desde la conversación.',
            'CONVERSATION_CLOSED',
          );
        }
        return existingMessage;
      }
    }

    const message = await tx.message.create({
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
    const payload: OutboxMessagePayload = {
      messageId: message.id,
      conversationId: conversation.id,
      to: conversation.contact.phone,
      text: input.text,
      origin: input.origin,
      conversationLockVersion: conversation.lockVersion,
    };

    await tx.outboxEvent.create({
      data: {
        workspaceId: input.workspaceId,
        type: OutboxType.WHATSAPP_MESSAGE,
        idempotencyKey: input.idempotencyKey ?? `message:${message.id}`,
        payload,
      },
    });
    await tx.conversation.update({
      where: { id: conversation.id, workspaceId: input.workspaceId },
      data: { lastOutboundAt: new Date(), lastMessageAt: new Date() },
    });
    return message;
  });
}

export type ProcessOutboxResult = {
  processed: number;
  sent: number;
  failed: number;
  retried: number;
  cancelled: number;
};

type PreparedSend = {
  kind: 'READY';
  channelId: string;
  payload: OutboxMessagePayload;
  origin: OutboundOrigin;
};
type SkippedSend = { kind: 'SKIPPED'; cancelled: boolean };

/**
 * Reserva el envío en una transacción corta. SENDING es el límite a partir del
 * cual la llamada a Meta puede empezar y ya no se puede cancelar.
 */
async function prepareSend(
  outboxId: string,
  workspaceId: string | null,
  payload: OutboxMessagePayload,
): Promise<PreparedSend | SkippedSend> {
  if (!workspaceId) return { kind: 'SKIPPED', cancelled: false };

  return prisma.$transaction(async (tx) => {
    if (!(await lockConversation(tx, payload.conversationId, workspaceId))) {
      await markFailedWithClient(tx, outboxId, payload.messageId, 'La conversación ya no existe.');
      return { kind: 'SKIPPED', cancelled: false };
    }
    const event = await tx.outboxEvent.findFirst({
      where: { id: outboxId, workspaceId, status: OutboxStatus.PROCESSING },
      select: { id: true },
    });
    if (!event) return { kind: 'SKIPPED', cancelled: true };

    const message = await tx.message.findFirst({
      where: { id: payload.messageId, workspaceId },
      select: {
        id: true,
        status: true,
        senderType: true,
        conversation: { select: { id: true, mode: true, lockVersion: true, channelId: true } },
      },
    });
    if (!message || message.conversation.id !== payload.conversationId) {
      await markFailedWithClient(tx, outboxId, payload.messageId, 'El mensaje ya no existe.');
      return { kind: 'SKIPPED', cancelled: false };
    }

    if (message.status !== MessageStatus.QUEUED) {
      const cancelled = message.status === MessageStatus.CANCELLED;
      const failed = message.status === MessageStatus.FAILED;
      await tx.outboxEvent.update({
        where: { id: outboxId },
        data: {
          status: cancelled
            ? OutboxStatus.CANCELLED
            : failed
              ? OutboxStatus.FAILED
              : OutboxStatus.SENT,
          processedAt: new Date(),
        },
      });
      return { kind: 'SKIPPED', cancelled };
    }

    const origin = inferOutboundOrigin(payload, message.senderType);
    if (
      shouldCancelAutomaticSend({
        origin,
        queuedLockVersion: payload.conversationLockVersion,
        currentLockVersion: message.conversation.lockVersion,
        conversationMode: message.conversation.mode,
      })
    ) {
      await cancelWithClient(tx, outboxId, message.id);
      return { kind: 'SKIPPED', cancelled: true };
    }

    const reserved = await tx.outboxEvent.updateMany({
      where: { id: outboxId, status: OutboxStatus.PROCESSING },
      data: { status: OutboxStatus.SENDING },
    });
    if (reserved.count === 0) return { kind: 'SKIPPED', cancelled: true };
    await tx.message.updateMany({
      where: { id: message.id, status: MessageStatus.QUEUED },
      data: { status: MessageStatus.SENDING },
    });

    if (!message.conversation.channelId) {
      // Este pipeline es exclusivo de WhatsApp; una conversacion de otro canal
      // nunca deberia llegar aqui (queueOutboundMessage ya lo habria rechazado).
      await markFailedWithClient(tx, outboxId, payload.messageId, 'La conversación no tiene canal de WhatsApp.');
      return { kind: 'SKIPPED', cancelled: false };
    }

    return { kind: 'READY', channelId: message.conversation.channelId, payload, origin };
  });
}

/** Procesa eventos pendientes sin mantener una transacción durante la red. */
export async function processOutbox(limit = 20): Promise<ProcessOutboxResult> {
  const pending = await prisma.outboxEvent.findMany({
    where: { status: OutboxStatus.PENDING, availableAt: { lte: new Date() } },
    orderBy: { availableAt: 'asc' },
    take: limit,
  });
  const result: ProcessOutboxResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    retried: 0,
    cancelled: 0,
  };

  for (const event of pending) {
    const claimed = await prisma.outboxEvent.updateMany({
      where: { id: event.id, status: OutboxStatus.PENDING },
      data: { status: OutboxStatus.PROCESSING, attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue;

    result.processed += 1;
    const attempts = event.attempts + 1;
    const payload = event.payload as OutboxMessagePayload;

    try {
      const prepared = await prepareSend(event.id, event.workspaceId, payload);
      if (prepared.kind === 'SKIPPED') {
        if (prepared.cancelled) result.cancelled += 1;
        else result.failed += 1;
        continue;
      }

      const channel = await prisma.whatsAppChannel.findFirst({
        where: { id: prepared.channelId, workspaceId: event.workspaceId ?? undefined },
        select: { id: true, workspaceId: true, phoneNumberId: true, accessTokenEncrypted: true },
      });
      if (!channel) {
        await markFailed(event.id, payload.messageId, 'El canal de WhatsApp ya no existe.');
        result.failed += 1;
        continue;
      }

      const sent = await sendTextMessage({ channel, to: payload.to, text: payload.text });
      if (sent.ok) {
        await prisma.$transaction([
          prisma.message.updateMany({
            where: { id: payload.messageId, status: MessageStatus.SENDING },
            data: {
              externalMessageId: sent.externalMessageId,
              status: MessageStatus.SENT,
              sentAt: new Date(),
              errorCode: null,
              errorMessage: null,
            },
          }),
          prisma.outboxEvent.updateMany({
            where: { id: event.id, status: OutboxStatus.SENDING },
            data: { status: OutboxStatus.SENT, processedAt: new Date(), error: null },
          }),
        ]);
        result.sent += 1;
        continue;
      }

      if (sent.retryable && attempts < MAX_ATTEMPTS) {
        const retry = await retryOrCancel(
          event.id,
          event.workspaceId,
          payload,
          prepared.origin,
          attempts,
          sent.errorMessage,
        );
        result[retry] += 1;
        continue;
      }

      if (sent.errorCode === '190' || sent.errorCode === '401' || sent.errorCode === '403') {
        await prisma.$transaction([
          prisma.whatsAppChannel.update({
            where: { id: channel.id },
            data: { status: 'NEEDS_ATTENTION' },
          }),
          prisma.integration.updateMany({
            where: { workspaceId: channel.workspaceId, provider: 'WHATSAPP' },
            data: { status: 'NEEDS_ATTENTION' },
          }),
        ]);
      }
      await markFailed(event.id, payload.messageId, sent.errorMessage, sent.errorCode);
      result.failed += 1;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'error desconocido';
      const current = await prisma.outboxEvent.findUnique({
        where: { id: event.id },
        select: { status: true },
      });
      if (current?.status === OutboxStatus.CANCELLED) {
        result.cancelled += 1;
      } else if (attempts < MAX_ATTEMPTS) {
        const sender = await prisma.message.findUnique({
          where: { id: payload.messageId },
          select: { senderType: true },
        });
        const retry = await retryOrCancel(
          event.id,
          event.workspaceId,
          payload,
          inferOutboundOrigin(payload, sender?.senderType ?? 'SYSTEM'),
          attempts,
          errorMessage,
        );
        result[retry] += 1;
      } else {
        await markFailed(event.id, payload.messageId, errorMessage);
        result.failed += 1;
      }
    }
  }
  return result;
}

async function retryOrCancel(
  outboxId: string,
  workspaceId: string | null,
  payload: OutboxMessagePayload,
  origin: OutboundOrigin,
  attempts: number,
  error: string,
): Promise<'retried' | 'cancelled'> {
  if (!workspaceId) {
    await markFailed(outboxId, payload.messageId, error);
    return 'cancelled';
  }
  return prisma.$transaction(async (tx) => {
    const locked = await lockConversation(tx, payload.conversationId, workspaceId);
    const conversation = locked
      ? await tx.conversation.findFirst({
          where: { id: payload.conversationId, workspaceId },
          select: { mode: true, lockVersion: true },
        })
      : null;
    if (
      !conversation ||
      shouldCancelAutomaticSend({
        origin,
        queuedLockVersion: payload.conversationLockVersion,
        currentLockVersion: conversation.lockVersion,
        conversationMode: conversation.mode,
      })
    ) {
      // La llamada de red ya termino sin exito. Puede cerrar SENDING sin
      // reintentar una respuesta que ahora pertenece a la generacion anterior.
      await cancelWithClient(tx, outboxId, payload.messageId, true);
      return 'cancelled';
    }

    await tx.outboxEvent.updateMany({
      where: { id: outboxId, status: { in: [OutboxStatus.PROCESSING, OutboxStatus.SENDING] } },
      data: {
        status: OutboxStatus.PENDING,
        availableAt: new Date(Date.now() + RETRY_DELAYS_MS[attempts - 1]),
        error,
      },
    });
    await tx.message.updateMany({
      where: { id: payload.messageId, status: MessageStatus.SENDING },
      data: { status: MessageStatus.QUEUED },
    });
    return 'retried';
  });
}

async function cancelWithClient(tx: Prisma.TransactionClient, outboxId: string, messageId: string, sendFinished = false) {
  await tx.outboxEvent.updateMany({
    where: { id: outboxId, status: { in: [OutboxStatus.PENDING, OutboxStatus.PROCESSING, ...(sendFinished ? [OutboxStatus.SENDING] : [])] } },
    data: {
      status: OutboxStatus.CANCELLED,
      processedAt: new Date(),
      error: TAKEOVER_CANCEL_REASON,
    },
  });
  await tx.message.updateMany({
    where: { id: messageId, status: { in: [MessageStatus.QUEUED, ...(sendFinished ? [MessageStatus.SENDING] : [])] } },
    data: { status: MessageStatus.CANCELLED, errorMessage: TAKEOVER_CANCEL_REASON },
  });
}

async function markFailedWithClient(
  tx: Prisma.TransactionClient,
  outboxId: string,
  messageId: string,
  error: string,
  code?: string,
) {
  await tx.outboxEvent.updateMany({
    where: { id: outboxId, status: { notIn: [OutboxStatus.SENT, OutboxStatus.CANCELLED] } },
    data: { status: OutboxStatus.FAILED, processedAt: new Date(), error },
  });
  await tx.message.updateMany({
    where: { id: messageId, status: { in: [MessageStatus.QUEUED, MessageStatus.SENDING] } },
    data: {
      status: MessageStatus.FAILED,
      failedAt: new Date(),
      errorCode: code ?? null,
      errorMessage: error,
    },
  });
}

async function markFailed(outboxId: string, messageId: string, error: string, code?: string) {
  const event = await prisma.$transaction(async (tx) => {
    await markFailedWithClient(tx, outboxId, messageId, error, code);
    return tx.outboxEvent.findUnique({ where: { id: outboxId }, select: { workspaceId: true } });
  });
  if (event?.workspaceId) {
    await recordAudit({
      workspaceId: event.workspaceId,
      action: 'whatsapp.send_failed',
      entity: 'Message',
      entityId: messageId,
      metadata: { error, code: code ?? null },
    });
    await queuePushSafely({
      workspaceId: event.workspaceId,
      kind: 'OPERATIONAL_ISSUE',
      dedupeKey: `whatsapp-send-failed:${messageId}`,
    });
  }
}

/** Reencola un mensaje fallido desde la bandeja sin revivir una generación vieja. */
export async function retryMessage(input: {
  workspaceId: string;
  messageId: string;
  actorId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const candidate = await tx.message.findFirst({
      where: { id: input.messageId, workspaceId: input.workspaceId, status: MessageStatus.FAILED },
      select: { conversationId: true },
    });
    if (!candidate) throw new OutboundError('Mensaje fallido no encontrado.', 'NOT_FOUND');
    if (!(await lockConversation(tx, candidate.conversationId, input.workspaceId))) {
      throw new OutboundError('Mensaje fallido no encontrado.', 'NOT_FOUND');
    }

    const message = await tx.message.findFirst({
      where: { id: input.messageId, workspaceId: input.workspaceId, status: MessageStatus.FAILED },
      select: {
        id: true,
        text: true,
        senderType: true,
        conversationId: true,
        conversation: {
          select: { mode: true, lockVersion: true, contact: { select: { phone: true } } },
        },
      },
    });
    if (!message) throw new OutboundError('Mensaje fallido no encontrado.', 'NOT_FOUND');

    const previous = await tx.outboxEvent.findFirst({
      where: {
        workspaceId: input.workspaceId,
        payload: { path: ['messageId'], equals: message.id },
      },
      select: { idempotencyKey: true, payload: true },
    });
    const origin = inferOutboundOrigin(
      (previous?.payload ?? {}) as Partial<OutboxMessagePayload>,
      message.senderType,
    );
    if (pausesOnHumanTakeover(origin) && message.conversation.mode !== ConversationMode.AI_ACTIVE) {
      throw new OutboundError(
        'La conversación está a cargo de una persona: no se reintentará la respuesta automática.',
        'AI_BLOCKED',
      );
    }

    const payload: OutboxMessagePayload = {
      messageId: message.id,
      conversationId: message.conversationId,
      to: message.conversation.contact.phone ?? '',
      text: message.text ?? '',
      origin,
      conversationLockVersion: message.conversation.lockVersion,
    };
    await tx.message.update({
      where: { id: message.id },
      data: { status: MessageStatus.QUEUED, failedAt: null, errorCode: null, errorMessage: null },
    });
    await tx.outboxEvent.upsert({
      where: { idempotencyKey: previous?.idempotencyKey ?? `message:${message.id}` },
      create: {
        workspaceId: input.workspaceId,
        type: OutboxType.WHATSAPP_MESSAGE,
        idempotencyKey: `message:${message.id}`,
        payload,
      },
      update: {
        payload,
        status: OutboxStatus.PENDING,
        availableAt: new Date(),
        attempts: 0,
        error: null,
        processedAt: null,
      },
    });
    return message.id;
  });
}
