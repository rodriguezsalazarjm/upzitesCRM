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
import { matchCampaignRoute, type Attribution } from './campaign-routing';
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
  campaignRouteId: string | null = null,
): Promise<ChannelContext & { fallbackUserId: string | null }> {
  const channel = await prisma.whatsAppChannel.findFirst({ where: { id: channelId, workspaceId } });
  if (!channel) throw new Error('Canal fuera del workspace.');
  // Punto 9: la regla se lee acotada al workspace; una inactiva ya no manda.
  const route = campaignRouteId
    ? await prisma.campaignRoute.findFirst({ where: { id: campaignRouteId, workspaceId, isActive: true }, select: { agentId: true, flowId: true } })
    : null;

  const [agent, product, flow, fallback, routeAgent, routeFlow] = await Promise.all([
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
    route?.agentId ? usableAgent(workspaceId, route.agentId) : null,
    route?.flowId ? usableFlows(workspaceId, route.flowId).then((flows) => flows[0] ?? null) : null,
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
      routeAgent: route?.agentId ? { id: route.agentId, usable: Boolean(routeAgent) } : null,
      routeFlow: route?.flowId ? { id: route.flowId, usable: Boolean(routeFlow) } : null,
    },
    now,
  );
  return { ...context, fallbackUserId: fallback?.userId ?? null };
}

function usableAgent(workspaceId: string, id: string) {
  return prisma.agentDefinition.findFirst({
    where: { id, workspaceId, isActive: true, planLimitedAt: null, versions: { some: { status: AgentVersionStatus.PUBLISHED } } },
    select: { id: true },
  });
}

/**
 * Punto 9: regla activa del workspace que coincide con la atribucion
 * (anuncio → conjunto → campaña). El producto solo se usa si sigue activo en
 * este workspace; si no, la regla igual fija agente/automatizacion.
 */
export async function findCampaignRoute(workspaceId: string, attribution: Attribution) {
  const ids = [attribution.adId, attribution.adSetId, attribution.campaignId].filter((id): id is string => Boolean(id));
  if (ids.length === 0) return null;
  const routes = await prisma.campaignRoute.findMany({
    where: { workspaceId, isActive: true, externalId: { in: ids } },
    select: { id: true, name: true, level: true, externalId: true, productId: true },
  });
  const route = matchCampaignRoute(routes, attribution);
  if (!route) return null;
  const product = route.productId
    ? await prisma.product.findFirst({ where: { id: route.productId, workspaceId, status: 'ACTIVE' }, select: { id: true } })
    : null;
  return { ...route, productId: product?.id ?? null, productUnavailable: Boolean(route.productId && !product) };
}
