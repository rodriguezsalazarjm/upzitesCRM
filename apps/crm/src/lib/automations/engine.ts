import {
  AutomationFlowRunStatus,
  AutomationFlowStatus,
  JobType,
  type Channel,
  type Prisma,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { enqueue } from '../jobs/queue';
import { runAgent } from '../agents/runner';
import { toolByName } from '../agents/tools';
import type { ModelProvider } from '../agents/provider';
import { getPolicy, nextAllowedInstant } from '../marketing/policy';
import { activateHumanControl } from '../whatsapp/human-control';
import { sendChannelMessage } from '../channels/outbound';
import { evaluateCondition, type ConditionContext } from './conditions';
import {
  flowGraphSchema,
  type FlowEdge,
  type FlowGraph,
  type FlowNode,
} from './schema';

/**
 * Ejecutor del Flow Builder.
 *
 * Cada llamada a `advanceFlowRun` retoma exactamente donde el run se quedo
 * (`currentNodeId` + `state`, persistidos en la base), nunca de memoria del
 * proceso — un restart del worker no pierde un run en curso. Los nodos DELAY
 * son el unico punto de suspension real: todo lo demas se ejecuta en un
 * bucle sincronico, con un limite duro de pasos como cortacircuito contra
 * loops (condicion A->B->A, START_AUTOMATION recursivo, etc.).
 *
 * A proposito NO se envuelve todo el bucle en una sola transaccion larga:
 * activateHumanControl (usado por HUMAN_HANDOFF/ASSIGN_OPERATOR) abre su
 * propia transaccion internamente, y anidar transacciones de Prisma para
 * componer dos m()odulos es fragil. Cada nodo hace su propia escritura
 * atomica de una sentencia; el estado del run se persiste al final de cada
 * nodo, asi que un fallo a mitad de camino deja el run exactamente en el
 * ultimo nodo completado, nunca a medio nodo.
 *
 * Concurrencia: la unica forma de que dos ejecuciones toquen el mismo run es
 * un RUN_FLOW_STEP repetido, y el Job que lo dispara ya tiene un
 * `dedupeKey` unico (`flow-step:<runId>`) reclamado con `FOR UPDATE SKIP
 * LOCKED` por la cola — no hace falta un lock adicional aqui.
 */
const MAX_STEPS_PER_RUN = 200;
const MAX_FLOW_DEPTH = 5;

function loadGraph(version: { trigger: unknown; nodes: unknown; edges: unknown }): FlowGraph {
  return flowGraphSchema.parse({ trigger: version.trigger, nodes: version.nodes, edges: version.edges });
}

function findNode(graph: FlowGraph, nodeId: string): FlowNode | undefined {
  return graph.nodes.find((node) => node.id === nodeId);
}

function nextEdge(graph: FlowGraph, fromId: string, branch?: string): FlowEdge | undefined {
  const candidates = graph.edges.filter((edge) => edge.from === fromId);
  if (candidates.length <= 1) return candidates[0];
  return candidates.find((edge) => edge.branch === branch) ?? candidates.find((edge) => !edge.branch);
}

export type StartFlowRunInput = {
  workspaceId: string;
  flowId: string;
  flowVersionId: string;
  channel?: Channel | null;
  contactId?: string | null;
  conversationId?: string | null;
  triggerDedupeKey?: string | null;
  depth?: number;
  state?: Record<string, unknown>;
  provider?: ModelProvider;
};

export type StartFlowRunResult =
  | { started: true; runId: string }
  | { started: false; reason: 'VERSION_NOT_PUBLISHED' | 'MAX_DEPTH_EXCEEDED' }
  | { started: false; reason: 'ALREADY_STARTED'; runId?: string };

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

/**
 * Crea el run e inicia su ejecucion. La unicidad `(flowVersionId,
 * triggerDedupeKey)` es la idempotencia de arranque: el mismo evento
 * disparador nunca produce dos runs, aunque el webhook que lo origino se
 * reintente.
 */
export async function startFlowRun(input: StartFlowRunInput): Promise<StartFlowRunResult> {
  const version = await prisma.automationFlowVersion.findFirst({
    where: { id: input.flowVersionId, flowId: input.flowId, status: AutomationFlowStatus.PUBLISHED, flow: { workspaceId: input.workspaceId } },
  });
  if (!version) return { started: false, reason: 'VERSION_NOT_PUBLISHED' };

  if ((input.depth ?? 0) > MAX_FLOW_DEPTH) {
    return { started: false, reason: 'MAX_DEPTH_EXCEEDED' };
  }

  if (input.contactId && !await prisma.contact.findFirst({ where: { id: input.contactId, workspaceId: input.workspaceId } })) throw new Error('Contacto fuera del workspace.');
  if (input.conversationId && !await prisma.conversation.findFirst({ where: { id: input.conversationId, workspaceId: input.workspaceId, ...(input.contactId ? { contactId: input.contactId } : {}) } })) throw new Error('Conversación fuera del workspace.');
  if (input.conversationId) await prisma.conversation.updateMany({ where: { id: input.conversationId, workspaceId: input.workspaceId, mode: 'WAITING' }, data: { mode: 'AI_ACTIVE' } });
  let run;
  try {
    run = await prisma.automationFlowRun.create({
      data: {
        workspaceId: input.workspaceId,
        flowId: input.flowId,
        flowVersionId: input.flowVersionId,
        channel: input.channel ?? null,
        contactId: input.contactId ?? null,
        conversationId: input.conversationId ?? null,
        triggerDedupeKey: input.triggerDedupeKey ?? null,
        depth: input.depth ?? 0,
        state: (input.state ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existing = await prisma.automationFlowRun.findFirst({
        where: { flowVersionId: input.flowVersionId, triggerDedupeKey: input.triggerDedupeKey ?? null },
      });
      return { started: false, reason: 'ALREADY_STARTED', runId: existing?.id };
    }
    throw error;
  }

  await prisma.automationFlowVersion.update({
    where: { id: version.id },
    data: { runsStarted: { increment: 1 } },
  });

  await advanceFlowRun(run.id, input.provider);
  return { started: true, runId: run.id };
}

async function buildConditionContext(
  workspaceId: string,
  contactId: string | null,
  channel: Channel | null,
): Promise<ConditionContext> {
  if (!contactId) {
    return { tags: [], customFields: {}, channel, pipelineStage: null, leadStatus: null, purchasedProductIds: [] };
  }
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId },
    select: {
      tags: true,
      customFields: true,
      lifecycleStatus: true,
      opportunities: { orderBy: { createdAt: 'desc' }, take: 1, select: { stage: { select: { name: true } } } },
      orders: { select: { lines: { select: { variant: { select: { productId: true } } } } } },
    },
  });
  if (!contact) {
    return { tags: [], customFields: {}, channel, pipelineStage: null, leadStatus: null, purchasedProductIds: [] };
  }
  const purchasedProductIds = Array.from(
    new Set(
      contact.orders.flatMap((order) =>
        order.lines.map((line) => line.variant?.productId).filter((id): id is string => Boolean(id)),
      ),
    ),
  );
  return {
    tags: contact.tags,
    customFields: (contact.customFields as Record<string, unknown>) ?? {},
    channel,
    pipelineStage: contact.opportunities[0]?.stage.name ?? null,
    leadStatus: contact.lifecycleStatus,
    purchasedProductIds,
  };
}

/** Avanza un run desde donde quedo. Se usa tanto al arrancar como al retomar tras un DELAY. */
export async function advanceFlowRun(runId: string, provider?: ModelProvider): Promise<void> {
  const run = await prisma.automationFlowRun.findUnique({ where: { id: runId } });
  if (!run) return;
  if (run.status !== AutomationFlowRunStatus.RUNNING && run.status !== AutomationFlowRunStatus.WAITING) return;

  const version = await prisma.automationFlowVersion.findUniqueOrThrow({ where: { id: run.flowVersionId } });
  const graph = loadGraph(version);

  let currentNodeId = run.currentNodeId;
  let state = (run.state as Record<string, unknown>) ?? {};
  let stepsExecuted = run.stepsExecuted;

  // Si veniamos de un DELAY, se avanza a la arista de salida de ese nodo
  // antes de seguir ejecutando.
  if (run.status === AutomationFlowRunStatus.WAITING && run.waitingUntil && run.waitingUntil > new Date()) return;
  if (currentNodeId && run.status === AutomationFlowRunStatus.WAITING) {
    const edge = nextEdge(graph, currentNodeId);
    currentNodeId = edge?.to ?? null;
    if (!currentNodeId) { await finishRun(run.id, version.id, AutomationFlowRunStatus.COMPLETED, undefined, stepsExecuted, state); return; }
  }
  if (!currentNodeId) {
    currentNodeId = graph.nodes[0]?.id ?? null;
  }

  if (run.status !== AutomationFlowRunStatus.RUNNING) {
    await prisma.automationFlowRun.update({ where: { id: run.id }, data: { status: AutomationFlowRunStatus.RUNNING } });
  }

  while (currentNodeId) {
    if (stepsExecuted >= MAX_STEPS_PER_RUN) {
      await finishRun(run.id, version.id, AutomationFlowRunStatus.FAILED, 'MAX_STEPS_EXCEEDED', stepsExecuted, state);
      return;
    }
    const node = findNode(graph, currentNodeId);
    if (!node) {
      await finishRun(run.id, version.id, AutomationFlowRunStatus.FAILED, `Nodo ${currentNodeId} no existe.`, stepsExecuted, state);
      return;
    }
    stepsExecuted += 1;

    let result: NodeResult;
    try {
      result = await executeNode(node, {
        workspaceId: run.workspaceId,
        runId: run.id,
        flowVersionId: version.id,
        contactId: run.contactId,
        conversationId: run.conversationId,
        channel: run.channel,
        depth: run.depth,
        state,
        provider,
      });
    } catch (error) {
      await finishRun(
        run.id,
        version.id,
        AutomationFlowRunStatus.FAILED,
        error instanceof Error ? error.message : 'Error desconocido ejecutando el nodo.',
        stepsExecuted,
        state,
      );
      return;
    }
    state = result.state ?? state;
    const timeline = Array.isArray(state.timeline) ? state.timeline : [];
    state = { ...state, timeline: [...timeline, { nodeId: node.id, type: node.type, result: result.kind, at: new Date().toISOString() }] };

    if (result.kind === 'WAIT') {
      await prisma.automationFlowRun.update({
        where: { id: run.id },
        data: {
          status: AutomationFlowRunStatus.WAITING,
          currentNodeId: node.id,
          state: state as Prisma.InputJsonValue,
          stepsExecuted,
          waitingUntil: result.until,
        },
      });
      await enqueue({
        type: JobType.RUN_FLOW_STEP,
        workspaceId: run.workspaceId,
        payload: { runId: run.id },
        runAt: result.until,
        dedupeKey: `flow-step:${run.id}:${stepsExecuted}`,
        priority: 60,
      });
      return;
    }

    if (result.kind === 'END' || result.kind === 'HANDOFF') {
      await finishRun(run.id, version.id, AutomationFlowRunStatus.COMPLETED, undefined, stepsExecuted, state);
      if (result.kind === 'HANDOFF') {
        await prisma.automationFlowVersion.update({ where: { id: version.id }, data: { handoffs: { increment: 1 } } });
      }
      return;
    }

    if (result.kind === 'ERROR') {
      await finishRun(run.id, version.id, AutomationFlowRunStatus.FAILED, result.error, stepsExecuted, state);
      return;
    }

    // CONTINUE: seguir a la arista correspondiente. Se persiste el progreso a
    // cada paso para que un fallo entre nodos no pierda lo ya avanzado.
    const edge = nextEdge(graph, node.id, result.branch);
    await prisma.automationFlowRun.update({
      where: { id: run.id },
      data: { currentNodeId: edge?.to ?? null, state: state as Prisma.InputJsonValue, stepsExecuted },
    });
    currentNodeId = edge?.to ?? null;
    if (!currentNodeId) {
      await finishRun(run.id, version.id, AutomationFlowRunStatus.COMPLETED, undefined, stepsExecuted, state);
      return;
    }
  }
}

async function finishRun(
  runId: string,
  versionId: string,
  status: AutomationFlowRunStatus,
  error?: string,
  stepsExecuted?: number,
  state?: Record<string, unknown>,
) {
  await prisma.automationFlowRun.update({
    where: { id: runId },
    data: {
      status,
      error: error ?? null,
      endedAt: new Date(),
      ...(stepsExecuted !== undefined ? { stepsExecuted } : {}),
      ...(state !== undefined ? { state: state as Prisma.InputJsonValue } : {}),
    },
  });
  await prisma.automationFlowVersion.update({
    where: { id: versionId },
    data:
      status === AutomationFlowRunStatus.COMPLETED ? { runsCompleted: { increment: 1 } } : { runsFailed: { increment: 1 } },
  });
}

type NodeExecutionContext = {
  workspaceId: string;
  runId: string;
  flowVersionId: string;
  contactId: string | null;
  conversationId: string | null;
  channel: Channel | null;
  depth: number;
  state: Record<string, unknown>;
  provider?: ModelProvider;
};

type NodeResult =
  | { kind: 'CONTINUE'; branch?: string; state?: Record<string, unknown> }
  | { kind: 'WAIT'; until: Date; state?: Record<string, unknown> }
  | { kind: 'END'; state?: Record<string, unknown> }
  | { kind: 'HANDOFF'; state?: Record<string, unknown> }
  | { kind: 'ERROR'; error: string; state?: Record<string, unknown> };

async function executeNode(node: FlowNode, ctx: NodeExecutionContext): Promise<NodeResult> {
  switch (node.type) {
    case 'MESSAGE': {
      if (ctx.conversationId) {
        await sendChannelMessage({ workspaceId: ctx.workspaceId, conversationId: ctx.conversationId, text: node.text, delivery: node.delivery, commentId: typeof ctx.state.commentId === 'string' ? ctx.state.commentId : undefined });
        await prisma.automationFlowVersion.update({ where: { id: ctx.flowVersionId }, data: { messagesSent: { increment: 1 } } });
      }
      return { kind: 'CONTINUE' };
    }

    case 'CONDITION': {
      const conditionContext = await buildConditionContext(ctx.workspaceId, ctx.contactId, ctx.channel);
      const branch = evaluateCondition(node, conditionContext) ? 'true' : 'false';
      return { kind: 'CONTINUE', branch };
    }

    case 'ACTION':
      return executeAction(node, ctx);

    case 'DELAY': {
      const raw = node.untilISO ? new Date(node.untilISO) : new Date(Date.now() + (node.minutes ?? 0) * 60_000);
      const until = node.respectQuietHours ? nextAllowedInstant(raw, await getPolicy(ctx.workspaceId)) : raw;
      return { kind: 'WAIT', until };
    }

    case 'AI': {
      if (!ctx.conversationId || !node.agentVersionId) return { kind: 'ERROR', error: 'Falta conversación o agente publicado.' };
      const result = await runAgent({ workspaceId: ctx.workspaceId, conversationId: ctx.conversationId, agentVersionId: node.agentVersionId, goal: node.goal, allowedTools: node.allowedTools, exitConditions: node.exitConditions, maxTurns: node.maxTurns, trigger: `flow:${ctx.runId}:${node.id}`, provider: ctx.provider });
      const state = { ...ctx.state, agentRunId: result.runId ?? null, aiStatus: result.status };
      if (result.escalated) return { kind: 'HANDOFF', state };
      if (result.status !== 'COMPLETED') return { kind: 'ERROR', error: result.skippedReason ?? result.status, state };
      return { kind: 'CONTINUE', state };
    }

    case 'RANDOM_SPLIT': {
      const total = node.branches.reduce((sum, branch) => sum + branch.weight, 0);
      let roll = Math.random() * total;
      let chosen = node.branches[0]!.id;
      for (const branch of node.branches) {
        if (roll < branch.weight) {
          chosen = branch.id;
          break;
        }
        roll -= branch.weight;
      }
      return { kind: 'CONTINUE', branch: chosen };
    }

    case 'START_AUTOMATION': {
      const target = await prisma.automationFlow.findFirst({
        where: { workspaceId: ctx.workspaceId, id: node.flowKey, status: AutomationFlowStatus.PUBLISHED },
        include: { versions: { where: { status: AutomationFlowStatus.PUBLISHED }, take: 1 } },
      });
      const targetVersion = target?.versions[0];
      if (target && targetVersion) {
        // Efecto secundario, no bloqueante: el run padre sigue su propio
        // camino: el hijo corre de forma independiente.
        await startFlowRun({
          workspaceId: ctx.workspaceId,
          flowId: target.id,
          flowVersionId: targetVersion.id,
          channel: ctx.channel,
          contactId: ctx.contactId,
          conversationId: ctx.conversationId,
          triggerDedupeKey: `${ctx.runId}:${node.id}`,
          depth: ctx.depth + 1,
        });
      }
      return { kind: 'CONTINUE' };
    }

    case 'HUMAN_HANDOFF': {
      if (ctx.conversationId) {
        await activateHumanControl({ conversationId: ctx.conversationId, workspaceId: ctx.workspaceId, openConversation: true });
      }
      return { kind: 'HANDOFF' };
    }

    case 'END':
      return { kind: 'END' };

    default:
      return { kind: 'ERROR', error: 'Tipo de nodo no reconocido.' };
  }
}

async function executeAction(
  node: Extract<FlowNode, { type: 'ACTION' }>,
  ctx: NodeExecutionContext,
): Promise<NodeResult> {
  const params = node.params ?? {};

  switch (node.action) {
    case 'ADD_TAG':
    case 'REMOVE_TAG': {
      if (!ctx.contactId) return { kind: 'CONTINUE' };
      const tag = String(params.tag ?? '');
      if (!tag) return { kind: 'CONTINUE' };
      const contact = await prisma.contact.findFirst({ where: { id: ctx.contactId, workspaceId: ctx.workspaceId }, select: { tags: true } });
      if (!contact) return { kind: 'CONTINUE' };
      const tags =
        node.action === 'ADD_TAG'
          ? Array.from(new Set([...contact.tags, tag]))
          : contact.tags.filter((existing) => existing !== tag);
      await prisma.contact.update({ where: { id: ctx.contactId }, data: { tags } });
      return { kind: 'CONTINUE' };
    }

    case 'SET_CUSTOM_FIELD': {
      if (!ctx.contactId) return { kind: 'CONTINUE' };
      const field = String(params.field ?? '');
      if (!field) return { kind: 'CONTINUE' };
      const contact = await prisma.contact.findFirst({ where: { id: ctx.contactId, workspaceId: ctx.workspaceId }, select: { customFields: true } });
      if (!contact) return { kind: 'CONTINUE' };
      const customFields = { ...((contact.customFields as Record<string, unknown>) ?? {}), [field]: params.value ?? null };
      await prisma.contact.update({ where: { id: ctx.contactId }, data: { customFields: customFields as Prisma.InputJsonValue } });
      return { kind: 'CONTINUE' };
    }

    case 'ASSIGN_OPERATOR': {
      if (!ctx.conversationId) return { kind: 'CONTINUE' };
      const userId = String(params.userId ?? '');
      const assignee = userId
        ? await prisma.user.findFirst({ where: { id: userId, workspaceId: ctx.workspaceId }, select: { id: true } })
        : null;
      if (!assignee) return { kind: 'CONTINUE' };
      await activateHumanControl({ conversationId: ctx.conversationId, workspaceId: ctx.workspaceId, assignedUserId: assignee.id });
      return { kind: 'CONTINUE' };
    }

    case 'UPDATE_OPPORTUNITY_STAGE': {
      if (!ctx.contactId) return { kind: 'CONTINUE' };
      const stageKey = String(params.stageKey ?? '');
      if (!stageKey) return { kind: 'CONTINUE' };
      const stage = await prisma.pipelineStage.findFirst({ where: { workspaceId: ctx.workspaceId, key: stageKey as never } });
      const opportunity = await prisma.opportunity.findFirst({
        where: { workspaceId: ctx.workspaceId, contactId: ctx.contactId, status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
      });
      if (stage && opportunity) {
        await prisma.opportunity.update({ where: { id: opportunity.id }, data: { stageId: stage.id } });
      }
      return { kind: 'CONTINUE' };
    }

    case 'CREATE_TASK': {
      await prisma.activity.create({
        data: {
          workspaceId: ctx.workspaceId,
          contactId: ctx.contactId,
          type: 'NOTE',
          title: String(params.title ?? 'Tarea de automatización'),
          description: typeof params.description === 'string' ? params.description : undefined,
          dueAt: new Date(Date.now() + Number(params.dueInHours ?? 24) * 3_600_000),
        },
      });
      return { kind: 'CONTINUE' };
    }

    case 'CREATE_CHECKOUT': {
      const result = await toolByName('createCheckoutLink')!.execute({ productId: String(params.productId ?? '') }, { workspaceId: ctx.workspaceId, contactId: ctx.contactId, conversationId: ctx.conversationId, agentRunId: ctx.runId });
      if (!result.ok) return { kind: 'ERROR', error: result.error };
      await prisma.automationFlowVersion.update({ where: { id: ctx.flowVersionId }, data: { checkoutsCreated: { increment: 1 } } });
      const checkout = result.data as Record<string, unknown>;
      if (ctx.conversationId && typeof checkout.checkoutUrl === 'string') await sendChannelMessage({ workspaceId: ctx.workspaceId, conversationId: ctx.conversationId, text: checkout.checkoutUrl });
      return { kind: 'CONTINUE', state: { ...ctx.state, checkout } };
    }

    case 'REQUEST_HUMAN_HANDOFF': {
      if (ctx.conversationId) {
        await activateHumanControl({ conversationId: ctx.conversationId, workspaceId: ctx.workspaceId, openConversation: true });
        await prisma.automationFlowVersion.update({ where: { id: ctx.flowVersionId }, data: { handoffs: { increment: 1 } } });
      }
      return { kind: 'CONTINUE' };
    }

    default:
      return { kind: 'CONTINUE' };
  }
}
