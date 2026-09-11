import {
  AutomationTrigger,
  JobStatus,
  JobType,
  ScheduledActionStatus,
  ScheduledActionType,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { recalculateContactScore } from '../domain';
import { processWebhookEvent } from '../whatsapp/inbound';
import { processOutbox } from '../whatsapp/outbound';
import { runAutomationsForEvent } from '../automation/engine';
import { runAgent } from '../agents/runner';
import { processShopifyEvent } from '../shopify/webhooks';
import { syncShopifyCatalog, getShopifyConnection } from '../shopify/sync';
import { createShopifyClient } from '../shopify/client';
import { emitDomainEvent } from '../automation/emit';
import type { DomainEvent } from '../automation/types';
import { sendEmail } from '../email/send';
import { sendCampaignBatch } from '../marketing/campaigns';
import { advanceEnrollment, processDueEnrollments, scanJourneyEntries } from '../marketing/journeys';
import { refreshSegmentCount } from '../marketing/segments';
import { enqueue } from './queue';

/**
 * Handlers de la cola. Cada uno debe ser idempotente: la cola garantiza
 * "al menos una vez", no "exactamente una vez", y un reintento tras un fallo
 * de red no puede duplicar efectos.
 */
export type JobHandler = (payload: Record<string, unknown>, workspaceId: string | null) => Promise<unknown>;

const handlers: Record<JobType, JobHandler> = {
  [JobType.PROCESS_WEBHOOK_EVENT]: async (payload) => {
    const eventId = String(payload.eventId ?? '');
    if (!eventId) throw new Error('PROCESS_WEBHOOK_EVENT requiere eventId.');
    return processWebhookEvent(eventId);
  },

  [JobType.PROCESS_OUTBOX]: async () => processOutbox(50),

  [JobType.EVALUATE_TRIGGER]: async (payload) => {
    const event = payload as unknown as DomainEvent;
    if (!event?.workspaceId || !event?.trigger) throw new Error('EVALUATE_TRIGGER requiere workspaceId y trigger.');
    const results = await runAutomationsForEvent(event);
    return { rules: results.length, executed: results.filter((r) => r.actionsRun > 0).length };
  },

  [JobType.RUN_AUTOMATION_RULE]: async (payload) => {
    const event = payload as unknown as DomainEvent;
    return runAutomationsForEvent(event);
  },

  /**
   * Ejecuta una accion programada vencida. Hoy las acciones de seguimiento se
   * materializan como disparadores del motor; la Fase 4 les enchufa el agente.
   */
  [JobType.RUN_SCHEDULED_ACTION]: async (payload) => {
    const actionId = String(payload.actionId ?? '');
    if (!actionId) throw new Error('RUN_SCHEDULED_ACTION requiere actionId.');

    // Solo se toma si sigue PENDING: si algo la cancelo entre medio, no corre.
    const claimed = await prisma.scheduledAction.updateMany({
      where: { id: actionId, status: ScheduledActionStatus.PENDING },
      data: { status: ScheduledActionStatus.PROCESSING, attempts: { increment: 1 } },
    });

    if (claimed.count === 0) return { skipped: true, reason: 'ya no esta pendiente' };

    const action = await prisma.scheduledAction.findUniqueOrThrow({ where: { id: actionId } });

    try {
      await emitDomainEvent({
        workspaceId: action.workspaceId,
        trigger:
          action.type === ScheduledActionType.CHECKOUT_RECOVERY
            ? AutomationTrigger.CHECKOUT_STARTED
            : AutomationTrigger.NO_ACTIVITY,
        dedupeKey: `scheduled-action:${action.id}`,
        contactId: action.contactId,
        context: { scheduledAction: { id: action.id, type: action.type, payload: action.payload } },
      });

      await prisma.scheduledAction.update({
        where: { id: action.id },
        data: { status: ScheduledActionStatus.DONE, processedAt: new Date() },
      });

      return { actionId: action.id, dispatched: true };
    } catch (error) {
      await prisma.scheduledAction.update({
        where: { id: action.id },
        data: {
          status: ScheduledActionStatus.PENDING,
          lastError: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  },

  /** Barrido periodico: promueve a la cola las acciones ya vencidas. */
  [JobType.SCAN_SCHEDULED_ACTIONS]: async () => {
    const due = await prisma.scheduledAction.findMany({
      where: { status: ScheduledActionStatus.PENDING, runAt: { lte: new Date() } },
      orderBy: { runAt: 'asc' },
      take: 200,
      select: { id: true, workspaceId: true },
    });

    for (const action of due) {
      await enqueue({
        type: JobType.RUN_SCHEDULED_ACTION,
        workspaceId: action.workspaceId,
        payload: { actionId: action.id },
        dedupeKey: `scheduled-action:${action.id}`,
      });
    }

    return { promoted: due.length };
  },

  /**
   * Detecta silencio comercial y emite el disparador NO_ACTIVITY.
   *
   * La ventana concreta la deciden las condiciones de cada regla; aqui solo se
   * acota a contactos vivos con al menos 24 h sin actividad, para no recorrer
   * toda la base en cada barrido.
   */
  [JobType.SCAN_SILENCE]: async () => {
    const threshold = new Date(Date.now() - 24 * 3_600_000);

    const contacts = await prisma.contact.findMany({
      where: {
        lifecycleStatus: { in: ['LEAD', 'QUALIFIED'] },
        OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: threshold } }],
      },
      orderBy: { lastActivityAt: 'asc' },
      take: 200,
      select: { id: true, workspaceId: true, lastActivityAt: true },
    });

    for (const contact of contacts) {
      // Un dedupeKey por dia evita que el barrido dispare la misma regla en
      // cada corrida mientras el contacto siga en silencio.
      const day = new Date().toISOString().slice(0, 10);
      await emitDomainEvent({
        workspaceId: contact.workspaceId,
        trigger: AutomationTrigger.NO_ACTIVITY,
        dedupeKey: `silence:${contact.id}:${day}`,
        contactId: contact.id,
      });
    }

    return { scanned: contacts.length };
  },

  /**
   * Ejecuta el agente sobre una conversacion.
   *
   * Se encola con debounce: si el cliente manda tres mensajes seguidos, la
   * ventana se corre y el agente responde una sola vez viendo los tres.
   */
  [JobType.RUN_AGENT]: async (payload, workspaceId) => {
    const conversationId = String(payload.conversationId ?? '');
    if (!conversationId || !workspaceId) {
      throw new Error('RUN_AGENT requiere conversationId y workspaceId.');
    }

    return runAgent({
      workspaceId,
      conversationId,
      trigger: typeof payload.trigger === 'string' ? payload.trigger : undefined,
    });
  },

  [JobType.PROCESS_SHOPIFY_EVENT]: async (payload) => {
    const eventId = String(payload.eventId ?? '');
    if (!eventId) throw new Error('PROCESS_SHOPIFY_EVENT requiere eventId.');
    return processShopifyEvent(eventId);
  },

  /** Sincroniza el catalogo de una tienda. Lo dispara el cron o el usuario. */
  [JobType.SYNC_SHOPIFY_CATALOG]: async (_payload, workspaceId) => {
    if (!workspaceId) throw new Error('SYNC_SHOPIFY_CATALOG requiere workspaceId.');

    const connection = await getShopifyConnection(workspaceId);
    if (!connection || connection.status !== 'CONNECTED') {
      return { skipped: true, reason: 'sin conexion Shopify activa' };
    }

    return syncShopifyCatalog({
      workspaceId,
      connectionId: connection.id,
      fetcher: createShopifyClient(connection),
    });
  },

  [JobType.RECALCULATE_SCORE]: async (payload, workspaceId) => {
    const contactId = String(payload.contactId ?? '');
    if (!contactId || !workspaceId) throw new Error('RECALCULATE_SCORE requiere contactId y workspaceId.');
    return recalculateContactScore({ workspaceId, contactId });
  },

  /**
   * Un email suelto: lo usa un journey que necesita reintentar y cualquier
   * envio pedido desde la interfaz.
   */
  [JobType.SEND_EMAIL]: async (payload, workspaceId) => {
    const contactId = String(payload.contactId ?? '');
    if (!contactId || !workspaceId) throw new Error('SEND_EMAIL requiere contactId y workspaceId.');

    return sendEmail({
      workspaceId,
      contactId,
      templateKey: typeof payload.templateKey === 'string' ? payload.templateKey : undefined,
      subject: typeof payload.subject === 'string' ? payload.subject : undefined,
      bodyHtml: typeof payload.bodyHtml === 'string' ? payload.bodyHtml : undefined,
      bodyText: typeof payload.bodyText === 'string' ? payload.bodyText : undefined,
      campaignId: typeof payload.campaignId === 'string' ? payload.campaignId : null,
      journeyId: typeof payload.journeyId === 'string' ? payload.journeyId : null,
    });
  },

  /**
   * Una tanda de campana. Si quedan destinatarios se vuelve a encolar sola:
   * asi una campana grande avanza sin monopolizar el worker ni pasarse del
   * tiempo maximo de una funcion.
   */
  [JobType.SEND_CAMPAIGN]: async (payload, workspaceId) => {
    const campaignId = String(payload.campaignId ?? '');
    if (!campaignId || !workspaceId) throw new Error('SEND_CAMPAIGN requiere campaignId y workspaceId.');

    const result = await sendCampaignBatch({ workspaceId, campaignId, limit: 50 });

    if (result.remaining > 0) {
      await enqueue({
        type: JobType.SEND_CAMPAIGN,
        workspaceId,
        payload: { campaignId },
        // La tanda va en el dedupeKey: sin eso el reencolado chocaria consigo
        // mismo y la campana se detendria despues de la primera tanda.
        dedupeKey: `campaign:${campaignId}:${result.remaining}`,
        priority: 100,
      });
    }

    return result;
  },

  /** Avanza las inscripciones vencidas. Es el latido de los journeys. */
  [JobType.PROCESS_JOURNEYS]: async () => processDueEnrollments(100),

  [JobType.RUN_JOURNEY_STEP]: async (payload) => {
    const enrollmentId = String(payload.enrollmentId ?? '');
    if (!enrollmentId) throw new Error('RUN_JOURNEY_STEP requiere enrollmentId.');

    return advanceEnrollment(enrollmentId);
  },

  /** Inscribe a quien califique en cada journey publicado. */
  [JobType.SCAN_JOURNEY_ENTRIES]: async () => scanJourneyEntries(200),

  [JobType.REFRESH_SEGMENT_COUNTS]: async (_payload, workspaceId) => {
    const segments = await prisma.segment.findMany({
      where: { isActive: true, ...(workspaceId ? { workspaceId } : {}) },
      select: { id: true, workspaceId: true },
      take: 200,
    });

    for (const segment of segments) {
      await refreshSegmentCount(segment.workspaceId, segment.id);
    }

    return { refreshed: segments.length };
  },
};

export function handlerFor(type: JobType): JobHandler {
  const handler = handlers[type];
  if (!handler) throw new Error(`No hay handler para el tipo de trabajo ${type}.`);
  return handler;
}

/** Trabajos recurrentes que el cron debe encolar en cada tick. */
export async function enqueueRecurringJobs(now = new Date()) {
  // Un dedupeKey por minuto hace inofensivo que el cron se ejecute dos veces.
  const minute = now.toISOString().slice(0, 16);

  await enqueue({
    type: JobType.SCAN_SCHEDULED_ACTIONS,
    payload: {},
    dedupeKey: `scan-scheduled:${minute}`,
    priority: 10,
  });

  await enqueue({
    type: JobType.PROCESS_OUTBOX,
    payload: {},
    dedupeKey: `outbox:${minute}`,
    priority: 20,
  });

  // Los journeys se miran cada minuto: un paso de "dos horas" que se ejecuta
  // una hora tarde ya no es el mensaje que se penso.
  await enqueue({
    type: JobType.PROCESS_JOURNEYS,
    payload: {},
    dedupeKey: `journeys:${minute}`,
    priority: 30,
  });

  // El barrido de silencio es caro: basta una vez por hora.
  const hour = now.toISOString().slice(0, 13);
  await enqueue({
    type: JobType.SCAN_SILENCE,
    payload: {},
    dedupeKey: `scan-silence:${hour}`,
    priority: 200,
  });

  // Las entradas a journeys tambien: recorren toda la base de contactos.
  await enqueue({
    type: JobType.SCAN_JOURNEY_ENTRIES,
    payload: {},
    dedupeKey: `journey-entries:${hour}`,
    priority: 210,
  });

  // Los recuentos de segmento son informativos: una vez al dia alcanza.
  const day = now.toISOString().slice(0, 10);
  await enqueue({
    type: JobType.REFRESH_SEGMENT_COUNTS,
    payload: {},
    dedupeKey: `segment-counts:${day}`,
    priority: 300,
  });
}

/**
 * Limpieza de trabajos terminados para que la tabla no crezca sin limite.
 *
 * No se audita: el audit log es por workspace y esto es mantenimiento global.
 * Los trabajos DEAD nunca se borran, porque son justamente los que hay que mirar.
 */
export async function pruneFinishedJobs(olderThanDays = 7) {
  const threshold = new Date(Date.now() - olderThanDays * 24 * 3_600_000);
  const result = await prisma.job.deleteMany({
    where: { status: JobStatus.DONE, processedAt: { lt: threshold } },
  });

  return result.count;
}
