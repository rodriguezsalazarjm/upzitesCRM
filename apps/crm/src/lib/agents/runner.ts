import { randomUUID } from 'node:crypto';
import {
  AgentKind,
  AgentRunStatus,
  AgentVersionStatus,
  ConversationMode,
  MessageSenderType,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { recordAudit } from '../domain/audit';
import { queueOutboundMessage } from '../whatsapp/outbound';
import { buildInstructions, looksLikeHallucination, needsImmediateEscalation } from './guardrails';
import {
  estimateCostClp,
  ModelProviderError,
  OpenAIProvider,
  type ModelMessage,
  type ModelProvider,
} from './provider';
import { toolByName, toolSpecsFor, type ToolContext } from './tools';
import { refreshConversationSummary } from './summary';
import { AlertKind, AlertSeverity } from '../../../generated/prisma/client';
import { raiseAlert } from '../billing/alerts';
import { checkAllowance, recordUsage } from '../billing/usage';
import { isWorkspaceActive } from '../onboarding/activation';
import { isEnabled } from '../ops/flags';

/** Cuanto se sostiene el lock de una conversacion. */
const LOCK_MS = 60_000;
/** Mensajes recientes que se mandan como contexto, ademas del resumen. */
const CONTEXT_MESSAGES = 12;

export type RunAgentInput = {
  workspaceId: string;
  conversationId: string;
  trigger?: string;
  provider?: ModelProvider;
  /** Modo simulador: ejecuta y responde, pero no envia el mensaje al cliente. */
  dryRun?: boolean;
};

export type RunAgentResult = {
  status: AgentRunStatus;
  runId?: string;
  reply?: string | null;
  escalated?: boolean;
  skippedReason?: string;
  toolCalls?: { name: string; ok: boolean }[];
};

/**
 * Toma el lock de la conversacion.
 *
 * Sin esto, dos mensajes seguidos del cliente lanzarian dos ejecuciones que
 * responderian dos veces y se pisarian el estado. El lock vence solo, para que
 * un proceso caido no deje la conversacion muda.
 */
async function acquireLock(conversationId: string, owner: string) {
  // Una sola sentencia atomica. Un `upsert` de Prisma NO sirve aqui: dos
  // ejecuciones simultaneas sobre una conversacion sin estado previo intentan
  // insertar las dos y una revienta contra el unique.
  //
  // El `WHERE` del DO UPDATE es la clave: si el lock vigente es de otro, no
  // actualiza ninguna fila y no devuelve nada, que es justo "no lo obtuve".
  const rows = await prisma.$queryRaw<{ locked_by: string | null }[]>`
    INSERT INTO conversation_agent_states (id, conversation_id, locked_until, locked_by, updated_at)
    VALUES (${randomUUID()}, ${conversationId}, now() + make_interval(secs => ${LOCK_MS / 1000}), ${owner}, now())
    ON CONFLICT (conversation_id) DO UPDATE
       SET locked_until = now() + make_interval(secs => ${LOCK_MS / 1000}),
           locked_by = ${owner},
           updated_at = now()
     WHERE conversation_agent_states.locked_until IS NULL
        OR conversation_agent_states.locked_until <= now()
    RETURNING conversation_agent_states.locked_by;
  `;

  return rows.length > 0 && rows[0].locked_by === owner;
}

async function releaseLock(conversationId: string, owner: string) {
  await prisma.conversationAgentState.updateMany({
    where: { conversationId, lockedBy: owner },
    data: { lockedUntil: null, lockedBy: null },
  });
}

/** Version publicada del agente, o null si el workspace no publico ninguna. */
async function publishedVersion(workspaceId: string, kind: AgentKind) {
  const definition = await prisma.agentDefinition.findFirst({
    where: { workspaceId, key: kind, isActive: true },
    include: {
      versions: {
        where: { status: AgentVersionStatus.PUBLISHED },
        orderBy: { version: 'desc' },
        take: 1,
      },
    },
  });

  if (!definition || definition.versions.length === 0) return null;
  return { definition, version: definition.versions[0] };
}

/**
 * Ejecuta el agente sobre una conversacion.
 *
 * El orden de los chequeos importa: primero lo que puede abortar sin costo
 * (modo humano, lock), y solo despues se llama al modelo.
 */
export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, workspaceId: input.workspaceId },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true } },
      workspace: { select: { name: true } },
    },
  });

  if (!conversation) {
    return { status: AgentRunStatus.FAILED, skippedReason: 'conversacion no encontrada' };
  }

  // Regla 7 de la spec: la IA no responde cuando hay un humano a cargo.
  if (conversation.mode === ConversationMode.HUMAN_ACTIVE) {
    return { status: AgentRunStatus.ABORTED, skippedReason: 'humano activo' };
  }

  if (conversation.mode === ConversationMode.PAUSED || conversation.mode === ConversationMode.CLOSED) {
    return { status: AgentRunStatus.ABORTED, skippedReason: `conversacion en ${conversation.mode}` };
  }

  const published = await publishedVersion(input.workspaceId, AgentKind.SALES);
  if (!published) {
    return { status: AgentRunStatus.ABORTED, skippedReason: 'el workspace no tiene un agente publicado' };
  }

  // Fase 9: la IA no atiende sola hasta que el workspace se activa, y no pasa
  // del cupo de IA de su plan.
  //
  // Ambas comprobaciones se saltan en el simulador: probar al agente es
  // justamente uno de los pasos que hay que completar para poder activar, y
  // exigir la activacion para probarlo seria pedir la llave que esta dentro de
  // la casa.
  if (!input.dryRun) {
    // Fase 10: el freno de mano. Apagar la IA deja el resto del CRM intacto y
    // las conversaciones esperando a una persona, que es exactamente lo que se
    // quiere de un corte de emergencia.
    if (!(await isEnabled('AI_AGENTS', input.workspaceId))) {
      return { status: AgentRunStatus.ABORTED, skippedReason: 'agentes IA apagados' };
    }

    if (!(await isWorkspaceActive(input.workspaceId))) {
      return { status: AgentRunStatus.ABORTED, skippedReason: 'el workspace no esta activo' };
    }

    const budget = await checkAllowance({
      workspaceId: input.workspaceId,
      metric: 'ai_cost_clp',
      amount: 0,
    });

    if (!budget.allowed) {
      // Se avisa, no se falla en silencio: quedarse sin IA sin que nadie lo
      // sepa es indistinguible de que la IA este rota.
      await raiseAlert({
        workspaceId: input.workspaceId,
        kind: AlertKind.ALLOWANCE_EXCEEDED,
        severity: AlertSeverity.CRITICAL,
        title: 'Se agoto el cupo de IA del mes',
        detail: `${budget.used} de ${budget.limit} CLP. El agente dejo de responder y las conversaciones pasan a una persona.`,
        dedupeKey: 'allowance-exceeded:ai_cost_clp',
      });

      return { status: AgentRunStatus.ABORTED, skippedReason: 'sin cupo de IA en el plan' };
    }
  }

  const owner = randomUUID();
  if (!(await acquireLock(conversation.id, owner))) {
    return { status: AgentRunStatus.ABORTED, skippedReason: 'otra ejecucion tiene la conversacion' };
  }

  const startedAt = Date.now();
  const provider = input.provider ?? new OpenAIProvider();

  const run = await prisma.agentRun.create({
    data: {
      workspaceId: input.workspaceId,
      conversationId: conversation.id,
      agentDefinitionId: published.definition.id,
      agentVersionId: published.version.id,
      status: AgentRunStatus.RUNNING,
      trigger: input.trigger,
    },
  });

  try {
    return await executeLoop({
      run,
      provider,
      conversation,
      version: published.version,
      dryRun: input.dryRun ?? false,
      startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: AgentRunStatus.FAILED, error: message, latencyMs: Date.now() - startedAt },
    });

    // Un fallo del proveedor no puede dejar al cliente sin respuesta: se escala.
    if (error instanceof ModelProviderError) {
      await prisma.conversation.updateMany({
        where: { id: conversation.id },
        data: { mode: ConversationMode.HUMAN_ACTIVE },
      });
      await recordAudit({
        workspaceId: input.workspaceId,
        action: 'agent.provider_failed_escalated',
        entity: 'AgentRun',
        entityId: run.id,
        metadata: { error: message, code: error.code ?? null },
      });
    }

    return { status: AgentRunStatus.FAILED, runId: run.id, skippedReason: message };
  } finally {
    await releaseLock(conversation.id, owner);
  }
}

type LoopInput = {
  run: { id: string; workspaceId: string };
  provider: ModelProvider;
  conversation: {
    id: string;
    summary: string | null;
    contact: { id: string; firstName: string; lastName: string };
    workspace: { name: string };
  };
  version: {
    id: string;
    instructions: string;
    model: string;
    options: unknown;
    allowedTools: string[];
    maxSteps: number;
  };
  dryRun: boolean;
  startedAt: number;
};

async function executeLoop(input: LoopInput): Promise<RunAgentResult> {
  const { run, provider, conversation, version } = input;

  const history = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'desc' },
    take: CONTEXT_MESSAGES,
    select: { direction: true, text: true, senderType: true },
  });

  const ordered = history.reverse();
  const lastInbound = [...ordered].reverse().find((m) => m.direction === 'INBOUND');

  // Red de seguridad previa al modelo: ciertos mensajes se escalan sin gastar
  // un solo token.
  if (lastInbound?.text && needsImmediateEscalation(lastInbound.text)) {
    await escalate(conversation.id, run, 'patron de escalamiento en el mensaje del cliente');
    return { status: AgentRunStatus.ESCALATED, runId: run.id, escalated: true };
  }

  const messages: ModelMessage[] = [];

  // El resumen reemplaza al historial viejo: mandar la conversacion entera es
  // caro y casi nunca mejora la respuesta (spec, seccion 15).
  if (conversation.summary) {
    messages.push({ role: 'system', content: `Resumen de lo conversado: ${conversation.summary}` });
  }

  for (const message of ordered) {
    if (!message.text) continue;
    messages.push({
      role: message.direction === 'INBOUND' ? 'user' : 'assistant',
      content: message.text,
    });
  }

  const instructions = buildInstructions({
    agentInstructions: version.instructions,
    workspaceName: conversation.workspace.name,
    contactName: conversation.contact.firstName,
  });

  const toolContext: ToolContext = {
    workspaceId: run.workspaceId,
    conversationId: conversation.id,
    contactId: conversation.contact.id,
    agentRunId: run.id,
  };

  const specs = toolSpecsFor(version.allowedTools);
  const toolCalls: { name: string; ok: boolean; error?: string }[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let escalated = false;
  let reply: string | null = null;
  let steps = 0;

  while (steps < version.maxSteps) {
    steps += 1;

    const response = await provider.complete({
      model: version.model,
      instructions,
      messages,
      tools: specs,
      options: (version.options ?? undefined) as Record<string, unknown> | undefined,
    });

    inputTokens += response.inputTokens;
    outputTokens += response.outputTokens;

    if (response.toolCalls.length === 0) {
      reply = response.text;
      break;
    }

    for (const call of response.toolCalls) {
      // Lista blanca: lo que no autorizo la version del agente no se ejecuta,
      // aunque el modelo lo pida. El modelo recibe el rechazo como resultado.
      if (!version.allowedTools.includes(call.name)) {
        toolCalls.push({ name: call.name, ok: false, error: 'no autorizada' });
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          name: call.name,
          content: JSON.stringify({ ok: false, error: 'Herramienta no autorizada para este agente.' }),
        });
        await recordAudit({
          workspaceId: run.workspaceId,
          action: 'agent.tool_denied',
          entity: 'AgentRun',
          entityId: run.id,
          metadata: { tool: call.name },
        });
        continue;
      }

      const tool = toolByName(call.name);
      if (!tool) {
        toolCalls.push({ name: call.name, ok: false, error: 'inexistente' });
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          name: call.name,
          content: JSON.stringify({ ok: false, error: 'Esa herramienta no existe.' }),
        });
        continue;
      }

      const result = await tool.execute(call.arguments, toolContext);
      toolCalls.push({ name: call.name, ok: result.ok });

      if (call.name === 'assign_to_human' && result.ok) escalated = true;

      messages.push({
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: JSON.stringify(result),
      });
    }

    if (escalated) break;
  }

  const abortedBySteps = steps >= version.maxSteps && reply === null && !escalated;

  // Segunda red: si la respuesta suena a dato inventado, no se envia.
  if (reply && looksLikeHallucination(reply)) {
    await recordAudit({
      workspaceId: run.workspaceId,
      action: 'agent.reply_blocked_hallucination',
      entity: 'AgentRun',
      entityId: run.id,
      metadata: { reply },
    });
    await escalate(conversation.id, run, 'la respuesta afirmaba datos que el agente no puede conocer');
    escalated = true;
    reply = null;
  }

  if (reply && !input.dryRun) {
    await queueOutboundMessage({
      workspaceId: run.workspaceId,
      conversationId: conversation.id,
      text: reply,
      senderType: MessageSenderType.AI,
      agentRunId: run.id,
    });
  }

  const status = escalated
    ? AgentRunStatus.ESCALATED
    : abortedBySteps
      ? AgentRunStatus.ABORTED
      : AgentRunStatus.COMPLETED;

  const cost = estimateCostClp(version.model, inputTokens, outputTokens);

  await prisma.agentRun.update({
    where: { id: run.id },
    data: {
      status,
      output: reply,
      toolCalls: toolCalls as never,
      steps,
      inputTokens,
      outputTokens,
      costEstimate: cost,
      latencyMs: Date.now() - input.startedAt,
      escalated,
    },
  });

  // El consumo se mide por workspace: es la base de los limites de plan.
  // `recordUsage` escribe el detalle Y mueve el contador del periodo, que es lo
  // que se consulta antes de cada inferencia.
  //
  // Un solo registro, no uno por tokens y otro por costo: dos filas con el
  // mismo costo lo contarian dos veces en el total del periodo. La cantidad son
  // los tokens y el costo son los pesos, que es el cupo que el plan limita.
  await recordUsage({
    workspaceId: run.workspaceId,
    provider: provider.name,
    metric: 'ai_cost_clp',
    quantity: inputTokens + outputTokens,
    costClp: cost,
    referenceType: 'AgentRun',
    referenceId: run.id,
  });

  await prisma.conversationAgentState.upsert({
    where: { conversationId: conversation.id },
    create: { conversationId: conversation.id, lastRunId: run.id, currentAgentId: input.version.id },
    update: { lastRunId: run.id, currentAgentId: input.version.id },
  });

  // D22: el runner mandaba `conversation.summary` al modelo y nadie lo escribia.
  // Pasados los 12 mensajes de contexto, todo lo anterior desaparecia.
  await refreshConversationSummary(conversation.id);

  return {
    status,
    runId: run.id,
    reply,
    escalated,
    toolCalls: toolCalls.map(({ name, ok }) => ({ name, ok })),
  };
}

async function escalate(conversationId: string, run: { id: string; workspaceId: string }, reason: string) {
  await prisma.conversation.updateMany({
    where: { id: conversationId },
    data: { mode: ConversationMode.HUMAN_ACTIVE },
  });

  await prisma.agentRun.update({
    where: { id: run.id },
    data: { status: AgentRunStatus.ESCALATED, escalated: true, output: null },
  });

  await recordAudit({
    workspaceId: run.workspaceId,
    action: 'agent.escalated',
    entity: 'AgentRun',
    entityId: run.id,
    metadata: { reason },
  });
}
