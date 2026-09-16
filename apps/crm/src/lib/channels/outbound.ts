import { MessageDirection, MessageSenderType, MessageStatus, MessageType } from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { lockConversation, queueOutboundMessage } from '../whatsapp/outbound';
import { sendChannelDirectMessage } from './providers';

export class ChannelOutboundError extends Error {}

/**
 * Punto unico de salida para un mensaje de texto de una automatizacion,
 * cualquiera sea el canal de la conversacion. WhatsApp sigue su propio
 * pipeline (outbox con reintentos y backoff, ya probado); los canales nuevos
 * usan un envio directo mas simple — no tienen todavia el mismo nivel de
 * reintento/backoff que WhatsApp, una mejora deliberadamente pospuesta
 * (ver informe de la Fase C).
 */
export async function sendChannelMessage(input: { workspaceId: string; conversationId: string; text: string; senderType?: 'AI' | 'USER'; senderUserId?: string; origin?: 'AI' | 'HUMAN' | 'AUTOMATION'; agentRunId?: string; expectedLockVersion?: number; delivery?: 'DM' | 'PUBLIC_REPLY' | 'PRIVATE_REPLY'; commentId?: string }) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, workspaceId: input.workspaceId },
    include: { channelAccount: true, contact: { include: { channelIdentities: true } } },
  });
  if (!conversation) throw new ChannelOutboundError('Conversación no encontrada en este workspace.');

  if (conversation.channelType === 'WHATSAPP') {
    return queueOutboundMessage({
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      text: input.text,
      senderType: input.senderType ?? MessageSenderType.AI,
      origin: input.origin ?? 'AUTOMATION',
      senderUserId: input.senderUserId,
      agentRunId: input.agentRunId,
    });
  }

  if (!conversation.channelAccount) {
    throw new ChannelOutboundError('La conversación no tiene una cuenta de canal conectada.');
  }
  const identity = conversation.contact.channelIdentities.find(
    (candidate) => candidate.channelAccountId === conversation.channelAccountId,
  );
  if (!identity) {
    throw new ChannelOutboundError('El contacto no tiene una identidad registrada en este canal.');
  }

  const message = await prisma.$transaction(async tx => {
    await lockConversation(tx, conversation.id, input.workspaceId);
    const current = await tx.conversation.findFirstOrThrow({ where: { id: conversation.id, workspaceId: input.workspaceId } });
    if ((input.senderType ?? 'AI') !== 'USER' && (current.mode !== 'AI_ACTIVE' || (input.expectedLockVersion !== undefined && current.lockVersion !== input.expectedLockVersion))) throw new ChannelOutboundError('Respuesta invalidada por control humano.');
    if (current.status === 'CLOSED' || conversation.channelAccount?.status !== 'CONNECTED') throw new ChannelOutboundError('Conversación cerrada o canal desconectado.');
    return tx.message.create({ data: { workspaceId: input.workspaceId, conversationId: input.conversationId, direction: MessageDirection.OUTBOUND, senderType: input.senderType ?? MessageSenderType.AI, senderUserId: input.senderUserId, type: MessageType.TEXT, text: input.text, status: MessageStatus.SENDING } });
  });

  const result = await sendChannelDirectMessage({
    channelAccount: conversation.channelAccount,
    externalUserId: identity.externalUserId,
    text: input.text,
    delivery: input.delivery,
    commentId: input.commentId,
  });

  await prisma.message.update({
    where: { id: message.id },
    data: result.ok
      ? { status: MessageStatus.SENT, externalMessageId: result.externalMessageId, sentAt: new Date() }
      : { status: MessageStatus.FAILED, errorMessage: result.error, failedAt: new Date() },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastOutboundAt: new Date(), lastMessageAt: new Date() },
  });

  if (!result.ok) throw new ChannelOutboundError(result.error);
  return message;
}
