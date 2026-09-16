import { AutomationFlowStatus, type Channel } from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { startFlowRun } from './engine';
import { flowGraphSchema, type FlowTrigger } from './schema';

export type ChannelTriggerEvent = {
  eventId: string;
  workspaceId: string;
  channel: Channel;
  type: string;
  text?: string | null;
  contactId: string | null;
  conversationId: string | null;
};

function keywordMatches(keywords: string[] | undefined, text: string | null | undefined): boolean {
  if (!keywords || keywords.length === 0) return true;
  if (!text) return false;
  const normalized = text.trim().toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.trim().toLowerCase()));
}

function triggerMatchesEvent(trigger: FlowTrigger, event: ChannelTriggerEvent): boolean {
  switch (trigger.type) {
    case 'MESSAGE_RECEIVED':
      return event.type === 'DM_RECEIVED' && keywordMatches(trigger.keywords, event.text);
    case 'COMMENT':
      return event.type === 'COMMENT' && keywordMatches(trigger.keywords, event.text);
    case 'LIVE_COMMENT':
      return event.type === 'LIVE_COMMENT' && keywordMatches(trigger.keywords, event.text);
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
    });
    if (result.started) started.push(result.runId);
  }
  return { matched: versions.length, started: started.length, runIds: started };
}
