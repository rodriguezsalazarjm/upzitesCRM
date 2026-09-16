import {
  ActivityType,
  AutomationTrigger,
  ChannelEventStatus,
  ConversationStatus,
  MessageDirection,
  MessageSenderType,
  MessageType,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { emitDomainEvent } from '../automation/emit';
import { matchAndStartFlowsForChannelEvent } from '../automations/triggers';
import { resolveContactForChannelIdentity } from './identity';

/**
 * Paso 2, comun a Instagram/Messenger/TikTok: toma el ChannelEvent ya
 * normalizado y le da efecto en el CRM — resuelve/crea Contact y
 * Conversation, escribe el Message (si es un DM) o una Activity (si es un
 * evento social sin cuerpo de conversacion), y dispara tanto el motor de
 * reglas existente (compatibilidad) como el nuevo motor de flujos.
 *
 * Idempotente: si el evento ya quedo PROCESSED, no hace nada — el Job que lo
 * invoca puede reintentarse sin duplicar contactos, mensajes ni runs.
 */
export async function processChannelEvent(eventId: string) {
  const event = await prisma.channelEvent.findUniqueOrThrow({
    where: { id: eventId },
    include: { channelAccount: true },
  });
  if (event.status === ChannelEventStatus.PROCESSED || event.status === ChannelEventStatus.IGNORED) {
    return { skipped: true, reason: 'ya procesado' };
  }

  try {
    const content = (event.content as Record<string, unknown>) ?? {};
    const text = typeof content.text === 'string' ? content.text : null;
    const displayName = typeof content.displayName === 'string' ? content.displayName : null;

    const contact = await resolveContactForChannelIdentity({
      workspaceId: event.workspaceId,
      channel: event.channel,
      channelAccountId: event.channelAccountId,
      externalUserId: event.externalUserId,
      displayName,
    });

    let conversation = await prisma.conversation.findFirst({
      where: { workspaceId: event.workspaceId, channelAccountId: event.channelAccountId, contactId: contact.id },
    });
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          workspaceId: event.workspaceId,
          channelType: event.channel,
          channelAccountId: event.channelAccountId,
          contactId: contact.id,
          status: ConversationStatus.OPEN,
        },
      });
    } else if (conversation.status === ConversationStatus.CLOSED) {
      // Un evento nuevo sobre una conversacion cerrada la reabre, igual que WhatsApp.
      await prisma.conversation.update({ where: { id: conversation.id }, data: { status: ConversationStatus.OPEN } });
    }

    if (event.type === 'DM_RECEIVED' && text) {
      await prisma.message.create({
        data: {
          workspaceId: event.workspaceId,
          conversationId: conversation.id,
          direction: MessageDirection.INBOUND,
          senderType: MessageSenderType.CONTACT,
          type: MessageType.TEXT,
          text,
          status: 'DELIVERED',
        },
      });
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastInboundAt: new Date(), lastMessageAt: new Date(), unreadCount: { increment: 1 } },
      });

      // Compatibilidad: el motor de reglas existente (AutomationRule) sigue
      // reaccionando a MESSAGE_RECEIVED sin importar el canal de origen.
      await emitDomainEvent({
        workspaceId: event.workspaceId,
        trigger: AutomationTrigger.MESSAGE_RECEIVED,
        dedupeKey: `channel-event:${event.id}`,
        contactId: contact.id,
        conversationId: conversation.id,
        context: { channel: event.channel, text },
      });
    } else if (event.type !== 'DM_RECEIVED') {
      // Un comentario/story reply/follow no es un mensaje: se anota en la
      // linea de tiempo del contacto, la automatizacion es la que decide si
      // de ahi sale un DM (que si se vuelve Message, via el nodo MESSAGE).
      await prisma.activity.create({
        data: {
          workspaceId: event.workspaceId,
          contactId: contact.id,
          type: ActivityType.NOTE,
          title: activityTitleFor(event.type, event.channel),
          description: text ?? undefined,
        },
      });
    }

    await matchAndStartFlowsForChannelEvent({
      eventId: event.id,
      workspaceId: event.workspaceId,
      channel: event.channel,
      type: event.type,
      text,
      contactId: contact.id,
      conversationId: conversation.id,
    });

    await prisma.channelEvent.update({
      where: { id: event.id },
      data: { status: ChannelEventStatus.PROCESSED, processedAt: new Date(), contactId: contact.id, conversationId: conversation.id },
    });

    return { skipped: false, contactId: contact.id, conversationId: conversation.id };
  } catch (error) {
    await prisma.channelEvent.update({
      where: { id: event.id },
      data: { status: ChannelEventStatus.FAILED, error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}

function activityTitleFor(type: string, channel: string): string {
  const labels: Record<string, string> = {
    COMMENT: 'Comentó una publicación',
    STORY_REPLY: 'Respondió una historia',
    STORY_MENTION: 'Mencionó en una historia',
    FOLLOW: 'Empezó a seguir la cuenta',
    SHARE: 'Compartió una publicación',
    LIVE_COMMENT: 'Comentó en un live',
    AD_CONVERSATION_STARTED: 'Inició conversación desde un anuncio',
    REF_LINK: 'Abrió un enlace de referencia',
    QR_SCAN: 'Escaneó un código QR',
  };
  return `${labels[type] ?? type} (${channel})`;
}
