import {
  AgentVersionStatus,
  AutomationFlowStatus,
  IntegrationProvider,
  IntegrationStatus,
  MembershipStatus,
  WhatsAppChannelStatus,
} from '../../../generated/prisma/client';
import { flowGraphSchema } from '../automations/schema';
import { recordAudit } from '../domain/audit';
import { prisma } from '../prisma';
import { resolveChannelContext, type ChannelContext } from './channel-context';

/**
 * Punto 8 — piezas del Channel Manager que usa el runtime de mensajes (webhook,
 * outbox). Viven aparte del servicio de administracion para no arrastrar el
 * envio de mensajes al pipeline de entrada (ciclo de imports).
 */

/**
 * Flujos que pueden ser la automatizacion de un numero: publicados, no
 * limitados por el plan, con WhatsApp en su alcance y disparados por mensaje
 * recibido. Otro disparador nunca se activaria desde el webhook de WhatsApp.
 */
export async function usableFlows(workspaceId: string, onlyId?: string) {
  const flows = await prisma.automationFlow.findMany({
    where: {
      workspaceId,
      ...(onlyId ? { id: onlyId } : {}),
      status: AutomationFlowStatus.PUBLISHED,
      planLimitedAt: null,
      OR: [{ channelScope: { isEmpty: true } }, { channelScope: { has: 'WHATSAPP' } }],
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      versions: { where: { status: AutomationFlowStatus.PUBLISHED }, orderBy: { version: 'desc' }, take: 1, select: { trigger: true, nodes: true, edges: true } },
    },
  });
  return flows
    .filter((flow) => {
      const version = flow.versions[0];
      if (!version) return false;
      const graph = flowGraphSchema.safeParse({ trigger: version.trigger, nodes: version.nodes, edges: version.edges });
      return graph.success && graph.data.trigger.type === 'MESSAGE_RECEIVED';
    })
    .map(({ id, name }) => ({ id, name }));
}

/** Anota el ultimo error relevante del numero (lo que el cliente necesita ver). */
export async function recordChannelError(
  channel: { id: string; workspaceId: string },
  error: { code: string; message: string },
  options: { status?: WhatsAppChannelStatus; actorId?: string; action?: string } = {},
) {
  await prisma.$transaction(async (tx) => {
    await tx.whatsAppChannel.updateMany({
      where: { id: channel.id, workspaceId: channel.workspaceId },
      data: { lastErrorCode: error.code, lastErrorMessage: error.message.slice(0, 300), lastErrorAt: new Date(), ...(options.status ? { status: options.status } : {}) },
    });
    if (options.status === WhatsAppChannelStatus.NEEDS_ATTENTION) {
      await tx.integration.updateMany({
        where: { workspaceId: channel.workspaceId, provider: IntegrationProvider.WHATSAPP },
        data: { status: IntegrationStatus.NEEDS_ATTENTION },
      });
    }
    if (options.action) {
      await recordAudit(
        { workspaceId: channel.workspaceId, actorId: options.actorId, action: options.action, entity: 'WhatsAppChannel', entityId: channel.id, metadata: { code: error.code } },
        tx,
      );
    }
  });
}

// --- Contexto en runtime ------------------------------------------------------

/**
 * Lee la configuracion del numero con el workspace verificado y resuelve el
 * contexto del mensaje. Cada default se vuelve a validar aqui (pudo
 * despublicarse, archivarse o limitarse por plan despues de guardarlo).
 */
export async function loadChannelContext(
  channelId: string,
  workspaceId: string,
  conversationProductId: string | null,
  now = new Date(),
): Promise<ChannelContext & { fallbackUserId: string | null }> {
  const channel = await prisma.whatsAppChannel.findFirst({ where: { id: channelId, workspaceId } });
  if (!channel) throw new Error('Canal fuera del workspace.');

  const [agent, product, flow, fallback] = await Promise.all([
    channel.defaultAgentId
      ? prisma.agentDefinition.findFirst({
          where: { id: channel.defaultAgentId, workspaceId, isActive: true, planLimitedAt: null, versions: { some: { status: AgentVersionStatus.PUBLISHED } } },
          select: { id: true },
        })
      : null,
    channel.defaultProductId ? prisma.product.findFirst({ where: { id: channel.defaultProductId, workspaceId, status: 'ACTIVE' }, select: { id: true } }) : null,
    channel.defaultFlowId ? usableFlows(workspaceId, channel.defaultFlowId).then((flows) => flows[0] ?? null) : null,
    channel.fallbackUserId
      ? prisma.workspaceMembership.findFirst({ where: { workspaceId, userId: channel.fallbackUserId, status: MembershipStatus.ACTIVE }, select: { userId: true } })
      : null,
  ]);

  const context = resolveChannelContext(
    {
      aiEnabled: channel.aiEnabled,
      aiSchedule: channel.aiSchedule,
      hours: { timezone: channel.attentionTimezone, startMinute: channel.attentionStartMinute, endMinute: channel.attentionEndMinute, days: channel.attentionDays },
      noProductBehavior: channel.noProductBehavior,
      defaultAgent: channel.defaultAgentId ? { id: channel.defaultAgentId, usable: Boolean(agent) } : null,
      defaultProduct: channel.defaultProductId ? { id: channel.defaultProductId, usable: Boolean(product) } : null,
      defaultFlow: channel.defaultFlowId ? { id: channel.defaultFlowId, usable: Boolean(flow) } : null,
      conversationProductId,
    },
    now,
  );
  return { ...context, fallbackUserId: fallback?.userId ?? null };
}
