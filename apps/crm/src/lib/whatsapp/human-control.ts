import {
  ConversationMode,
  ConversationStatus,
  MessageStatus,
  OutboxStatus,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { lockConversation, TAKEOVER_CANCEL_REASON } from './outbound';
import {
  inferOutboundOrigin,
  type OutboxMessagePayload,
  pausesOnHumanTakeover,
} from './outbound-policy';

export type ActivateHumanControlInput = {
  conversationId: string;
  workspaceId: string;
  assignedUserId?: string;
  openConversation?: boolean;
};

/**
 * La pausa tiene alcance de conversación. El bloqueo de fila coordina esta
 * transición con queueOutboundMessage y con la reserva final del worker.
 */
export async function activateHumanControl(input: ActivateHumanControlInput) {
  return prisma.$transaction(async (tx) => {
    if (!(await lockConversation(tx, input.conversationId, input.workspaceId))) return null;

    const candidates = await tx.outboxEvent.findMany({
      where: {
        workspaceId: input.workspaceId,
        status: {
          in: [OutboxStatus.PENDING, OutboxStatus.PROCESSING, OutboxStatus.SENDING],
        },
        payload: { path: ['conversationId'], equals: input.conversationId },
      },
      select: { id: true, status: true, payload: true },
    });
    const messageIds = candidates
      .map((event) => (event.payload as Partial<OutboxMessagePayload>).messageId)
      .filter((id): id is string => typeof id === 'string');
    const messages = await tx.message.findMany({
      where: { id: { in: messageIds }, workspaceId: input.workspaceId },
      select: { id: true, senderType: true },
    });
    const senderById = new Map(messages.map((message) => [message.id, message.senderType]));

    const automatic = candidates.filter((event) => {
      const payload = event.payload as Partial<OutboxMessagePayload>;
      const senderType = payload.messageId ? senderById.get(payload.messageId) : undefined;
      return pausesOnHumanTakeover(inferOutboundOrigin(payload, senderType ?? 'SYSTEM'));
    });
    const cancellable = automatic.filter((event) => event.status !== OutboxStatus.SENDING);
    const inFlight = automatic.filter((event) => event.status === OutboxStatus.SENDING);
    const cancelledOutboxIds = cancellable.map((event) => event.id);
    const cancelledMessageIds = cancellable
      .map((event) => (event.payload as Partial<OutboxMessagePayload>).messageId)
      .filter((id): id is string => typeof id === 'string');

    const updatedConversation = await tx.conversation.update({
      where: { id: input.conversationId, workspaceId: input.workspaceId },
      data: {
        mode: ConversationMode.HUMAN_ACTIVE,
        assignedUserId: input.assignedUserId,
        status: input.openConversation ? ConversationStatus.OPEN : undefined,
        lockVersion: { increment: 1 },
      },
    });
    if (cancelledOutboxIds.length > 0) {
      await tx.outboxEvent.updateMany({
        where: {
          id: { in: cancelledOutboxIds },
          status: { in: [OutboxStatus.PENDING, OutboxStatus.PROCESSING] },
        },
        data: {
          status: OutboxStatus.CANCELLED,
          processedAt: new Date(),
          error: TAKEOVER_CANCEL_REASON,
        },
      });
    }
    if (cancelledMessageIds.length > 0) {
      await tx.message.updateMany({
        where: { id: { in: cancelledMessageIds }, status: MessageStatus.QUEUED },
        data: { status: MessageStatus.CANCELLED, errorMessage: TAKEOVER_CANCEL_REASON },
      });
    }

    return {
      mode: ConversationMode.HUMAN_ACTIVE,
      assignedUserId: input.assignedUserId ?? null,
      cancelledAutomaticMessages: cancelledMessageIds.length,
      automaticMessagesAlreadySending: inFlight.length,
      lockVersion: updatedConversation.lockVersion,
    };
  });
}
