import { randomUUID } from 'node:crypto';
import type { Channel, Prisma } from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { flowGraphSchema, validateFlowGraph, type FlowGraph } from './schema';
import { graphCapabilities, missingCapabilities } from './catalog';
import { ALL_TOOL_NAMES } from '../agents/tools';

export class FlowError extends Error {}
const json = (value: unknown) => value as Prisma.InputJsonValue;

export async function validatePublication(workspaceId: string, channel: Channel, raw: unknown): Promise<string[]> {
  const parsed = flowGraphSchema.safeParse(raw);
  if (!parsed.success) return parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
  const graph = parsed.data;
  const structural = validateFlowGraph(graph);
  const errors = structural.valid ? [] : [structural.reason];
  if (graph.trigger.type === 'MANUAL') errors.push('Selecciona un trigger antes de publicar.');
  const account = await prisma.channelAccount.findFirst({ where: { id: graph.trigger.accountId ?? '', workspaceId, channel } });
  if (channel === 'WHATSAPP') {
    const wa = await prisma.whatsAppChannel.findFirst({ where: { workspaceId, status: 'CONNECTED', ...(graph.trigger.accountId ? { id: graph.trigger.accountId } : {}) } });
    errors.push(...missingCapabilities(wa ? { id: wa.id, channel, status: wa.status, capabilities: [], displayName: null } : undefined, graphCapabilities(graph)).map(c => `Capacidad no disponible: ${c}`));
  } else errors.push(...missingCapabilities(account ?? undefined, graphCapabilities(graph)).map(c => `Capacidad no disponible: ${c}`));
  for (const node of graph.nodes) {
    if (node.type === 'AI') {
      if (node.allowedTools.includes('createCheckoutLink') && !await prisma.product.findFirst({ where: { id: node.productId ?? '', workspaceId, status: 'ACTIVE' } })) errors.push(`${node.id}: selecciona un producto existente del workspace.`);
      const agent = await prisma.agentVersion.findFirst({ where: { id: node.agentVersionId ?? '', status: 'PUBLISHED', definition: { workspaceId, isActive: true } } });
      if (!agent) errors.push(`${node.id}: selecciona una versión publicada de un agente de este workspace.`);
      if (node.allowedTools.some(t => !ALL_TOOL_NAMES.includes(t) || !agent?.allowedTools.includes(t))) errors.push(`${node.id}: hay herramientas no autorizadas por el agente.`);
    }
    if (node.type === 'MESSAGE' && node.delivery && node.delivery !== 'DM' && graph.trigger.type !== 'COMMENT') errors.push(`${node.id}: una respuesta a comentario requiere trigger COMMENT.`);
    if (node.type === 'ACTION') {
      const p = node.params ?? {};
      const required: Record<string, string[]> = { ADD_TAG: ['tag'], REMOVE_TAG: ['tag'], SET_CUSTOM_FIELD: ['field'], ASSIGN_OPERATOR: ['userId'], UPDATE_OPPORTUNITY_STAGE: ['stageKey'], CREATE_CHECKOUT: ['productId'] };
      for (const key of required[node.action] ?? []) if (!String(p[key] ?? '').trim()) errors.push(`${node.id}: falta ${key}.`);
      if (node.action === 'CREATE_CHECKOUT' && !await prisma.product.findFirst({ where: { id: String(p.productId ?? ''), workspaceId, status: 'ACTIVE' } })) errors.push(`${node.id}: producto inexistente o inactivo en este workspace.`);
      if (node.action === 'ASSIGN_OPERATOR' && !await prisma.user.findFirst({ where: { id: String(p.userId ?? ''), workspaceId } })) errors.push(`${node.id}: operador inválido.`);
      if (node.action === 'UPDATE_OPPORTUNITY_STAGE' && !await prisma.pipelineStage.findFirst({ where: { workspaceId, key: String(p.stageKey ?? '') as never } })) errors.push(`${node.id}: etapa inválida.`);
    }
    if (node.type === 'START_AUTOMATION' && !await prisma.automationFlow.findFirst({ where: { id: node.flowKey, workspaceId, status: 'PUBLISHED' } })) errors.push(`${node.id}: automatización publicada no encontrada.`);
  }
  return [...new Set(errors)];
}

export async function createFlow(workspaceId: string, actorId: string, name: string, channel: Channel, graph: unknown) {
  return prisma.automationFlow.create({ data: { workspaceId, name, channelScope: [channel], createdById: actorId, versions: { create: { version: 1, trigger: json((graph as FlowGraph).trigger), nodes: json((graph as FlowGraph).nodes), edges: json((graph as FlowGraph).edges) } } }, include: { versions: true } });
}

/** Lock the parent row to serialize draft creation, edits and publication. */
export async function saveFlow(workspaceId: string, id: string, actorId: string, input: { action: 'save' | 'draft' | 'publish'; versionId: string; name?: string; graph?: FlowGraph; updatedAt?: string }) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM automation_flows WHERE id = ${id} AND workspace_id = ${workspaceId} FOR UPDATE`;
    const flow = await tx.automationFlow.findFirst({ where: { id, workspaceId }, include: { versions: { orderBy: { version: 'desc' } } } });
    const version = flow?.versions.find(v => v.id === input.versionId);
    if (!flow || !version) throw new FlowError('Automatización no encontrada.');
    if (input.action === 'draft') {
      const draft = flow.versions.find(v => v.status === 'DRAFT');
      if (draft) return draft;
      return tx.automationFlowVersion.create({ data: { id: randomUUID(), flowId: id, version: flow.versions[0].version + 1, trigger: json(version.trigger), nodes: json(version.nodes), edges: json(version.edges) } });
    }
    if (version.status !== 'DRAFT') throw new FlowError('La versión publicada es inmutable. Crea un nuevo borrador.');
    if (input.updatedAt && version.updatedAt.toISOString() !== input.updatedAt) throw new FlowError('Otro editor guardó cambios. Recarga antes de continuar.');
    if (input.action === 'publish') {
      // Validation inside lock reads only local data; no provider call occurs here.
      const errors = await validatePublication(workspaceId, flow.channelScope[0], { trigger: version.trigger, nodes: version.nodes, edges: version.edges });
      if (errors.length) throw new FlowError(errors.join('\n'));
      await tx.automationFlowVersion.updateMany({ where: { flowId: id, status: 'PUBLISHED' }, data: { status: 'ARCHIVED' } });
      await tx.automationFlow.update({ where: { id }, data: { status: 'PUBLISHED', updatedById: actorId } });
      return tx.automationFlowVersion.update({ where: { id: version.id }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
    }
    if (!input.graph) throw new FlowError('Falta el grafo.');
    await tx.automationFlow.update({ where: { id }, data: { name: input.name ?? flow.name, updatedById: actorId } });
    return tx.automationFlowVersion.update({ where: { id: version.id }, data: { trigger: json(input.graph.trigger), nodes: json(input.graph.nodes), edges: json(input.graph.edges) } });
  });
}
