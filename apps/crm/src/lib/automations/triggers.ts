import { AutomationFlowStatus, type Channel } from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { startFlowRun } from './engine';
import { flowGraphSchema, type FlowTrigger } from './schema';

export type ChannelTriggerEvent = {
  eventId: string;
  accountId?: string;
  postId?: string;
  commentId?: string;
  workspaceId: string;
  channel: Channel;
  type: string;
  text?: string | null;
  contactId: string | null;
  conversationId: string | null;
};

function keywordMatches(keywords: string[] | undefined, text: string | null | undefined, match?: 'EXACT' | 'CONTAINS'): boolean {
  if (!keywords || keywords.length === 0) return true;
  if (!text) return false;
  const normalized = text.trim().toLowerCase();
  return keywords.some((keyword) => match === 'EXACT' ? normalized === keyword.trim().toLowerCase() : normalized.includes(keyword.trim().toLowerCase()));
}

export function triggerMatchesEvent(trigger: FlowTrigger, event: ChannelTriggerEvent): boolean {
  if (trigger.accountId && trigger.accountId !== event.accountId) return false;
  if (trigger.type === 'COMMENT' && trigger.postId && trigger.postId !== event.postId) return false;
  switch (trigger.type) {
    case 'MESSAGE_RECEIVED':
      return event.type === 'DM_RECEIVED' && keywordMatches(trigger.keywords, event.text, trigger.match);
    case 'COMMENT':
      return event.type === 'COMMENT' && keywordMatches(trigger.keywords, event.text, trigger.match);
    case 'LIVE_COMMENT':
      return event.type === 'LIVE_COMMENT' && keywordMatches(trigger.keywords, event.text, trigger.match);
    case 'STORY_REPLY':
      return event.type === 'STORY_REPLY';
    case 'STORY_MENTION':
      return event.type === 'STORY_MENTION';
    case 'FOLLOW':
      return event.type === 'FOLLOW';
    case 'SHARE':
      return event.type === 'SHARE';
    case 'AD_CONVERSATION_STARTED':
      return event.type === 'AD_CONVERSATION_STARTED';
    case 'REF_LINK':
      return event.type === 'REF_LINK';
    case 'QR_SCAN':
      return event.type === 'QR_SCAN';
    case 'PAYMENT_APPROVED':
      return event.type === 'PAYMENT_APPROVED';
    default:
      return false;
  }
}

/**
 * Busca las versiones PUBLICADAS cuyo trigger coincide con este evento de
 * canal y arranca un run por cada una. `triggerDedupeKey` = el propio
 * ChannelEvent: el mismo evento nunca arranca dos runs de la misma version,
 * aunque el job que lo procesa se reintente.
 */
export async function matchAndStartFlowsForChannelEvent(event: ChannelTriggerEvent) {
  const versions = await prisma.automationFlowVersion.findMany({
    where: {
      status: AutomationFlowStatus.PUBLISHED,
      flow: {
        workspaceId: event.workspaceId,
        status: AutomationFlowStatus.PUBLISHED,
        // P0-C: un flujo limitado por plan sigue publicado pero no se dispara.
        planLimitedAt: null,
        OR: [{ channelScope: { isEmpty: true } }, { channelScope: { has: event.channel } }],
      },
    },
    include: { flow: true },
  });

  const started: string[] = [];
  for (const version of versions) {
    const graph = flowGraphSchema.safeParse({ trigger: version.trigger, nodes: version.nodes, edges: version.edges });
    if (!graph.success) continue;
    if (!triggerMatchesEvent(graph.data.trigger, event)) continue;

    const result = await startFlowRun({
      workspaceId: event.workspaceId,
      flowId: version.flowId,
      flowVersionId: version.id,
      channel: event.channel,
      contactId: event.contactId,
      conversationId: event.conversationId,
      triggerDedupeKey: event.eventId,
      state: { eventId: event.eventId, commentId: event.commentId ?? null, postId: event.postId ?? null },
    });
    if (result.started) started.push(result.runId);
  }
  return { matched: versions.length, started: started.length, runIds: started };
}

/**
 * P11: compra aprobada → flujos con trigger PAYMENT_APPROVED, en la ultima
 * conversacion del contacto (ahi se le puede escribir). Sin conversacion no
 * arranca nada. La clave es el pago: un webhook repetido no duplica el run.
 */
export async function matchAndStartFlowsForPayment(input: { workspaceId: string; contactId: string; paymentId: string }) {
  const conversation = await prisma.conversation.findFirst({
    where: { workspaceId: input.workspaceId, contactId: input.contactId },
    orderBy: { lastMessageAt: 'desc' },
    select: { id: true, channelType: true, channelAccountId: true },
  });
  if (!conversation) return { matched: 0, started: 0, runIds: [] as string[] };
  return matchAndStartFlowsForChannelEvent({
    eventId: `payment:${input.paymentId}`,
    accountId: conversation.channelAccountId ?? undefined,
    workspaceId: input.workspaceId,
    channel: conversation.channelType,
    type: 'PAYMENT_APPROVED',
    contactId: input.contactId,
    conversationId: conversation.id,
  });
}
