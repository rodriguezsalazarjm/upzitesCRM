import {
  ActivityType,
  AiInsightType,
  AutomationExecutionStatus,
  AutomationTrigger,
  ConsentChannel,
  ConversationMode,
  LifecycleStatus,
  MessageSenderType,
  OpportunityStage,
  OpportunityStatus,
  ScheduledActionType,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { recordAudit } from '../domain/audit';
import {
  canContact,
  cancelByKey,
  cancelForContact,
  DEFAULT_QUIET_HOURS,
  recalculateContactScore,
  scheduleAction,
  transitionLifecycle,
} from '../domain';
import { queueOutboundMessage } from '../whatsapp/outbound';
import { scheduleAgentRun } from '../agents/dispatch';
import { evaluateGroup, type EventContext } from './conditions';
import type { DomainEvent } from './types';
import { parseActions, parseConditions, type AutomationActionConfig } from './schema';

/**
 * Motor `trigger -> conditions -> actions`.
 *
 * Reemplaza la regla hardcodeada que tenia el CRM. Cada regla se evalua contra
 * el contexto del evento y ejecuta sus acciones en orden.
 */
export type RuleRunResult = {
  ruleId: string;
  matched: boolean;
  actionsRun: number;
  skippedReason?: string;
  error?: string;
};

/**
 * Arma el contexto contra el que se evaluan las condiciones.
 *
 * Se lee una sola vez por evento y se comparte entre todas las reglas: evita N
 * consultas iguales cuando hay varias reglas para el mismo disparador.
 */
async function buildContext(event: DomainEvent): Promise<EventContext | null> {
  const context: EventContext = { ...(event.context ?? {}), trigger: event.trigger };

  if (event.contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: event.contactId, workspaceId: event.workspaceId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        lifecycleStatus: true,
        temperature: true,
        buyingIntent: true,
        leadScore: true,
        source: true,
        tags: true,
        value: true,
        lastActivityAt: true,
        createdAt: true,
      },
    });

    if (contact) {
      context.contact = {
        ...contact,
        // Se exponen en horas para que las condiciones se lean naturales:
        // "contact.hoursSinceLastActivity gte 72".
        hoursSinceLastActivity: contact.lastActivityAt
          ? Math.floor((Date.now() - contact.lastActivityAt.getTime()) / 3_600_000)
          : null,
        ageHours: Math.floor((Date.now() - contact.createdAt.getTime()) / 3_600_000),
      };
    } else {
      // El evento referencia un contacto que no es de este workspace. No se
      // evalua nada: las acciones escriben por id y crearian registros que
      // cruzan tenants (Prisma no ata el par workspace+contacto en la FK).
      return null;
    }
  }

  if (event.conversationId) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: event.conversationId, workspaceId: event.workspaceId },
      select: { id: true, mode: true, status: true, unreadCount: true, assignedUserId: true },
    });
    if (!conversation) return null;
    context.conversation = conversation;
  }

  if (event.opportunityId) {
    const opportunity = await prisma.opportunity.findFirst({
      where: { id: event.opportunityId, workspaceId: event.workspaceId },
      select: { id: true, title: true, value: true, status: true, stageId: true, probability: true },
    });
    if (!opportunity) return null;
    context.opportunity = opportunity;
  }

  return context;
}

/** Reglas activas del workspace para ese disparador. */
export async function matchingRules(workspaceId: string, trigger: AutomationTrigger) {
  return prisma.automationRule.findMany({
    where: { workspaceId, trigger, isActive: true },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Ejecuta todas las reglas que corresponden a un evento.
 *
 * La idempotencia vive en `AutomationExecution`: el unique (ruleId, dedupeKey)
 * hace que un reintento del trabajo no vuelva a ejecutar las acciones.
 */
export async function runAutomationsForEvent(event: DomainEvent): Promise<RuleRunResult[]> {
  const rules = await matchingRules(event.workspaceId, event.trigger);
  if (rules.length === 0) return [];

  const context = await buildContext(event);

  // Contexto nulo = el evento apunta a datos de otro workspace. Se descarta
  // entero y se deja rastro, porque es una señal de bug o de manipulacion.
  if (context === null) {
    await recordAudit({
      workspaceId: event.workspaceId,
      action: 'automation.event_rejected_cross_tenant',
      entity: 'AutomationRule',
      metadata: {
        trigger: event.trigger,
        dedupeKey: event.dedupeKey,
        contactId: event.contactId ?? null,
        conversationId: event.conversationId ?? null,
        opportunityId: event.opportunityId ?? null,
      },
    });
    return [];
  }

  const results: RuleRunResult[] = [];

  for (const rule of rules) {
    // Reserva del turno: si ya existe, esta regla ya actuo sobre este hecho.
    let reserved = true;
    try {
      await prisma.automationExecution.create({
        data: {
          workspaceId: event.workspaceId,
          ruleId: rule.id,
          dedupeKey: event.dedupeKey,
          contactId: event.contactId ?? null,
          status: AutomationExecutionStatus.MATCHED,
        },
      });
    } catch {
      reserved = false;
    }

    if (!reserved) {
      results.push({ ruleId: rule.id, matched: false, actionsRun: 0, skippedReason: 'ya ejecutada para este evento' });
      continue;
    }

    const conditions = parseConditions(rule.conditions);
    if (conditions === null) {
      await finishExecution(rule.id, event.dedupeKey, AutomationExecutionStatus.FAILED, 0, 'condiciones invalidas');
      results.push({ ruleId: rule.id, matched: false, actionsRun: 0, error: 'condiciones invalidas' });
      continue;
    }

    if (!evaluateGroup(conditions, context)) {
      await finishExecution(rule.id, event.dedupeKey, AutomationExecutionStatus.SKIPPED, 0);
      results.push({ ruleId: rule.id, matched: false, actionsRun: 0, skippedReason: 'condiciones no cumplidas' });
      continue;
    }

    // Ventana anti-repeticion por contacto, independiente del evento.
    if (rule.dedupeMinutes > 0 && event.contactId) {
      const since = new Date(Date.now() - rule.dedupeMinutes * 60_000);
      const recent = await prisma.automationExecution.count({
        where: {
          ruleId: rule.id,
          contactId: event.contactId,
          status: AutomationExecutionStatus.COMPLETED,
          createdAt: { gte: since },
        },
      });

      if (recent > 0) {
        await finishExecution(rule.id, event.dedupeKey, AutomationExecutionStatus.SKIPPED, 0, 'dentro de la ventana anti-repeticion');
        results.push({ ruleId: rule.id, matched: true, actionsRun: 0, skippedReason: 'ventana anti-repeticion' });
        continue;
      }
    }

    const actions = parseActions(rule.actions) ?? legacyAction(rule);
    if (!actions) {
      await finishExecution(rule.id, event.dedupeKey, AutomationExecutionStatus.FAILED, 0, 'acciones invalidas');
      results.push({ ruleId: rule.id, matched: true, actionsRun: 0, error: 'acciones invalidas' });
      continue;
    }

    let actionsRun = 0;
    let error: string | undefined;

    for (const action of actions) {
      try {
        await executeAction(action, event);
        actionsRun += 1;
      } catch (actionError) {
        error = actionError instanceof Error ? actionError.message : String(actionError);
        break;
      }
    }

    await finishExecution(
      rule.id,
      event.dedupeKey,
      error ? AutomationExecutionStatus.FAILED : AutomationExecutionStatus.COMPLETED,
      actionsRun,
      error,
    );

    await prisma.automationRule.update({
      where: { id: rule.id },
      data: { lastRunAt: new Date(), runCount: { increment: 1 } },
    });

    await recordAudit({
      workspaceId: event.workspaceId,
      action: 'automation.rule_executed',
      entity: 'AutomationRule',
      entityId: rule.id,
      metadata: { trigger: event.trigger, dedupeKey: event.dedupeKey, actionsRun, error: error ?? null },
    });

    results.push({ ruleId: rule.id, matched: true, actionsRun, error });
  }

  return results;
}

async function finishExecution(
  ruleId: string,
  dedupeKey: string,
  status: AutomationExecutionStatus,
  actionsRun: number,
  error?: string,
) {
  await prisma.automationExecution.update({
    where: { ruleId_dedupeKey: { ruleId, dedupeKey } },
    data: { status, actionsRun, error: error ?? null },
  });
}

/** Traduce una regla creada antes de la Fase 3 al formato nuevo. */
function legacyAction(rule: { action: string | null; actionConfig: unknown }): AutomationActionConfig[] | null {
  if (rule.action === 'CREATE_TASK') {
    const config = (rule.actionConfig ?? {}) as Record<string, unknown>;
    return [
      {
        type: 'CREATE_TASK',
        title: typeof config.title === 'string' ? config.title : 'Tarea automatica',
        dueInHours: 24,
      },
    ];
  }
  return null;
}

/**
 * Ejecuta una accion.
 *
 * Todas las acciones que tocan estado comercial pasan por los servicios de
 * dominio de la Fase 1: el motor no escribe estados a mano y por lo tanto no
 * puede saltarse las reglas ni la auditoria.
 */
async function executeAction(action: AutomationActionConfig, event: DomainEvent) {
  const { workspaceId, contactId } = event;

  switch (action.type) {
    case 'CREATE_TASK': {
      await prisma.activity.create({
        data: {
          workspaceId,
          contactId: contactId ?? null,
          type: ActivityType.CALL,
          title: action.title,
          description: action.description,
          dueAt: new Date(Date.now() + action.dueInHours * 3_600_000),
        },
      });
      return;
    }

    case 'SEND_MESSAGE': {
      if (!event.conversationId) throw new Error('SEND_MESSAGE requiere una conversacion.');

      if (action.requireConsent && contactId) {
        const decision = await canContact({ workspaceId, contactId, channel: ConsentChannel.WHATSAPP });
        if (!decision.allowed) {
          // No es un error: es el consentimiento haciendo su trabajo.
          await recordAudit({
            workspaceId,
            action: 'automation.message_blocked_by_consent',
            entity: 'Contact',
            entityId: contactId,
            metadata: { reason: decision.reason },
          });
          return;
        }
      }

      await queueOutboundMessage({
        workspaceId,
        conversationId: event.conversationId,
        text: action.text,
        senderType: MessageSenderType.SYSTEM,
      });
      return;
    }

    case 'SCHEDULE_ACTION': {
      await scheduleAction({
        workspaceId,
        contactId: contactId ?? null,
        type: action.actionType as ScheduledActionType,
        runAt: new Date(Date.now() + action.delayHours * 3_600_000),
        cancelKey: action.cancelKey ?? (contactId ? `${action.actionType}:${contactId}` : null),
        payload: (action.payload ?? {}) as never,
        quietHours: action.respectQuietHours ? DEFAULT_QUIET_HOURS : undefined,
      });
      return;
    }

    case 'CANCEL_ACTIONS': {
      if (action.cancelKey) {
        await cancelByKey({ workspaceId, cancelKey: action.cancelKey, reason: action.reason });
      } else if (contactId) {
        await cancelForContact({ workspaceId, contactId, reason: action.reason });
      }
      return;
    }

    case 'ADD_TAG':
    case 'REMOVE_TAG': {
      if (!contactId) return;
      const contact = await prisma.contact.findFirst({
        where: { id: contactId, workspaceId },
        select: { tags: true },
      });
      if (!contact) return;

      const tags =
        action.type === 'ADD_TAG'
          ? Array.from(new Set([...contact.tags, action.tag]))
          : contact.tags.filter((tag) => tag !== action.tag);

      await prisma.contact.update({ where: { id: contactId }, data: { tags } });
      return;
    }

    case 'MOVE_OPPORTUNITY': {
      const stage = await prisma.pipelineStage.findFirst({
        where: { workspaceId, key: action.stageKey as OpportunityStage },
      });
      if (!stage) throw new Error(`El workspace no tiene la etapa ${action.stageKey}.`);

      const where = event.opportunityId
        ? { id: event.opportunityId, workspaceId }
        : { workspaceId, contactId: contactId ?? undefined, status: OpportunityStatus.OPEN };

      await prisma.opportunity.updateMany({
        where,
        data: {
          stageId: stage.id,
          probability: stage.probability,
          status: stage.isWon
            ? OpportunityStatus.WON
            : stage.isLost
              ? OpportunityStatus.LOST
              : OpportunityStatus.OPEN,
        },
      });
      return;
    }

    case 'SET_LIFECYCLE': {
      if (!contactId) return;
      await transitionLifecycle({
        workspaceId,
        contactId,
        to: action.status as LifecycleStatus,
        reason: action.status === 'LOST' ? 'MARKED_LOST' : action.status === 'LEAD' ? 'REACTIVATED' : 'QUALIFIED_BY_USER',
      });
      return;
    }

    case 'ASSIGN_CONVERSATION': {
      if (!event.conversationId) return;
      const assignee = await prisma.user.findFirst({
        where: { id: action.userId, workspaceId },
        select: { id: true },
      });
      if (!assignee) throw new Error('El usuario a asignar no pertenece al workspace.');

      await prisma.conversation.updateMany({
        where: { id: event.conversationId, workspaceId },
        data: { assignedUserId: assignee.id, mode: ConversationMode.HUMAN_ACTIVE },
      });
      return;
    }

    case 'RECALCULATE_SCORE': {
      if (!contactId) return;
      await recalculateContactScore({ workspaceId, contactId });
      return;
    }

    case 'CREATE_INSIGHT': {
      await prisma.aiInsight.create({
        data: {
          workspaceId,
          contactId: contactId ?? null,
          type: AiInsightType.NEXT_BEST_ACTION,
          title: action.title,
          description: action.description,
          score: action.score,
        },
      });
      return;
    }

    case 'RUN_AGENT': {
      if (!event.conversationId) {
        // Un agente necesita una conversacion. Sin ella no es un error de la
        // regla: simplemente no aplica.
        return;
      }

      await scheduleAgentRun({
        workspaceId,
        conversationId: event.conversationId,
        trigger: `automation:${action.agentKey}`,
      });
      return;
    }

    default: {
      // Exhaustividad: si se agrega una accion al schema y no aqui, TypeScript
      // lo marca en compilacion.
      const exhaustive: never = action;
      throw new Error(`Accion no soportada: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export { type EventContext };
export type { DomainEvent };
