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
import { sendChannelMessage } from '../channels/outbound';
import { isLocalDemo } from '../testing/local-mode';
import { LocalKnowledgeProvider } from './local-provider';
import { activateHumanControl } from '../whatsapp/human-control';
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
import { isMediaKind, mediaLabel } from '../media/policy';
import { AlertKind, AlertSeverity } from '../../../generated/prisma/client';
import { raiseAlert } from '../billing/alerts';
import { canWorkspaceConsume } from '../billing/subscription-access';
import { recordUsage } from '../billing/usage';
import { checkAiCredits, recordAiCredits } from '../entitlements/ai-credits';
import { isWorkspaceActive } from '../onboarding/activation';
import { isEnabled } from '../ops/flags';
import { queuePushSafely } from '../push/events';
import { loadProductSalesLayer } from '../product-sales-brain/context';
import { loadWorkspaceKnowledgeLayer } from '../workspace-knowledge/context';
import { loadChannelContext } from '../whatsapp/channel-runtime';

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
  agentVersionId?: string;
  goal?: string;
  allowedTools?: string[];
  exitConditions?: string[];
  maxTurns?: number;
  /** En el simulador solo permite crear un pedido DRAFT y su link firmado. */
  allowSimulatorCheckout?: boolean;
};

export type RunAgentResult = {
  status: AgentRunStatus;
  runId?: string;
  reply?: string | null;
  escalated?: boolean;
  skippedReason?: string;
  toolCalls?: { name: string; ok: boolean }[];
  context?: {
    productId: string | null;
    productContextId: string | null;
    productContextUpdatedAt: string | null;
    workspaceSourceIds: string[];
    workspaceChunks: { id: string; sourceId: string; sourceType: string; title: string }[];
  };
};

/**
 * Toma el lock de la conversacion.
 *
 * Sin esto, dos mensajes seguidos del cliente lanzarian dos ejecuciones que
 * responderian dos veces y se pisarian el estado. El lock vence solo, para que
 * un proceso caido no deje la conversacion muda.
 */
async function acquireLock(conversationId: string, owner: string) {
  // Estas columnas son timestamp UTC sin zona, igual que los DateTime de Prisma.
  // Una sola sentencia atomica. Un `upsert` de Prisma NO sirve aqui: dos
  // ejecuciones simultaneas sobre una conversacion sin estado previo intentan
  // insertar las dos y una revienta contra el unique.
  //
  // El `WHERE` del DO UPDATE es la clave: si el lock vigente es de otro, no
  // actualiza ninguna fila y no devuelve nada, que es justo "no lo obtuve".
  const rows = await prisma.$queryRaw<{ locked_by: string | null }[]>`
    INSERT INTO conversation_agent_states (id, conversation_id, locked_until, locked_by, updated_at)
    VALUES (${randomUUID()}, ${conversationId}, (now() AT TIME ZONE 'UTC') + make_interval(secs => ${LOCK_MS / 1000}), ${owner}, (now() AT TIME ZONE 'UTC'))
    ON CONFLICT (conversation_id) DO UPDATE
       SET locked_until = (now() AT TIME ZONE 'UTC') + make_interval(secs => ${LOCK_MS / 1000}),
           locked_by = ${owner},
           updated_at = (now() AT TIME ZONE 'UTC')
     WHERE conversation_agent_states.locked_until IS NULL
        OR conversation_agent_states.locked_until <= (now() AT TIME ZONE 'UTC')
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
async function publishedVersion(workspaceId: string, kind: AgentKind, versionId?: string, draft = false, definitionId?: string) {
  if (versionId) {
    const version = await prisma.agentVersion.findFirst({ where: { id: versionId, ...(draft ? { status: { in: [AgentVersionStatus.DRAFT, AgentVersionStatus.PUBLISHED] } } : { status: AgentVersionStatus.PUBLISHED }), definition: { workspaceId, ...(draft ? {} : { isActive: true, planLimitedAt: null }) } }, include: { definition: true } });
    return version ? { definition: version.definition, version } : null;
  }
  const definition = await prisma.agentDefinition.findFirst({
    // planLimitedAt: el agente existe y sigue activo, pero el plan vigente no
    // lo permite (downgrade). No atiende hasta que vuelva a estar permitido.
    // Punto 8: el agente predeterminado del numero, si lo hay; si no, el de
    // la clase pedida. Siempre dentro del workspace.
    where: { workspaceId, ...(definitionId ? { id: definitionId } : { key: kind }), isActive: true, planLimitedAt: null },
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
      product: { select: { id: true } },
    },
  });

  if (!conversation) {
    return { status: AgentRunStatus.FAILED, skippedReason: 'conversacion no encontrada' };
  }

  // P0-C: canal limitado por el plan. El mensaje entrante se guardo; la IA no
  // gasta creditos en una respuesta que el canal no puede enviar.
  const channelLimited = conversation.channelId
    ? await prisma.whatsAppChannel.count({ where: { id: conversation.channelId, planLimitedAt: { not: null } } })
    : conversation.channelAccountId
      ? await prisma.channelAccount.count({ where: { id: conversation.channelAccountId, planLimitedAt: { not: null } } })
      : 0;
  if (channelLimited > 0) {
    return { status: AgentRunStatus.ABORTED, skippedReason: 'canal limitado por el plan' };
  }

  // Regla 7 de la spec: la IA no responde cuando hay un humano a cargo.
  if (conversation.mode === ConversationMode.HUMAN_ACTIVE) {
    return { status: AgentRunStatus.ABORTED, skippedReason: 'humano activo' };
  }

  if (conversation.mode === ConversationMode.PAUSED || conversation.mode === ConversationMode.CLOSED) {
    return { status: AgentRunStatus.ABORTED, skippedReason: `conversacion en ${conversation.mode}` };
  }

  // Punto 8: la configuracion del numero de WhatsApp se vuelve a leer aqui: el
  // job corre segundos despues del webhook y pudo cambiar (IA apagada, fuera
  // de horario, agente despublicado). El simulador no depende del numero.
  let channelAgentId: string | undefined;
  if (conversation.channelId && !input.dryRun && !input.agentVersionId) {
    const context = await loadChannelContext(conversation.channelId, input.workspaceId, conversation.product?.id ?? null, new Date(), conversation.campaignRouteId);
    if (!context.aiAllowed) {
      return { status: AgentRunStatus.ABORTED, skippedReason: context.humanReason ?? 'el número no permite atención automática' };
    }
    channelAgentId = context.agentId ?? undefined;
  }

  const published = await publishedVersion(input.workspaceId, AgentKind.SALES, input.agentVersionId, input.dryRun, channelAgentId);
  if (!published) {
    return { status: AgentRunStatus.ABORTED, skippedReason: 'el workspace no tiene un agente publicado' };
  }

  // Suscripcion vencida: no se gasta IA, tampoco en el simulador (que llama al
  // mismo proveedor). Va antes del cupo para no avisar "se agoto la IA" cuando
  // lo que paso es que el plan no esta al dia.
  if (!(await canWorkspaceConsume(input.workspaceId))) {
    return { status: AgentRunStatus.ABORTED, skippedReason: 'la suscripcion no esta vigente' };
  }

  // P0-C: la IA se mide en creditos del plan (entitlements/ai-credits). Aplica
  // tambien al simulador: probar al agente llama al mismo proveedor y cuesta.
  const credits = await checkAiCredits(input.workspaceId);
  if (!credits.allowed) {
    if (credits.reason === 'CREDITS_EXHAUSTED' && !input.dryRun) {
      // Se avisa, no se falla en silencio: quedarse sin IA sin que nadie lo
      // sepa es indistinguible de que la IA este rota.
      await raiseAlert({
        workspaceId: input.workspaceId,
        kind: AlertKind.ALLOWANCE_EXCEEDED,
        severity: AlertSeverity.CRITICAL,
        title: 'Se agotaron los creditos de IA del mes',
        detail: credits.source === 'LEGACY'
          ? 'Se agoto el presupuesto de IA del plan. El agente dejo de responder y las conversaciones pasan a una persona.'
          : `${Math.floor(credits.usedCredits)} de ${credits.limitCredits} creditos. El agente dejo de responder y las conversaciones pasan a una persona.`,
        // Un plan legacy conserva su clave de aviso (presupuesto en pesos).
        dedupeKey: credits.source === 'LEGACY' ? 'allowance-exceeded:ai_cost_clp' : 'allowance-exceeded:ai_credits',
      });
    }
    return {
      status: AgentRunStatus.ABORTED,
      skippedReason: credits.reason === 'CREDITS_EXHAUSTED' ? 'sin cupo de IA en el plan' : 'el plan no incluye IA',
    };
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
  }

  const owner = randomUUID();
  if (!(await acquireLock(conversation.id, owner))) {
    return { status: AgentRunStatus.ABORTED, skippedReason: 'otra ejecucion tiene la conversacion' };
  }

  // Punto 8: una conversacion que nadie tomo todavia (WAITING) pasa a la IA
  // recien aqui, cuando todos los frenos anteriores dejaron correr al agente
  // (agente publicado, plan, creditos, workspace activo, horario del numero).
  // Sin esto el agente gastaba la llamada y la respuesta se descartaba por no
  // estar en AI_ACTIVE. Igual que startFlowRun; no toca lockVersion, y nunca
  // una conversacion con humano, pausada o cerrada.
  if (!input.dryRun && conversation.mode === ConversationMode.WAITING) {
    await prisma.conversation.updateMany({
      where: { id: conversation.id, workspaceId: input.workspaceId, mode: ConversationMode.WAITING, lockVersion: conversation.lockVersion },
      data: { mode: ConversationMode.AI_ACTIVE },
    });
  }

  const startedAt = Date.now();
  const provider = input.provider ?? (isLocalDemo() ? new LocalKnowledgeProvider() : new OpenAIProvider());

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
      version: { ...published.version,
        instructions: [published.version.instructions, input.goal ? `Objetivo de este paso: ${input.goal}` : '', input.exitConditions?.length ? `Condiciones de salida: ${input.exitConditions.join('; ')}` : ''].filter(Boolean).join('\n'),
        allowedTools: input.allowedTools
          ? published.version.allowedTools.filter(t => input.allowedTools!.includes(t))
          : conversation.product
            ? [...new Set([...published.version.allowedTools, 'createCheckoutLink'])]
            : published.version.allowedTools,
        maxSteps: Math.min(published.version.maxSteps, input.maxTurns ?? published.version.maxSteps),
      },
      dryRun: input.dryRun ?? false,
      allowSimulatorCheckout: input.allowSimulatorCheckout ?? false,
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
      await activateHumanControl({
        conversationId: conversation.id,
        workspaceId: input.workspaceId,
      });
      await recordAudit({
        workspaceId: input.workspaceId,
        action: 'agent.provider_failed_escalated',
        entity: 'AgentRun',
        entityId: run.id,
        metadata: { error: message, code: error.code ?? null },
      });
      await queuePushSafely({
        workspaceId: input.workspaceId,
        kind: 'HUMAN_ATTENTION',
        dedupeKey: `agent-provider-failed:${run.id}`,
        conversationId: conversation.id,
      });
    }

    return { status: AgentRunStatus.FAILED, runId: run.id, skippedReason: message };
  } finally {
    await releaseLock(conversation.id, owner);
  }
}

type LoopInput = {
  run: { id: string; workspaceId: string; agentDefinitionId: string };
  provider: ModelProvider;
  conversation: {
    id: string;
    summary: string | null;
    lockVersion: number;
    contact: { id: string; firstName: string; lastName: string };
    workspace: { name: string };
    product: { id: string } | null;
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
  allowSimulatorCheckout: boolean;
  startedAt: number;
};

async function executeLoop(input: LoopInput): Promise<RunAgentResult> {
  const { run, provider, conversation, version } = input;

  const history = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'desc' },
    take: CONTEXT_MESSAGES,
    select: { direction: true, text: true, senderType: true, type: true },
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
    // Un adjunto sin texto se nombra en vez de omitirse. Saltarlo dejaba al
    // agente contestando como si el cliente no hubiera mandado nada, que es
    // justo el momento en que el cliente cree haber dicho lo importante.
    // Se describe, no se interpreta: el modelo no ve el archivo.
    const content = message.text ?? (isMediaKind(message.type) ? `[${mediaLabel(message.type)} recibido, sin texto]` : null);
    if (!content) continue;
    messages.push({
      role: message.direction === 'INBOUND' ? 'user' : 'assistant',
      content,
    });
  }

  const [workspaceLayer, productLayer] = await Promise.all([
    loadWorkspaceKnowledgeLayer(run.workspaceId, lastInbound?.text ?? ''),
    loadProductSalesLayer(run.workspaceId, conversation.product?.id ?? null),
  ]);
  const instructions = buildInstructions({
    agentInstructions: version.instructions,
    workspaceName: conversation.workspace.name,
    contactName: conversation.contact.firstName,
    workspaceKnowledge: workspaceLayer.content,
    productKnowledge: productLayer?.content,
  });

  const toolContext: ToolContext = {
    workspaceId: run.workspaceId,
    productId: productLayer?.productId ?? null,
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

      const ownership = await prisma.conversation.findFirst({ where: { id: conversation.id, workspaceId: run.workspaceId }, select: { lockVersion: true, mode: true } });
      if (!ownership || ownership.lockVersion !== conversation.lockVersion || ownership.mode !== 'AI_ACTIVE') {
        await prisma.agentRun.update({ where: { id: run.id }, data: { status: AgentRunStatus.ABORTED, error: 'Control humano cambió durante la ejecución.' } });
        return { status: AgentRunStatus.ABORTED, runId: run.id, skippedReason: 'Control humano cambió durante la ejecución.' };
      }
      const validated = tool.schema.safeParse(call.arguments);
      const simulatorCheckout = input.dryRun && input.allowSimulatorCheckout && call.name === 'createCheckoutLink';
      const result = !validated.success ? { ok: false as const, error: 'Argumentos inválidos.' } : input.dryRun && tool.hasSideEffects && !simulatorCheckout
        ? { ok: true as const, data: { simulated: true, tool: call.name } }
        : await tool.execute(validated.data, toolContext);
      toolCalls.push({ name: call.name, ok: result.ok });

      if (['assign_to_human', 'requestHumanHandoff'].includes(call.name) && result.ok) escalated = true;

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

  const latest = await prisma.conversation.findFirst({ where: { id: conversation.id, workspaceId: run.workspaceId }, select: { lockVersion: true, mode: true } });
  if (!escalated && (!latest || latest.lockVersion !== conversation.lockVersion || latest.mode !== 'AI_ACTIVE')) {
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: AgentRunStatus.ABORTED, error: 'Respuesta invalidada por toma humana.', output: null } });
    return { status: AgentRunStatus.ABORTED, runId: run.id, skippedReason: 'Respuesta invalidada por toma humana.' };
  }
  if (reply && !input.dryRun) {
    await sendChannelMessage({
      workspaceId: run.workspaceId,
      conversationId: conversation.id,
      text: reply,
      senderType: MessageSenderType.AI,
      origin: 'AI',
      agentRunId: run.id,
      expectedLockVersion: conversation.lockVersion,
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

  // P0-C: el mismo consumo, en creditos ponderados (lo que limita el plan).
  await recordAiCredits({
    workspaceId: run.workspaceId,
    provider: provider.name,
    model: version.model,
    inputTokens,
    outputTokens,
    referenceType: 'AgentRun',
    referenceId: run.id,
  });

  await prisma.conversationAgentState.upsert({
    where: { conversationId: conversation.id },
    create: { conversationId: conversation.id, lastRunId: run.id, currentAgentId: input.version.id },
    update: { lastRunId: run.id, currentAgentId: input.version.id },
  });
  // P34: el embudo y el recorrido atribuyen la venta por Conversation.currentAgentId, que nadie escribía.
  if (!input.dryRun) {
    await prisma.conversation.updateMany({ where: { id: conversation.id, workspaceId: run.workspaceId }, data: { currentAgentId: run.agentDefinitionId } });
  }

  // D22: el runner mandaba `conversation.summary` al modelo y nadie lo escribia.
  // Pasados los 12 mensajes de contexto, todo lo anterior desaparecia.
  await refreshConversationSummary(conversation.id);

  return {
    status,
    runId: run.id,
    reply,
    escalated,
    toolCalls: toolCalls.map(({ name, ok }) => ({ name, ok })),
    context: {
      productId: productLayer?.productId ?? null,
      productContextId: productLayer?.contextId ?? null,
      productContextUpdatedAt: productLayer?.updatedAt.toISOString() ?? null,
      workspaceSourceIds: workspaceLayer.sourceIds,
      workspaceChunks: workspaceLayer.chunks,
    },
  };
}

async function escalate(conversationId: string, run: { id: string; workspaceId: string }, reason: string) {
  await activateHumanControl({
    conversationId,
    workspaceId: run.workspaceId,
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
  await queuePushSafely({
    workspaceId: run.workspaceId,
    kind: 'HUMAN_ATTENTION',
    dedupeKey: `agent-escalated:${run.id}`,
    conversationId,
  });
}
