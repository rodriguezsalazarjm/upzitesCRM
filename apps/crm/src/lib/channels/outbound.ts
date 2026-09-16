import { MessageDirection, MessageSenderType, MessageStatus, MessageType } from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { queueOutboundMessage } from '../whatsapp/outbound';
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
export async function sendChannelMessage(input: { workspaceId: string; conversationId: string; text: string }) {
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
      senderType: MessageSenderType.AI,
      origin: 'AUTOMATION',
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

  const message = await prisma.message.create({
    data: {
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      direction: MessageDirection.OUTBOUND,
      senderType: MessageSenderType.AI,
      type: MessageType.TEXT,
      text: input.text,
      status: MessageStatus.SENDING,
    },
  });

  const result = await sendChannelDirectMessage({
    channelAccount: conversation.channelAccount,
    externalUserId: identity.externalUserId,
    text: input.text,
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

  return message;
}
