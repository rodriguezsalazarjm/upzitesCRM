import {
  Channel,
  ConsentChannel,
  ConversationMode,
  ConversationStatus,
  FollowUpMessageMode,
  JourneyStepAction,
  JourneyStepRunStatus,
  SendCategory,
  type Journey,
  type JourneyEnrollment,
  type JourneyStep,
} from '../../../generated/prisma/client';
import { ChannelOutboundError, sendChannelMessage } from '../channels/outbound';
import { evaluateSend, getPolicy, isQuietHour, nextAllowedInstant, recordSend } from '../marketing/policy';
import { prisma } from '../prisma';
import { OutboundError } from '../whatsapp/outbound';
import { composeAiFollowUp } from './ai';
import { EXIT_REASON, renderMessage } from './rules';

/**
 * Ejecucion de un paso de mensaje de seguimiento (Punto 7).
 *
 * El orden de las comprobaciones es el contrato: limites de la inscripcion,
 * conversacion por el canal, politica de envio (consentimiento, horario,
 * topes), ventana de 24 horas, modo de la conversacion. Solo si todo pasa se
 * compone el texto y se registra el paso.
 *
 * La fila `JourneyStepRun` se crea ANTES de enviar y es unica por
 * (inscripcion, posicion). Si el proceso muere a mitad, la siguiente corrida la
 * encuentra en SENDING y la retoma: en WhatsApp con la misma clave de outbox
 * (no puede salir dos veces); en Instagram, cuyo envio es directo y sin
 * idempotencia, se marca FAILED en vez de arriesgar un duplicado.
 */

export type MessageStepOutcome =
  | { kind: 'DONE'; detail?: string }
  | { kind: 'SKIPPED'; reason: string }
  | { kind: 'RESCHEDULE'; at: Date; reason: string }
  | { kind: 'EXIT'; reason: string };

const WINDOW_MS = 24 * 3_600_000;
export const WINDOW_BLOCK_REASON = 'fuera de la ventana de 24 horas: requiere una plantilla aprobada';

export function idempotencyKeyFor(enrollmentId: string, position: number) {
  return `followup:${enrollmentId}:${position}`;
}

function channelOf(action: JourneyStepAction) {
  return action === JourneyStepAction.SEND_INSTAGRAM ? Channel.INSTAGRAM : Channel.WHATSAPP;
}

type RunWrite = {
  status: JourneyStepRunStatus;
  reason?: string | null;
  text?: string | null;
  aiGenerated?: boolean;
  messageId?: string | null;
  channel?: string | null;
};

/** Crea (o completa) la fila del paso. Un paso terminal no se reescribe. */
async function writeRun(enrollment: JourneyEnrollment, step: JourneyStep, now: Date, data: RunWrite) {
  return prisma.journeyStepRun.upsert({
    where: { enrollmentId_position: { enrollmentId: enrollment.id, position: step.position } },
    create: {
      workspaceId: enrollment.workspaceId,
      journeyId: enrollment.journeyId,
      enrollmentId: enrollment.id,
      stepId: step.id,
      position: step.position,
      label: step.label,
      scheduledFor: enrollment.nextRunAt,
      executedAt: now,
      ...data,
    },
    update: { ...data, executedAt: now },
  });
}

async function countMessage(enrollment: JourneyEnrollment, journey: Journey, channel: Channel, now: Date, real: boolean) {
  await prisma.journeyEnrollment.update({
    where: { id: enrollment.id },
    data: { messagesSent: { increment: 1 }, lastMessageAt: now },
  });
  // Los topes de frecuencia del workspace solo cuentan envios reales. Instagram
  // no tiene canal de consentimiento propio en la politica: su tope es el de la
  // estrategia (maximo de mensajes y separacion minima).
  if (real && channel === Channel.WHATSAPP) {
    await recordSend({
      workspaceId: enrollment.workspaceId,
      contactId: enrollment.contactId,
      channel: ConsentChannel.WHATSAPP,
      category: SendCategory.PROMOTIONAL,
      journeyId: journey.id,
      sentAt: now,
    });
  }
}

/** Retoma un paso que quedo a mitad de envio (reinicio del worker). */
async function resumeSending(
  enrollment: JourneyEnrollment,
  journey: Journey,
  step: JourneyStep,
  run: { channel: string | null; text: string | null; aiGenerated: boolean },
  conversationId: string | null,
  now: Date,
): Promise<MessageStepOutcome> {
  if (journey.simulate || enrollment.simulated) {
    await writeRun(enrollment, step, now, { status: JourneyStepRunStatus.SIMULATED, reason: 'retomado tras un reinicio' });
    await countMessage(enrollment, journey, channelOf(step.action), now, false);
    return { kind: 'DONE', detail: 'simulado' };
  }

  if (run.channel !== Channel.WHATSAPP || !run.text || !conversationId) {
    // Envio directo sin idempotencia: no se sabe si el proveedor lo acepto.
    // Repetirlo podria duplicar un mensaje real; se deja constancia y se sigue.
    await writeRun(enrollment, step, now, {
      status: JourneyStepRunStatus.FAILED,
      reason: 'resultado incierto tras un reinicio: no se reintenta para no duplicar',
    });
    return { kind: 'SKIPPED', reason: 'resultado incierto' };
  }

  return deliver(enrollment, journey, step, conversationId, Channel.WHATSAPP, run.text, run.aiGenerated, now);
}

async function deliver(
  enrollment: JourneyEnrollment,
  journey: Journey,
  step: JourneyStep,
  conversationId: string,
  channel: Channel,
  text: string,
  aiGenerated: boolean,
  now: Date,
): Promise<MessageStepOutcome> {
  try {
    const message = await sendChannelMessage({
      workspaceId: enrollment.workspaceId,
      conversationId,
      text,
      senderType: 'SYSTEM',
      origin: 'JOURNEY',
      idempotencyKey: channel === Channel.WHATSAPP ? idempotencyKeyFor(enrollment.id, step.position) : undefined,
    });
    await writeRun(enrollment, step, now, { status: JourneyStepRunStatus.SENT, messageId: message.id, text, aiGenerated, channel });
    await countMessage(enrollment, journey, channel, now, true);
    return { kind: 'DONE', detail: message.id };
  } catch (error) {
    // Los rechazos del canal ocurren antes de crear el mensaje (consentimiento,
    // control humano, canal desconectado, plan): son definitivos para este paso.
    if (error instanceof OutboundError || error instanceof ChannelOutboundError) {
      const human = error instanceof OutboundError && error.code === 'AI_BLOCKED';
      await writeRun(enrollment, step, now, {
        status: channel === Channel.WHATSAPP ? JourneyStepRunStatus.BLOCKED : JourneyStepRunStatus.FAILED,
        reason: error.message,
        text,
        aiGenerated,
        channel,
      });
      if (human) return { kind: 'EXIT', reason: EXIT_REASON.HUMAN };
      return { kind: 'SKIPPED', reason: error.message };
    }
    // Error inesperado (base, red): la fila queda en SENDING y se retoma con la
    // misma clave cuando venza el lease de la inscripcion.
    throw error;
  }
}

export async function runMessageStep(
  enrollment: JourneyEnrollment,
  journey: Journey,
  step: JourneyStep,
  now: Date,
): Promise<MessageStepOutcome> {
  const channel = channelOf(step.action);
  const simulated = journey.simulate || enrollment.simulated;

  const existing = await prisma.journeyStepRun.findUnique({
    where: { enrollmentId_position: { enrollmentId: enrollment.id, position: step.position } },
    select: { status: true, channel: true, text: true, aiGenerated: true, messageId: true },
  });
  if (existing && existing.status !== JourneyStepRunStatus.SENDING) {
    // Ya ejecutado (otra corrida lo termino y murio antes de avanzar).
    return { kind: 'DONE', detail: 'ya ejecutado' };
  }

  // --- Limites de la estrategia (backend, no interfaz) ----------------------
  if (!existing && enrollment.messagesSent >= journey.maxMessages) {
    return { kind: 'EXIT', reason: EXIT_REASON.MAX_MESSAGES };
  }
  if (!existing && enrollment.lastMessageAt && journey.minGapHours > 0) {
    const earliest = new Date(enrollment.lastMessageAt.getTime() + journey.minGapHours * 3_600_000);
    if (earliest > now) return { kind: 'RESCHEDULE', at: earliest, reason: 'separacion minima entre mensajes' };
  }

  // --- Conversacion por el canal del paso ------------------------------------
  const conversation = await prisma.conversation.findFirst({
    where: {
      workspaceId: enrollment.workspaceId,
      contactId: enrollment.contactId,
      channelType: channel,
      status: { not: ConversationStatus.CLOSED },
      ...(enrollment.conversationId ? { id: enrollment.conversationId } : {}),
    },
    orderBy: { lastMessageAt: 'desc' },
    select: { id: true, mode: true, lastInboundAt: true, customerServiceWindowEndsAt: true },
  });

  if (existing) return resumeSending(enrollment, journey, step, existing, conversation?.id ?? null, now);

  if (!conversation) {
    const reason = channel === Channel.INSTAGRAM ? 'el contacto no tiene una conversación abierta por Instagram' : 'el contacto no tiene una conversación abierta por WhatsApp';
    await writeRun(enrollment, step, now, { status: JourneyStepRunStatus.SKIPPED, reason, channel });
    return { kind: 'SKIPPED', reason };
  }

  // --- Politica: consentimiento, horario y topes -----------------------------
  const policy = await getPolicy(enrollment.workspaceId);
  if (isQuietHour(now, policy)) {
    if (policy.outOfHoursBehavior === 'SKIP') {
      await writeRun(enrollment, step, now, { status: JourneyStepRunStatus.SKIPPED, reason: 'vencio fuera del horario permitido', channel });
      return { kind: 'SKIPPED', reason: 'fuera de horario' };
    }
    return { kind: 'RESCHEDULE', at: nextAllowedInstant(now, policy), reason: 'QUIET_HOURS' };
  }

  if (channel === Channel.WHATSAPP) {
    const decision = await evaluateSend({
      workspaceId: enrollment.workspaceId,
      contactId: enrollment.contactId,
      channel: ConsentChannel.WHATSAPP,
      category: SendCategory.PROMOTIONAL,
      now,
      policy,
    });
    if (!decision.allowed) {
      if (decision.retryAt) return { kind: 'RESCHEDULE', at: decision.retryAt, reason: decision.reason };
      await writeRun(enrollment, step, now, { status: JourneyStepRunStatus.BLOCKED, reason: `politica de envio: ${decision.reason}`, channel });
      return { kind: 'SKIPPED', reason: decision.reason };
    }
  }

  // --- Ventana de 24 horas ----------------------------------------------------
  // Fuera de ella WhatsApp solo admite plantillas aprobadas (Punto 26) e
  // Instagram no admite mensajes de la marca. Nunca se manda texto libre.
  const windowOpen =
    channel === Channel.WHATSAPP
      ? Boolean(conversation.customerServiceWindowEndsAt && conversation.customerServiceWindowEndsAt > now)
      : Boolean(conversation.lastInboundAt && conversation.lastInboundAt.getTime() + WINDOW_MS > now.getTime());
  if (!windowOpen) {
    await writeRun(enrollment, step, now, { status: JourneyStepRunStatus.BLOCKED, reason: WINDOW_BLOCK_REASON, channel });
    return { kind: 'SKIPPED', reason: WINDOW_BLOCK_REASON };
  }

  if (conversation.mode === ConversationMode.HUMAN_ACTIVE) return { kind: 'EXIT', reason: EXIT_REASON.HUMAN };
  if (conversation.mode !== ConversationMode.AI_ACTIVE) {
    const reason = 'la conversación no está en modo automático';
    await writeRun(enrollment, step, now, { status: JourneyStepRunStatus.BLOCKED, reason, channel });
    return { kind: 'SKIPPED', reason };
  }

  // --- Texto -------------------------------------------------------------------
  const [workspace, contact, product] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: enrollment.workspaceId }, select: { name: true } }),
    prisma.contact.findFirst({ where: { id: enrollment.contactId, workspaceId: enrollment.workspaceId }, select: { firstName: true } }),
    journey.productId ? prisma.product.findFirst({ where: { id: journey.productId, workspaceId: enrollment.workspaceId }, select: { name: true } }) : null,
  ]);
  const fixed = step.body ? renderMessage(step.body, { nombre: contact?.firstName, producto: product?.name, negocio: workspace?.name }) : null;

  let text = fixed;
  let aiGenerated = false;
  let note: string | null = null;
  if (step.messageMode === FollowUpMessageMode.AI) {
    const ai = await composeAiFollowUp({
      workspaceId: enrollment.workspaceId,
      journey: { id: journey.id, name: journey.name, productId: journey.productId, trigger: journey.trigger },
      step: { position: step.position, label: step.label, aiGoal: step.aiGoal },
      enrollment: { id: enrollment.id, contactId: enrollment.contactId, conversationId: enrollment.conversationId },
      conversationId: conversation.id,
      now,
    });
    if (ai.ok) {
      text = ai.text;
      aiGenerated = true;
    } else {
      note = `${ai.reason}; se usó el texto de respaldo`;
    }
  }

  if (!text) {
    const reason = note?.replace('; se usó el texto de respaldo', '') ?? 'el paso no tiene texto';
    await writeRun(enrollment, step, now, { status: JourneyStepRunStatus.FAILED, reason, channel });
    return { kind: 'SKIPPED', reason };
  }

  // La fila en SENDING es la reserva: a partir de aqui un reinicio retoma, no repite.
  await writeRun(enrollment, step, now, { status: JourneyStepRunStatus.SENDING, text, aiGenerated, channel, reason: note });

  if (simulated) {
    await writeRun(enrollment, step, now, { status: JourneyStepRunStatus.SIMULATED, text, aiGenerated, channel, reason: note });
    await countMessage(enrollment, journey, channel, now, false);
    return { kind: 'DONE', detail: 'simulado' };
  }

  return deliver(enrollment, journey, step, conversation.id, channel, text, aiGenerated, now);
}

/** Paso sin mensaje (tarea, temperatura): se deja constancia en el historial. */
export async function recordActionRun(enrollment: JourneyEnrollment, step: JourneyStep, now: Date, status: 'DONE' | 'SKIPPED', reason?: string) {
  await writeRun(enrollment, step, now, { status, reason: reason ?? null });
}
