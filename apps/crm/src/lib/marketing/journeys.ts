import {
  ActivityType,
  ConsentChannel,
  ConversationMode,
  ConversationStatus,
  JourneyEnrollmentStatus,
  JourneyStatus,
  JourneyStepAction,
  JourneyTrigger,
  LeadTemperature,
  MessageDirection,
  MessageSenderType,
  OrderStatus,
  SendCategory,
  type Journey,
  type JourneyEnrollment,
  type JourneyStep,
} from '../../../generated/prisma/client';
import { recordAudit } from '../domain/audit';
import { sendEmail } from '../email/send';
import { prisma } from '../prisma';
import { queueOutboundMessage } from '../whatsapp/outbound';
import { exitEnrollments } from './enrollments';
import { evaluateSend, getPolicy, nextAllowedInstant, recordSend } from './policy';
import { buildWhere, parseDefinition, type SegmentDefinition } from './segments';

/**
 * Motor de journeys: la secuencia de seguimiento que recupera un lead solo.
 *
 * Tres ideas sostienen el diseno:
 *
 *  1. **Los pasos son datos.** Cuantos son, cuanto esperan y que dicen vive en
 *     la base. Un rubro nuevo configura su recuperacion sin desplegar codigo.
 *  2. **El estado avanza de a un paso y se persiste.** Reiniciar el proceso a
 *     mitad de un journey conserva el proximo paso, que es justamente lo que la
 *     spec exige comprobar en la Fase 10.
 *  3. **Un bloqueo reprograma, no consume el paso.** Si es de noche o el
 *     contacto ya alcanzo su tope, la inscripcion vuelve a dormir hasta que se
 *     pueda. Consumir el paso equivaldria a saltarse el mensaje en silencio.
 */

export type StepOutcome =
  | { kind: 'DONE'; detail?: string }
  | { kind: 'SKIPPED'; reason: string }
  | { kind: 'RESCHEDULE'; at: Date; reason: string }
  | { kind: 'EXIT'; reason: string };

// --- Entrada -----------------------------------------------------------------

export type EnrollInput = {
  workspaceId: string;
  journeyId: string;
  contactId: string;
  reason?: string;
  now?: Date;
};

export type EnrollResult =
  | { enrolled: true; enrollmentId: string; nextRunAt: Date }
  | { enrolled: false; reason: string };

/**
 * Inscribe un contacto.
 *
 * La unicidad `(journey, contacto)` de la base es la que garantiza que un
 * barrido repetido no vuelva a inscribir a nadie. Se apoya en ella en vez de
 * comprobar antes: entre la comprobacion y la escritura cabe otra corrida.
 */
export async function enroll(input: EnrollInput): Promise<EnrollResult> {
  const now = input.now ?? new Date();

  const journey = await prisma.journey.findFirst({
    where: { id: input.journeyId, workspaceId: input.workspaceId },
    include: { steps: { orderBy: { position: 'asc' }, take: 1 } },
  });

  if (!journey) return { enrolled: false, reason: 'NOT_FOUND' };
  if (journey.status !== JourneyStatus.PUBLISHED) return { enrolled: false, reason: 'NOT_PUBLISHED' };
  if (journey.steps.length === 0) return { enrolled: false, reason: 'NO_STEPS' };

  const contact = await prisma.contact.findFirst({
    where: { id: input.contactId, workspaceId: input.workspaceId },
    select: { id: true },
  });

  if (!contact) return { enrolled: false, reason: 'CONTACT_NOT_FOUND' };

  // El segmento de entrada acota a quien aplica el journey.
  if (journey.segmentId) {
    const segment = await prisma.segment.findFirst({
      where: { id: journey.segmentId, workspaceId: input.workspaceId },
    });
    const definition = segment ? parseDefinition(segment.definition) : null;

    if (definition) {
      const match = await prisma.contact.findFirst({
        where: { AND: [{ id: contact.id }, buildWhere(definition, input.workspaceId, now)] },
        select: { id: true },
      });
      if (!match) return { enrolled: false, reason: 'NOT_IN_SEGMENT' };
    }
  }

  const policy = await getPolicy(input.workspaceId);
  const first = journey.steps[0];
  const rawRunAt = new Date(now.getTime() + first.delayHours * 3_600_000);
  const nextRunAt = nextAllowedInstant(rawRunAt, policy);

  try {
    const enrollment = await prisma.journeyEnrollment.create({
      data: {
        workspaceId: input.workspaceId,
        journeyId: journey.id,
        contactId: contact.id,
        cancelKey: `journey:${journey.id}:${contact.id}`,
        currentPosition: first.position,
        nextRunAt,
      },
    });

    await recordAudit({
      workspaceId: input.workspaceId,
      action: 'journey.enrolled',
      entity: 'JourneyEnrollment',
      entityId: enrollment.id,
      metadata: { journey: journey.key, contactId: contact.id, reason: input.reason ?? null },
    });

    return { enrolled: true, enrollmentId: enrollment.id, nextRunAt };
  } catch {
    // Choque con la unicidad: ya estaba inscrito. No es un error.
    return { enrolled: false, reason: 'ALREADY_ENROLLED' };
  }
}

// --- Salidas -----------------------------------------------------------------

/**
 * Motivos de salida que valen para todo journey, sin importar como este
 * configurado: respondio, compro o lo tomo un humano (spec, seccion 9.4).
 *
 * Son reglas duras y se comprueban antes de cada paso, no al inscribir: lo que
 * importa es el estado en el momento de escribir, no el de hace tres dias.
 */
async function hardExitReason(
  enrollment: JourneyEnrollment,
  now: Date,
): Promise<string | null> {
  const since = enrollment.enteredAt;

  const replied = await prisma.message.findFirst({
    where: {
      workspaceId: enrollment.workspaceId,
      direction: MessageDirection.INBOUND,
      createdAt: { gt: since },
      conversation: { contactId: enrollment.contactId },
    },
    select: { id: true },
  });

  if (replied) return 'el contacto respondio';

  const purchased = await prisma.customerOrder.findFirst({
    where: {
      workspaceId: enrollment.workspaceId,
      contactId: enrollment.contactId,
      status: { in: [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.FULFILLED] },
      updatedAt: { gt: since },
    },
    select: { id: true },
  });

  if (purchased) return 'el contacto compro';

  const humanActive = await prisma.conversation.findFirst({
    where: {
      workspaceId: enrollment.workspaceId,
      contactId: enrollment.contactId,
      mode: ConversationMode.HUMAN_ACTIVE,
      status: { not: ConversationStatus.CLOSED },
    },
    select: { id: true },
  });

  if (humanActive) return 'un humano tomo la conversacion';

  // Condiciones declarativas opcionales, escritas con el mismo lenguaje que
  // los segmentos.
  return declarativeExitReason(enrollment, now);
}

async function declarativeExitReason(enrollment: JourneyEnrollment, now: Date) {
  const journey = await prisma.journey.findUnique({
    where: { id: enrollment.journeyId },
    select: { exitConditions: true },
  });

  const definition = journey?.exitConditions ? parseDefinition(journey.exitConditions) : null;
  if (!definition) return null;

  const match = await prisma.contact.findFirst({
    where: {
      AND: [{ id: enrollment.contactId }, buildWhere(definition, enrollment.workspaceId, now)],
    },
    select: { id: true },
  });

  return match ? 'cumplio una condicion de salida' : null;
}

async function finishEnrollment(
  enrollment: JourneyEnrollment,
  status: JourneyEnrollmentStatus,
  reason: string,
) {
  await prisma.journeyEnrollment.update({
    where: { id: enrollment.id },
    data: { status, exitedAt: new Date(), exitReason: reason, nextRunAt: null },
  });

  await recordAudit({
    workspaceId: enrollment.workspaceId,
    action: status === JourneyEnrollmentStatus.COMPLETED ? 'journey.completed' : 'journey.exited',
    entity: 'JourneyEnrollment',
    entityId: enrollment.id,
    metadata: { reason },
  });
}

// --- Ejecucion de un paso ----------------------------------------------------

async function runStep(
  enrollment: JourneyEnrollment,
  journey: Journey,
  step: JourneyStep,
  now: Date,
): Promise<StepOutcome> {
  switch (step.action) {
    case JourneyStepAction.SEND_EMAIL: {
      const template = step.templateId
        ? await prisma.emailTemplate.findUnique({
            where: { id: step.templateId },
            select: { key: true },
          })
        : null;

      const result = await sendEmail({
        workspaceId: enrollment.workspaceId,
        contactId: enrollment.contactId,
        category: SendCategory.PROMOTIONAL,
        templateKey: template?.key,
        subject: template ? undefined : step.label,
        bodyHtml: template ? undefined : `<p>${step.body ?? ''}</p>`,
        bodyText: template ? undefined : (step.body ?? ''),
        journeyId: journey.id,
        now,
      });

      if (result.status === 'SENT') return { kind: 'DONE', detail: result.emailMessageId };

      if (result.status === 'FAILED') {
        return result.retryable
          ? { kind: 'RESCHEDULE', at: new Date(now.getTime() + 3_600_000), reason: result.error }
          : { kind: 'SKIPPED', reason: result.error };
      }

      // Silencio o tope: se reprograma. Cualquier otro motivo es definitivo.
      return result.retryAt
        ? { kind: 'RESCHEDULE', at: result.retryAt, reason: result.reason }
        : { kind: 'SKIPPED', reason: result.reason };
    }

    case JourneyStepAction.SEND_WHATSAPP: {
      const decision = await evaluateSend({
        workspaceId: enrollment.workspaceId,
        contactId: enrollment.contactId,
        channel: ConsentChannel.WHATSAPP,
        category: SendCategory.PROMOTIONAL,
        now,
      });

      if (!decision.allowed) {
        return decision.retryAt
          ? { kind: 'RESCHEDULE', at: decision.retryAt, reason: decision.reason }
          : { kind: 'SKIPPED', reason: decision.reason };
      }

      const conversation = await prisma.conversation.findFirst({
        where: {
          workspaceId: enrollment.workspaceId,
          contactId: enrollment.contactId,
          status: { not: ConversationStatus.CLOSED },
        },
        orderBy: { lastMessageAt: 'desc' },
        select: { id: true },
      });

      // Sin conversacion abierta no hay por donde escribir. No es un fallo del
      // journey: es que ese contacto nunca hablo por WhatsApp.
      if (!conversation) return { kind: 'SKIPPED', reason: 'NO_CONVERSATION' };

      await queueOutboundMessage({
        workspaceId: enrollment.workspaceId,
        conversationId: conversation.id,
        text: step.body ?? step.label,
        senderType: MessageSenderType.SYSTEM,
      });

      await recordSend({
        workspaceId: enrollment.workspaceId,
        contactId: enrollment.contactId,
        channel: ConsentChannel.WHATSAPP,
        category: SendCategory.PROMOTIONAL,
        journeyId: journey.id,
      });

      return { kind: 'DONE' };
    }

    case JourneyStepAction.CREATE_TASK: {
      await prisma.activity.create({
        data: {
          workspaceId: enrollment.workspaceId,
          contactId: enrollment.contactId,
          type: ActivityType.CALL,
          title: step.label,
          description: step.body,
          dueAt: now,
        },
      });
      return { kind: 'DONE' };
    }

    case JourneyStepAction.SET_TEMPERATURE: {
      const temperature = (step.body ?? '').trim().toUpperCase();
      const valid = temperature in LeadTemperature ? (temperature as LeadTemperature) : LeadTemperature.COLD;

      await prisma.contact.update({
        where: { id: enrollment.contactId },
        data: { temperature: valid },
      });

      return { kind: 'DONE' };
    }

    case JourneyStepAction.EXIT:
      return { kind: 'EXIT', reason: step.label };

    default:
      return { kind: 'SKIPPED', reason: 'accion desconocida' };
  }
}

// --- Avance ------------------------------------------------------------------

export type AdvanceResult = {
  enrollmentId: string;
  outcome: StepOutcome['kind'] | 'NOT_DUE' | 'NOT_ACTIVE';
  detail?: string;
};

/**
 * Ejecuta el paso vencido de una inscripcion y deja lista la siguiente.
 *
 * Toma la inscripcion con un update condicional: solo avanza quien logra mover
 * `nextRunAt` a null, asi dos corridas simultaneas del worker no ejecutan el
 * mismo paso dos veces.
 */
export async function advanceEnrollment(enrollmentId: string, now = new Date()): Promise<AdvanceResult> {
  const claimed = await prisma.journeyEnrollment.updateMany({
    where: {
      id: enrollmentId,
      status: JourneyEnrollmentStatus.ACTIVE,
      nextRunAt: { lte: now },
    },
    data: { nextRunAt: null },
  });

  if (claimed.count === 0) return { enrollmentId, outcome: 'NOT_DUE' };

  const enrollment = await prisma.journeyEnrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
  });

  const journey = await prisma.journey.findUniqueOrThrow({ where: { id: enrollment.journeyId } });

  if (journey.status !== JourneyStatus.PUBLISHED) {
    // Un journey pausado no escribe, pero la inscripcion no se pierde: vuelve a
    // mirarse en una hora y sigue donde estaba cuando lo reactiven.
    await prisma.journeyEnrollment.update({
      where: { id: enrollment.id },
      data: { nextRunAt: new Date(now.getTime() + 3_600_000) },
    });
    return { enrollmentId, outcome: 'NOT_ACTIVE', detail: journey.status };
  }

  const exitReason = await hardExitReason(enrollment, now);
  if (exitReason) {
    await finishEnrollment(enrollment, JourneyEnrollmentStatus.EXITED, exitReason);
    return { enrollmentId, outcome: 'EXIT', detail: exitReason };
  }

  const step = await prisma.journeyStep.findFirst({
    where: { journeyId: journey.id, position: enrollment.currentPosition },
  });

  if (!step) {
    await finishEnrollment(enrollment, JourneyEnrollmentStatus.COMPLETED, 'sin mas pasos');
    return { enrollmentId, outcome: 'DONE', detail: 'completado' };
  }

  let outcome: StepOutcome;

  try {
    outcome = await runStep(enrollment, journey, step, now);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.journeyEnrollment.update({
      where: { id: enrollment.id },
      data: { lastError: message, nextRunAt: new Date(now.getTime() + 3_600_000) },
    });
    return { enrollmentId, outcome: 'RESCHEDULE', detail: message };
  }

  if (outcome.kind === 'RESCHEDULE') {
    // Ojo: NO se avanza `currentPosition`. El paso sigue pendiente.
    await prisma.journeyEnrollment.update({
      where: { id: enrollment.id },
      data: { nextRunAt: outcome.at, lastError: outcome.reason },
    });
    return { enrollmentId, outcome: 'RESCHEDULE', detail: outcome.reason };
  }

  if (outcome.kind === 'EXIT') {
    await finishEnrollment(enrollment, JourneyEnrollmentStatus.EXITED, outcome.reason);
    return { enrollmentId, outcome: 'EXIT', detail: outcome.reason };
  }

  // DONE y SKIPPED avanzan igual: un paso omitido por falta de consentimiento
  // no debe dejar la inscripcion atascada para siempre.
  const next = await prisma.journeyStep.findFirst({
    where: { journeyId: journey.id, position: { gt: step.position } },
    orderBy: { position: 'asc' },
  });

  if (!next) {
    await prisma.journeyEnrollment.update({
      where: { id: enrollment.id },
      data: {
        currentPosition: step.position + 1,
        stepsCompleted: { increment: 1 },
        lastError: outcome.kind === 'SKIPPED' ? outcome.reason : null,
      },
    });

    const finished = await prisma.journeyEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    await finishEnrollment(finished, JourneyEnrollmentStatus.COMPLETED, 'ultimo paso ejecutado');
    return { enrollmentId, outcome: outcome.kind, detail: 'completado' };
  }

  const policy = await getPolicy(enrollment.workspaceId);
  const rawNext = new Date(now.getTime() + next.delayHours * 3_600_000);

  await prisma.journeyEnrollment.update({
    where: { id: enrollment.id },
    data: {
      currentPosition: next.position,
      stepsCompleted: { increment: 1 },
      nextRunAt: nextAllowedInstant(rawNext, policy),
      lastError: outcome.kind === 'SKIPPED' ? outcome.reason : null,
    },
  });

  return { enrollmentId, outcome: outcome.kind, detail: outcome.kind === 'SKIPPED' ? outcome.reason : undefined };
}

/** Ejecuta las inscripciones vencidas. Lo llama el worker y el cron. */
export async function processDueEnrollments(limit = 100, now = new Date()) {
  const due = await prisma.journeyEnrollment.findMany({
    where: { status: JourneyEnrollmentStatus.ACTIVE, nextRunAt: { lte: now } },
    orderBy: { nextRunAt: 'asc' },
    take: limit,
    select: { id: true },
  });

  const results: AdvanceResult[] = [];
  for (const enrollment of due) {
    results.push(await advanceEnrollment(enrollment.id, now));
  }

  return { processed: results.length, results };
}

// --- Inscripcion automatica por disparador -----------------------------------

/**
 * Traduce un disparador a los contactos que deberian entrar.
 *
 * El filtro es el mismo lenguaje de segmentos, para no tener dos formas de
 * decir "quien califica".
 */
const TRIGGER_AUDIENCE: Record<JourneyTrigger, SegmentDefinition | null> = {
  [JourneyTrigger.NO_ACTIVITY]: {
    match: 'ALL',
    queryOnly: false,
    filters: [
      { field: 'lifecycleStatus', operator: 'in', value: ['LEAD', 'QUALIFIED'] },
      { field: 'inactiveDays', operator: 'gte', value: 1 },
      { field: 'hasPaidOrder', operator: 'eq', value: false },
    ],
  },
  [JourneyTrigger.CHECKOUT_ABANDONED]: {
    match: 'ALL',
    queryOnly: false,
    filters: [{ field: 'hasAbandonedCheckout', operator: 'eq', value: true }],
  },
  [JourneyTrigger.QUOTE_PENDING]: {
    match: 'ALL',
    queryOnly: false,
    filters: [{ field: 'hasPendingQuote', operator: 'eq', value: true }],
  },
  [JourneyTrigger.ORDER_PAID]: {
    match: 'ALL',
    queryOnly: false,
    filters: [{ field: 'hasPaidOrder', operator: 'eq', value: true }],
  },
  [JourneyTrigger.MANUAL]: null,
};

/**
 * Barrido de entradas: inscribe a quien califique en cada journey publicado.
 *
 * MANUAL queda fuera a proposito: esos journeys se inscriben desde la interfaz
 * o desde una automatizacion, nunca solos.
 */
export async function scanJourneyEntries(limit = 200, now = new Date()) {
  const journeys = await prisma.journey.findMany({
    where: { status: JourneyStatus.PUBLISHED, trigger: { not: JourneyTrigger.MANUAL } },
    select: { id: true, workspaceId: true, trigger: true, segmentId: true },
  });

  let enrolled = 0;

  for (const journey of journeys) {
    const audience = TRIGGER_AUDIENCE[journey.trigger];
    if (!audience) continue;

    const candidates = await prisma.contact.findMany({
      where: {
        AND: [
          buildWhere(audience, journey.workspaceId, now),
          // Los ya inscritos quedan fuera de la consulta en vez de descartarse
          // despues: en una base grande la diferencia es toda la consulta.
          { journeyEnrollments: { none: { journeyId: journey.id } } },
        ],
      },
      select: { id: true },
      take: limit,
    });

    for (const contact of candidates) {
      const result = await enroll({
        workspaceId: journey.workspaceId,
        journeyId: journey.id,
        contactId: contact.id,
        reason: `barrido ${journey.trigger}`,
        now,
      });
      if (result.enrolled) enrolled += 1;
    }
  }

  return { journeys: journeys.length, enrolled };
}

/** Saca al contacto de todos sus journeys. Lo usa el pago y el takeover humano. */
export async function exitAllForContact(
  workspaceId: string,
  contactId: string,
  reason: string,
) {
  return exitEnrollments(
    { workspaceId, contactId, reason, status: JourneyEnrollmentStatus.EXITED },
    prisma,
  );
}

// --- Journeys de fabrica -----------------------------------------------------

type PresetStep = {
  position: number;
  label: string;
  action: JourneyStepAction;
  delayHours: number;
  channel?: ConsentChannel;
  body?: string;
};

/**
 * Los cuatro journeys que pide la spec (secciones 9.4 a 9.7), con sus tiempos.
 *
 * Los textos son genericos y sin nombrar producto ni rubro: son un punto de
 * partida editable, no el mensaje definitivo de nadie. Se crean en DRAFT porque
 * publicar significa empezar a escribirle a gente de verdad, y esa es una
 * decision del cliente.
 */
export const PRESET_JOURNEYS: {
  key: string;
  name: string;
  description: string;
  trigger: JourneyTrigger;
  steps: PresetStep[];
}[] = [
  {
    key: 'lead-silencioso',
    name: 'Lead sin respuesta',
    description: 'Seguimiento a las 2 horas, 24 horas y 3 dias; despues enfria y sale.',
    trigger: JourneyTrigger.NO_ACTIVITY,
    steps: [
      {
        position: 1,
        label: 'Seguimiento breve',
        action: JourneyStepAction.SEND_WHATSAPP,
        delayHours: 2,
        channel: ConsentChannel.WHATSAPP,
        body: 'Hola, quedamos a la espera de tu respuesta. Te sirve que retomemos?',
      },
      {
        position: 2,
        label: 'Resolver dudas',
        action: JourneyStepAction.SEND_WHATSAPP,
        delayHours: 22,
        channel: ConsentChannel.WHATSAPP,
        body: 'Si te quedo alguna duda, la vemos por aca sin compromiso.',
      },
      {
        position: 3,
        label: 'Ultimo intento',
        action: JourneyStepAction.SEND_WHATSAPP,
        delayHours: 48,
        channel: ConsentChannel.WHATSAPP,
        body: 'Cerramos por ahora. Si mas adelante lo necesitas, escribenos cuando quieras.',
      },
      {
        position: 4,
        label: 'Enfriar',
        action: JourneyStepAction.SET_TEMPERATURE,
        delayHours: 0,
        body: 'COLD',
      },
      { position: 5, label: 'Fin del ciclo', action: JourneyStepAction.EXIT, delayHours: 0 },
    ],
  },
  {
    key: 'checkout-abandonado',
    name: 'Checkout abandonado',
    description: 'Recordatorio a la hora, objeciones a las 24 h y ultimo contacto a las 72 h.',
    trigger: JourneyTrigger.CHECKOUT_ABANDONED,
    steps: [
      {
        position: 1,
        label: 'Recordatorio',
        action: JourneyStepAction.SEND_WHATSAPP,
        delayHours: 1,
        channel: ConsentChannel.WHATSAPP,
        body: 'Dejaste tu compra a medio camino. Quieres que te ayude a terminarla?',
      },
      {
        position: 2,
        label: 'Objeciones',
        action: JourneyStepAction.SEND_WHATSAPP,
        delayHours: 23,
        channel: ConsentChannel.WHATSAPP,
        body: 'Si algo no te calzo con el pago o el despacho, cuentame y lo revisamos.',
      },
      {
        position: 3,
        label: 'Ultimo contacto',
        action: JourneyStepAction.SEND_WHATSAPP,
        delayHours: 48,
        channel: ConsentChannel.WHATSAPP,
        body: 'Ultimo mensaje por este pedido. Sigue disponible si quieres retomarlo.',
      },
      { position: 4, label: 'Fin del ciclo', action: JourneyStepAction.EXIT, delayHours: 0 },
    ],
  },
  {
    key: 'cotizacion-pendiente',
    name: 'Cotizacion pendiente',
    description: 'Confirmar recepcion al dia, dudas a los 3 dias y ultimo seguimiento a los 7.',
    trigger: JourneyTrigger.QUOTE_PENDING,
    steps: [
      {
        position: 1,
        label: 'Confirmar recepcion',
        action: JourneyStepAction.SEND_WHATSAPP,
        delayHours: 24,
        channel: ConsentChannel.WHATSAPP,
        body: 'Te llego bien la cotizacion?',
      },
      {
        position: 2,
        label: 'Consulta de dudas',
        action: JourneyStepAction.SEND_WHATSAPP,
        delayHours: 48,
        channel: ConsentChannel.WHATSAPP,
        body: 'Si quieres revisar algun punto de la cotizacion, la vemos juntos.',
      },
      {
        position: 3,
        label: 'Ultimo seguimiento',
        action: JourneyStepAction.SEND_WHATSAPP,
        delayHours: 96,
        channel: ConsentChannel.WHATSAPP,
        body: 'Quedamos atentos por si decides avanzar.',
      },
      { position: 4, label: 'Fin del ciclo', action: JourneyStepAction.EXIT, delayHours: 0 },
    ],
  },
  {
    key: 'postventa',
    name: 'Postventa',
    description: 'Consulta de satisfaccion, testimonio y recordatorio de recompra.',
    trigger: JourneyTrigger.ORDER_PAID,
    steps: [
      {
        position: 1,
        label: 'Consulta de satisfaccion',
        action: JourneyStepAction.SEND_WHATSAPP,
        delayHours: 72,
        channel: ConsentChannel.WHATSAPP,
        body: 'Como te fue con tu compra? Cualquier cosa, aca estamos.',
      },
      {
        position: 2,
        label: 'Pedir testimonio',
        action: JourneyStepAction.CREATE_TASK,
        delayHours: 168,
        body: 'Pedir testimonio al cliente si quedo conforme.',
      },
      {
        position: 3,
        label: 'Recordatorio de recompra',
        action: JourneyStepAction.SEND_WHATSAPP,
        delayHours: 2160,
        channel: ConsentChannel.WHATSAPP,
        body: 'Paso el tiempo desde tu ultima compra. Quieres que revisemos que necesitas ahora?',
      },
      { position: 4, label: 'Fin del ciclo', action: JourneyStepAction.EXIT, delayHours: 0 },
    ],
  },
];
