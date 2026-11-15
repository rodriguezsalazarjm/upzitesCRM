import { Prisma } from '../../../generated/prisma/client';
import { canManageChannels } from '../conversations';
import { recordAudit } from '../domain/audit';
import { assertFeature } from '../entitlements';
import { prisma } from '../prisma';
import type { CampaignRouteInput } from './campaign-routing';
import { ChannelManagerError, channelOptions, type ChannelActor } from './channel-manager';

/**
 * Punto 9 — administracion de reglas de campaña. Todo acotado al workspace del
 * actor: un producto/agente/automatizacion de otro tenant responde como
 * inexistente, igual que en la configuracion del numero (Punto 8).
 */

const SELECT = { id: true, name: true, level: true, externalId: true, productId: true, agentId: true, flowId: true, isActive: true, updatedAt: true } as const;

export function listCampaignRoutes(workspaceId: string) {
  return prisma.campaignRoute.findMany({ where: { workspaceId }, orderBy: [{ isActive: 'desc' }, { name: 'asc' }], select: SELECT });
}

async function assertRefs(workspaceId: string, input: CampaignRouteInput) {
  const options = await channelOptions(workspaceId);
  if (input.agentId) {
    await assertFeature(workspaceId, 'agents');
    if (!options.agents.some((agent) => agent.id === input.agentId)) {
      throw new ChannelManagerError('Ese agente no existe en este workspace o no tiene una versión publicada.', 400, 'INVALID_AGENT');
    }
  }
  if (input.productId && !options.products.some((product) => product.id === input.productId)) {
    throw new ChannelManagerError('Ese producto no existe en este workspace o no está activo.', 400, 'INVALID_PRODUCT');
  }
  if (input.flowId && !options.flows.some((flow) => flow.id === input.flowId)) {
    throw new ChannelManagerError('Esa automatización no existe en este workspace o no está publicada para mensajes de WhatsApp.', 400, 'INVALID_FLOW');
  }
  if (!input.agentId && !input.productId && !input.flowId) {
    throw new ChannelManagerError('Elige al menos un producto, agente o automatización.', 400, 'EMPTY_ROUTE');
  }
}

function duplicate(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ChannelManagerError('Ya hay una regla para ese ID en este nivel.', 409, 'DUPLICATE_ROUTE');
  }
  throw error;
}

function assertManager(actor: ChannelActor) {
  if (!canManageChannels(actor.role)) throw new ChannelManagerError('Solo el owner o un admin puede administrar las reglas de campaña.', 403, 'FORBIDDEN');
}

export async function createCampaignRoute(actor: ChannelActor, input: CampaignRouteInput) {
  assertManager(actor);
  await assertRefs(actor.workspaceId, input);
  return prisma
    .$transaction(async (tx) => {
      const route = await tx.campaignRoute.create({ data: { ...input, workspaceId: actor.workspaceId }, select: SELECT });
      await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.id, action: 'campaign_route.created', entity: 'CampaignRoute', entityId: route.id, metadata: { level: route.level, externalId: route.externalId } }, tx);
      return route;
    })
    .catch(duplicate);
}

export async function updateCampaignRoute(actor: ChannelActor, id: string, input: CampaignRouteInput) {
  assertManager(actor);
  await assertRefs(actor.workspaceId, input);
  return prisma
    .$transaction(async (tx) => {
      const { count } = await tx.campaignRoute.updateMany({ where: { id, workspaceId: actor.workspaceId }, data: input });
      if (count === 0) throw new ChannelManagerError('Regla no encontrada.', 404, 'NOT_FOUND');
      await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.id, action: 'campaign_route.updated', entity: 'CampaignRoute', entityId: id }, tx);
      return tx.campaignRoute.findFirstOrThrow({ where: { id, workspaceId: actor.workspaceId }, select: SELECT });
    })
    .catch(duplicate);
}

/** Borrar no toca conversaciones ya atribuidas: conservan producto y referral. */
export async function deleteCampaignRoute(actor: ChannelActor, id: string) {
  assertManager(actor);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.campaignRoute.deleteMany({ where: { id, workspaceId: actor.workspaceId } });
    if (count === 0) throw new ChannelManagerError('Regla no encontrada.', 404, 'NOT_FOUND');
    await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.id, action: 'campaign_route.deleted', entity: 'CampaignRoute', entityId: id }, tx);
  });
  return { id };
}
