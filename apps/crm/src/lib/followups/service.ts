import { randomBytes } from 'node:crypto';
import {
  ConsentChannel,
  FollowUpMessageMode,
  JourneyEnrollmentStatus,
  JourneyStatus,
  JourneyStepAction,
  JourneyTrigger,
  type WorkspaceRole,
} from '../../../generated/prisma/client';
import { recordAudit } from '../domain/audit';
import { assertRequirements } from '../entitlements';
import { journeyRequirements } from '../entitlements/requirements';
import { advanceEnrollment, enroll } from '../marketing/journeys';
import { canManageMarketing } from '../marketing/roles';
import { prisma } from '../prisma';
import { COMMERCIAL_TRIGGERS, EXIT_REASON, MESSAGE_ACTIONS, summarizeFollowUps, type StrategyInput } from './rules';

/**
 * Servicio de estrategias de seguimiento (Punto 7). Una estrategia ES un
 * journey: aqui solo se agrega lo que la interfaz necesita (validacion de
 * producto, permisos, auditoria, metricas), el motor es el de siempre.
 */

export type Actor = { id: string; role: WorkspaceRole; workspaceId: string };

export class FollowUpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

function requireManager(actor: Actor) {
  if (!canManageMarketing(actor.role)) {
    throw new FollowUpError('Solo el owner o un admin puede gestionar seguimientos.', 403, 'FORBIDDEN');
  }
}

function slug(name: string) {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${/^[a-z]/.test(base) ? base : `s-${base}`}-${randomBytes(3).toString('hex')}`;
}

function stepRows(input: StrategyInput) {
  return input.steps.map((step, index) => ({
    position: index + 1,
    label: step.label,
    action: step.action as JourneyStepAction,
    delayHours: step.delayHours,
    channel: step.action === 'SEND_WHATSAPP' ? ConsentChannel.WHATSAPP : null,
    messageMode: step.messageMode as FollowUpMessageMode,
    body: step.body?.trim() || null,
    aiGoal: step.messageMode === 'AI' ? step.aiGoal?.trim() || null : null,
  }));
}

async function assertProduct(workspaceId: string, productId: string | null) {
  if (!productId) return;
  const product = await prisma.product.findFirst({ where: { id: productId, workspaceId }, select: { id: true } });
  if (!product) throw new FollowUpError('El producto no existe en este workspace.', 404, 'PRODUCT_NOT_FOUND');
}

async function findOwned(workspaceId: string, id: string) {
  const journey = await prisma.journey.findFirst({ where: { id, workspaceId }, include: { steps: { orderBy: { position: 'asc' } } } });
  if (!journey) throw new FollowUpError('Estrategia no encontrada.', 404, 'NOT_FOUND');
  return journey;
}

// --- Lectura -----------------------------------------------------------------------

export async function listStrategies(workspaceId: string) {
  const journeys = await prisma.journey.findMany({
    where: { workspaceId, status: { not: JourneyStatus.ARCHIVED } },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
    include: { steps: { orderBy: { position: 'asc' } }, product: { select: { id: true, name: true } } },
  });
  const ids = journeys.map((journey) => journey.id);
  const [enrollments, runs] = await Promise.all([
    prisma.journeyEnrollment.findMany({
      where: { workspaceId, journeyId: { in: ids } },
      select: { journeyId: true, status: true, exitReason: true, simulated: true, messagesSent: true, purchaseOrderId: true, nextRunAt: true },
    }),
    prisma.journeyStepRun.findMany({
      where: { workspaceId, journeyId: { in: ids } },
      select: { journeyId: true, status: true, executedAt: true, enrollment: { select: { simulated: true } } },
    }),
  ]);

  return journeys.map((journey) => {
    const own = enrollments.filter((row) => row.journeyId === journey.id);
    const ownRuns = runs.filter((row) => row.journeyId === journey.id);
    const upcoming = own
      .filter((row) => row.status === JourneyEnrollmentStatus.ACTIVE && row.nextRunAt)
      .map((row) => row.nextRunAt!.getTime())
      .sort((a, b) => a - b)[0];
    const last = ownRuns.map((row) => row.executedAt.getTime()).sort((a, b) => b - a)[0];
    return {
      ...journey,
      stats: summarizeFollowUps(own, ownRuns.map((row) => ({ status: row.status, simulated: row.enrollment.simulated }))),
      nextRunAt: upcoming ? new Date(upcoming) : null,
      lastRunAt: last ? new Date(last) : null,
    };
  });
}

export async function getStrategy(workspaceId: string, id: string) {
  const journey = await prisma.journey.findFirst({
    where: { id, workspaceId },
    include: { steps: { orderBy: { position: 'asc' } }, product: { select: { id: true, name: true } } },
  });
  if (!journey) throw new FollowUpError('Estrategia no encontrada.', 404, 'NOT_FOUND');

  const [enrollments, allEnrollments, runs] = await Promise.all([
    prisma.journeyEnrollment.findMany({
      where: { workspaceId, journeyId: id },
      orderBy: { enteredAt: 'desc' },
      take: 100,
      include: {
        contact: { select: { id: true, firstName: true, lastName: true } },
        opportunity: { select: { id: true, title: true } },
        purchaseOrder: { select: { id: true, total: true, currency: true } },
        runs: { orderBy: { position: 'asc' } },
      },
    }),
    prisma.journeyEnrollment.findMany({
      where: { workspaceId, journeyId: id },
      select: { status: true, exitReason: true, simulated: true, messagesSent: true, purchaseOrderId: true, nextRunAt: true },
    }),
    prisma.journeyStepRun.findMany({ where: { workspaceId, journeyId: id }, select: { status: true, enrollment: { select: { simulated: true } } } }),
  ]);

  return {
    ...journey,
    enrollments,
    stats: summarizeFollowUps(allEnrollments, runs.map((row) => ({ status: row.status, simulated: row.enrollment.simulated }))),
  };
}

/** Historial de seguimientos de un contacto (ficha del contacto). */
export async function contactFollowUps(workspaceId: string, contactId: string) {
  return prisma.journeyEnrollment.findMany({
    where: { workspaceId, contactId },
    orderBy: { enteredAt: 'desc' },
    take: 20,
    include: { journey: { select: { id: true, name: true, trigger: true } }, runs: { orderBy: { position: 'asc' } } },
  });
}

// --- Escritura -----------------------------------------------------------------------

export async function createStrategy(actor: Actor, input: StrategyInput) {
  requireManager(actor);
  await assertProduct(actor.workspaceId, input.productId);
  const journey = await prisma.journey.create({
    data: {
      workspaceId: actor.workspaceId,
      key: slug(input.name),
      name: input.name,
      description: input.description || null,
      trigger: input.trigger as JourneyTrigger,
      productId: input.productId,
      maxMessages: input.maxMessages,
      minGapHours: input.minGapHours,
      simulate: input.simulate,
      steps: { create: stepRows(input) },
    },
  });
  await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.id, action: 'followup.created', entity: 'Journey', entityId: journey.id, metadata: { trigger: input.trigger, steps: input.steps.length, simulate: input.simulate } });
  return journey;
}

export async function updateStrategy(actor: Actor, id: string, input: StrategyInput) {
  requireManager(actor);
  const current = await findOwned(actor.workspaceId, id);
  if (current.status === JourneyStatus.PUBLISHED) {
    throw new FollowUpError('Pausa la estrategia antes de editarla.', 409, 'PUBLISHED');
  }
  if (current.status === JourneyStatus.ARCHIVED) throw new FollowUpError('La estrategia está desactivada.', 409, 'ARCHIVED');
  await assertProduct(actor.workspaceId, input.productId);

  const journey = await prisma.$transaction(async (tx) => {
    await tx.journeyStep.deleteMany({ where: { journeyId: id } });
    return tx.journey.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description || null,
        trigger: input.trigger as JourneyTrigger,
        productId: input.productId,
        maxMessages: input.maxMessages,
        minGapHours: input.minGapHours,
        simulate: input.simulate,
        version: { increment: 1 },
        steps: { create: stepRows(input) },
      },
    });
  });
  await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.id, action: 'followup.updated', entity: 'Journey', entityId: id, metadata: { version: journey.version } });
  return journey;
}

export async function duplicateStrategy(actor: Actor, id: string) {
  requireManager(actor);
  const source = await findOwned(actor.workspaceId, id);
  const name = `${source.name} (copia)`.slice(0, 120);
  const journey = await prisma.journey.create({
    data: {
      workspaceId: actor.workspaceId,
      key: slug(name),
      name,
      description: source.description,
      trigger: source.trigger,
      productId: source.productId,
      segmentId: source.segmentId,
      exitConditions: source.exitConditions ?? undefined,
      maxMessages: source.maxMessages,
      minGapHours: source.minGapHours,
      // La copia nace en prueba: no puede empezar a escribirle a nadie sin revisarla.
      simulate: true,
      steps: {
        create: source.steps.map((step) => ({
          position: step.position,
          label: step.label,
          action: step.action,
          delayHours: step.delayHours,
          channel: step.channel,
          templateId: step.templateId,
          body: step.body,
          messageMode: step.messageMode,
          aiGoal: step.aiGoal,
        })),
      },
    },
  });
  await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.id, action: 'followup.duplicated', entity: 'Journey', entityId: journey.id, metadata: { from: id } });
  return journey;
}

/**
 * Activar, pausar o desactivar. Desactivar cancela las inscripciones activas;
 * pausar las congela (el motor las reprograma sin escribir).
 */
export async function setStrategyStatus(actor: Actor, id: string, action: 'publish' | 'pause' | 'archive') {
  requireManager(actor);
  const journey = await findOwned(actor.workspaceId, id);

  if (action === 'publish') {
    if (journey.status === JourneyStatus.ARCHIVED) throw new FollowUpError('La estrategia está desactivada.', 409, 'ARCHIVED');
    if (journey.steps.length === 0) throw new FollowUpError('Una estrategia sin pasos no se puede activar.', 409, 'NO_STEPS');
    if (!journey.steps.some((step) => MESSAGE_ACTIONS.includes(step.action))) {
      throw new FollowUpError('La estrategia necesita al menos un paso que envíe un mensaje.', 409, 'NO_MESSAGE_STEP');
    }
    if (journey.steps.some((step) => step.action === 'SEND_EMAIL')) {
      throw new FollowUpError('Los pasos de correo se gestionan en Journeys de email.', 409, 'EMAIL_STEP');
    }
    await assertRequirements(actor.workspaceId, journeyRequirements(journey), 'activar este seguimiento');
    const updated = await prisma.journey.update({
      where: { id },
      // `publishedAt` se renueva al activar desde borrador: los disparadores
      // solo miran hechos posteriores. Reactivar una pausa conserva la fecha.
      data: { status: JourneyStatus.PUBLISHED, publishedAt: journey.publishedAt ?? new Date(), pausedAt: null, planLimitedAt: null, planLimitedReason: null },
    });
    await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.id, action: 'followup.published', entity: 'Journey', entityId: id, metadata: { simulate: journey.simulate } });
    return updated;
  }

  if (action === 'pause') {
    if (journey.status !== JourneyStatus.PUBLISHED) throw new FollowUpError('Solo se pausa una estrategia activa.', 409, 'NOT_PUBLISHED');
    const updated = await prisma.journey.update({ where: { id }, data: { status: JourneyStatus.PAUSED, pausedAt: new Date() } });
    await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.id, action: 'followup.paused', entity: 'Journey', entityId: id });
    return updated;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const canceled = await tx.journeyEnrollment.updateMany({
      where: { journeyId: id, workspaceId: actor.workspaceId, status: JourneyEnrollmentStatus.ACTIVE },
      data: { status: JourneyEnrollmentStatus.CANCELED, exitedAt: new Date(), exitReason: EXIT_REASON.ARCHIVED, nextRunAt: null },
    });
    const row = await tx.journey.update({ where: { id }, data: { status: JourneyStatus.ARCHIVED, pausedAt: new Date() } });
    return { row, canceled: canceled.count };
  });
  await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.id, action: 'followup.archived', entity: 'Journey', entityId: id, metadata: { canceledEnrollments: updated.canceled } });
  return updated.row;
}

async function findEnrollment(actor: Actor, enrollmentId: string) {
  const enrollment = await prisma.journeyEnrollment.findFirst({ where: { id: enrollmentId, workspaceId: actor.workspaceId } });
  if (!enrollment) throw new FollowUpError('Seguimiento no encontrado.', 404, 'NOT_FOUND');
  return enrollment;
}

export async function cancelEnrollment(actor: Actor, enrollmentId: string) {
  requireManager(actor);
  await findEnrollment(actor, enrollmentId);
  const result = await prisma.journeyEnrollment.updateMany({
    where: { id: enrollmentId, workspaceId: actor.workspaceId, status: JourneyEnrollmentStatus.ACTIVE },
    data: { status: JourneyEnrollmentStatus.CANCELED, exitedAt: new Date(), exitReason: EXIT_REASON.MANUAL, nextRunAt: null },
  });
  if (result.count === 0) throw new FollowUpError('El seguimiento ya no está activo.', 409, 'NOT_ACTIVE');
  await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.id, action: 'journey.exited', entity: 'JourneyEnrollment', entityId: enrollmentId, metadata: { reason: EXIT_REASON.MANUAL } });
  return { canceled: true };
}

/** Adelanta el siguiente paso de una inscripcion de PRUEBA (QA y demo). */
export async function runEnrollmentNow(actor: Actor, enrollmentId: string, now = new Date()) {
  requireManager(actor);
  const enrollment = await findEnrollment(actor, enrollmentId);
  if (!enrollment.simulated) {
    throw new FollowUpError('Solo se adelanta un seguimiento en modo prueba.', 409, 'NOT_SIMULATED');
  }
  return advanceEnrollment(enrollmentId, now, { force: true });
}

/**
 * Inscribe un contacto en una estrategia en modo prueba, sin esperar al
 * disparador. Una estrategia real no admite esto: entra solo quien cumple.
 */
export async function testEnroll(actor: Actor, journeyId: string, contactId: string, now = new Date()) {
  requireManager(actor);
  const journey = await findOwned(actor.workspaceId, journeyId);
  if (!journey.simulate) throw new FollowUpError('La inscripción manual solo existe en modo prueba.', 409, 'NOT_SIMULATED');
  if (!COMMERCIAL_TRIGGERS.includes(journey.trigger as (typeof COMMERCIAL_TRIGGERS)[number])) {
    throw new FollowUpError('Esta estrategia no es comercial.', 409, 'NOT_COMMERCIAL');
  }
  const conversation = await prisma.conversation.findFirst({
    where: { workspaceId: actor.workspaceId, contactId },
    orderBy: { lastMessageAt: 'desc' },
    select: { id: true },
  });
  const result = await enroll({
    workspaceId: actor.workspaceId,
    journeyId,
    contactId,
    reason: 'inscripcion de prueba',
    triggeredAt: now,
    conversationId: conversation?.id ?? null,
    now,
  });
  if (!result.enrolled) throw new FollowUpError(`No se pudo inscribir (${result.reason}).`, 409, result.reason);
  await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.id, action: 'followup.test_enrolled', entity: 'JourneyEnrollment', entityId: result.enrollmentId, metadata: { journeyId, contactId } });
  return result;
}
