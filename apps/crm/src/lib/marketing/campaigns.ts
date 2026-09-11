import {
  CampaignRecipientStatus,
  CampaignStatus,
  ConsentChannel,
  EmailTemplateStatus,
  SendCategory,
} from '../../../generated/prisma/client';
import { checkAllowance, hasCapability, recordUsage } from '../billing/usage';
import { isEnabled } from '../ops/flags';
import { recordAudit } from '../domain/audit';
import { sendEmail } from '../email/send';
import { prisma } from '../prisma';
import { getPolicy } from './policy';
import { parseDefinition, resolveForSending, SegmentError } from './segments';

/**
 * Campanas de email.
 *
 * Una campana se ejecuta en dos tiempos: primero se materializan los
 * destinatarios y despues se envia de a tandas. La separacion importa porque el
 * envio puede interrumpirse —cuota del proveedor, reinicio, pausa manual— y al
 * retomar tiene que seguir donde quedo, sin reenviarle a quien ya recibio.
 *
 * `CampaignRecipient` es ese registro: una fila por persona, con su estado y,
 * si no se le envio, el motivo. Un destinatario omitido no es un fallo; es
 * evidencia de que la omision fue deliberada.
 */

export class CampaignError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'NOT_FOUND'
      | 'INVALID_STATE'
      | 'NO_SEGMENT'
      | 'NO_TEMPLATE'
      | 'QUERY_ONLY'
      | 'PLAN_LIMIT'
      | 'DISABLED',
  ) {
    super(message);
    this.name = 'CampaignError';
  }
}

/**
 * Materializa los destinatarios.
 *
 * El segmento se reevalua ahora, no cuando se creo la campana: la lista es del
 * momento del envio. `resolveForSending` ya excluye a los suprimidos y rechaza
 * los segmentos de solo consulta.
 */
export async function buildRecipients(input: {
  workspaceId: string;
  campaignId: string;
  now?: Date;
}) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, workspaceId: input.workspaceId },
  });

  if (!campaign) throw new CampaignError('Campana no encontrada.', 'NOT_FOUND');
  if (!campaign.segmentId) throw new CampaignError('La campana no tiene segmento.', 'NO_SEGMENT');

  if (!(await hasCapability(input.workspaceId, 'CAMPAIGNS'))) {
    throw new CampaignError('El plan actual no incluye campanas.', 'PLAN_LIMIT');
  }

  if (!(await isEnabled('CAMPAIGNS', input.workspaceId))) {
    throw new CampaignError('Las campanas estan apagadas.', 'DISABLED');
  }

  const segment = await prisma.segment.findFirst({
    where: { id: campaign.segmentId, workspaceId: input.workspaceId },
  });

  const definition = segment ? parseDefinition(segment.definition) : null;
  if (!definition) throw new CampaignError('El segmento no tiene una definicion valida.', 'NO_SEGMENT');

  let contacts;
  try {
    contacts = await resolveForSending({
      workspaceId: input.workspaceId,
      definition,
      channel: campaign.channel,
      now: input.now,
    });
  } catch (error) {
    if (error instanceof SegmentError && error.code === 'QUERY_ONLY') {
      throw new CampaignError(error.message, 'QUERY_ONLY');
    }
    throw error;
  }

  // El cupo se comprueba con la lista ya resuelta: es el numero de personas a
  // las que se les va a escribir, no el tamano bruto del segmento.
  const quota = await checkAllowance({
    workspaceId: input.workspaceId,
    metric: 'campaign_contacts',
    amount: contacts.length,
  });

  if (!quota.allowed) {
    throw new CampaignError(
      `El plan permite ${quota.limit} contactos de campana al mes y ya van ${quota.used}. ` +
        `Esta campana suma ${contacts.length}.`,
      'PLAN_LIMIT',
    );
  }

  if (contacts.length > 0) {
    await prisma.campaignRecipient.createMany({
      data: contacts.map((contact) => ({
        workspaceId: input.workspaceId,
        campaignId: campaign.id,
        contactId: contact.id,
      })),
      // Reconstruir la lista de una campana pausada no duplica destinatarios.
      skipDuplicates: true,
    });
  }

  const recipientCount = await prisma.campaignRecipient.count({
    where: { campaignId: campaign.id },
  });

  if (contacts.length > 0) {
    await recordUsage({
      workspaceId: input.workspaceId,
      provider: 'crm',
      metric: 'campaign_contacts',
      quantity: contacts.length,
      referenceType: 'Campaign',
      referenceId: campaign.id,
    });
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { recipientCount },
  });

  return { recipientCount, resolved: contacts.length };
}

export type CampaignRunResult = {
  campaignId: string;
  sent: number;
  skipped: number;
  failed: number;
  remaining: number;
  status: CampaignStatus;
};

/**
 * Envia una tanda.
 *
 * Se procesa de a `limit` y se devuelve cuantos quedan: quien la llame decide
 * si vuelve a encolarse. Asi una campana de miles no monopoliza un worker ni se
 * pasa del tiempo maximo de una funcion serverless.
 */
export async function sendCampaignBatch(input: {
  workspaceId: string;
  campaignId: string;
  limit?: number;
  now?: Date;
}): Promise<CampaignRunResult> {
  const now = input.now ?? new Date();

  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, workspaceId: input.workspaceId },
  });

  if (!campaign) throw new CampaignError('Campana no encontrada.', 'NOT_FOUND');

  if (campaign.status !== CampaignStatus.SENDING && campaign.status !== CampaignStatus.SCHEDULED) {
    throw new CampaignError(
      `Una campana en estado ${campaign.status} no envia.`,
      'INVALID_STATE',
    );
  }

  if (campaign.channel !== ConsentChannel.EMAIL) {
    throw new CampaignError('En la beta solo hay campanas de email.', 'INVALID_STATE');
  }

  // Se comprueba tambien aqui y no solo al armar la lista: entre programar una
  // campana y enviarla pasan horas, y el corte tiene que valer para una campana
  // ya encolada.
  if (!(await isEnabled('CAMPAIGNS', input.workspaceId))) {
    throw new CampaignError('Las campanas estan apagadas.', 'DISABLED');
  }

  const template = campaign.templateId
    ? await prisma.emailTemplate.findFirst({
        where: {
          id: campaign.templateId,
          workspaceId: input.workspaceId,
          status: EmailTemplateStatus.PUBLISHED,
        },
        select: { key: true },
      })
    : null;

  // Igual que las reglas de precio de la Fase 7: solo sale lo publicado.
  if (!template) throw new CampaignError('La campana no tiene plantilla publicada.', 'NO_TEMPLATE');

  if (campaign.status === CampaignStatus.SCHEDULED) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: CampaignStatus.SENDING, startedAt: campaign.startedAt ?? now },
    });
  }

  const policy = await getPolicy(input.workspaceId);

  const pending = await prisma.campaignRecipient.findMany({
    where: { campaignId: campaign.id, status: CampaignRecipientStatus.PENDING },
    orderBy: { createdAt: 'asc' },
    take: input.limit ?? 50,
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const recipient of pending) {
    const result = await sendEmail({
      workspaceId: input.workspaceId,
      contactId: recipient.contactId,
      category: SendCategory.PROMOTIONAL,
      templateKey: template.key,
      campaignId: campaign.id,
      policy,
      now,
    });

    if (result.status === 'SENT') {
      sent += 1;
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: CampaignRecipientStatus.SENT,
          emailMessageId: result.emailMessageId,
          processedAt: new Date(),
        },
      });
      continue;
    }

    if (result.status === 'FAILED') {
      failed += 1;
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: CampaignRecipientStatus.FAILED,
          skipReason: result.error,
          emailMessageId: result.emailMessageId,
          processedAt: new Date(),
        },
      });
      continue;
    }

    // SKIPPED: se guarda el motivo. Un tope o una ventana de silencio dejan la
    // fila con su razon en vez de reintentar dentro del bucle, que solo llevaria
    // a golpear el mismo limite cientos de veces seguidas.
    skipped += 1;
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: CampaignRecipientStatus.SKIPPED,
        skipReason: result.reason,
        processedAt: new Date(),
      },
    });
  }

  const remaining = await prisma.campaignRecipient.count({
    where: { campaignId: campaign.id, status: CampaignRecipientStatus.PENDING },
  });

  const status = remaining === 0 ? CampaignStatus.SENT : CampaignStatus.SENDING;

  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      sentCount: { increment: sent },
      skippedCount: { increment: skipped },
      failedCount: { increment: failed },
      status,
      ...(remaining === 0 ? { completedAt: new Date() } : {}),
    },
  });

  await recordAudit({
    workspaceId: input.workspaceId,
    action: 'campaign.batch_sent',
    entity: 'Campaign',
    entityId: campaign.id,
    metadata: { sent, skipped, failed, remaining },
  });

  return { campaignId: campaign.id, sent, skipped, failed, remaining, status: updated.status };
}

/**
 * Envia una copia de prueba a un contacto del workspace.
 *
 * Pasa por el mismo camino que un envio real —incluido el consentimiento— para
 * que la prueba signifique algo. Lo unico que cambia es que no queda asociada a
 * la campana ni consume su lista.
 */
export async function sendCampaignTest(input: {
  workspaceId: string;
  campaignId: string;
  contactId: string;
  actorId?: string | null;
}) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, workspaceId: input.workspaceId },
  });

  if (!campaign) throw new CampaignError('Campana no encontrada.', 'NOT_FOUND');

  const template = campaign.templateId
    ? await prisma.emailTemplate.findFirst({
        where: {
          id: campaign.templateId,
          workspaceId: input.workspaceId,
          status: EmailTemplateStatus.PUBLISHED,
        },
        select: { key: true },
      })
    : null;

  if (!template) throw new CampaignError('La campana no tiene plantilla publicada.', 'NO_TEMPLATE');

  const result = await sendEmail({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    category: SendCategory.PROMOTIONAL,
    templateKey: template.key,
    // Una prueba la pide una persona: puede salir fuera del horario habitual.
    ignoreQuietHours: true,
    actorId: input.actorId,
  });

  await recordAudit({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: 'campaign.test_sent',
    entity: 'Campaign',
    entityId: campaign.id,
    metadata: { contactId: input.contactId, result: result.status },
  });

  return result;
}

/** Metricas de una campana: contadores materializados, sin recorrer nada. */
export async function campaignMetrics(workspaceId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, workspaceId },
  });

  if (!campaign) return null;

  const rate = (value: number) =>
    campaign.sentCount === 0 ? 0 : Math.round((value / campaign.sentCount) * 1000) / 10;

  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    recipients: campaign.recipientCount,
    sent: campaign.sentCount,
    skipped: campaign.skippedCount,
    failed: campaign.failedCount,
    delivered: campaign.deliveredCount,
    opened: campaign.openedCount,
    clicked: campaign.clickedCount,
    bounced: campaign.bouncedCount,
    complained: campaign.complainedCount,
    unsubscribed: campaign.unsubscribedCount,
    openRate: rate(campaign.openedCount),
    clickRate: rate(campaign.clickedCount),
    bounceRate: rate(campaign.bouncedCount),
    unsubscribeRate: rate(campaign.unsubscribedCount),
  };
}

/** Metricas de un journey. Se calculan sobre las inscripciones. */
export async function journeyMetrics(workspaceId: string, journeyId: string) {
  const journey = await prisma.journey.findFirst({ where: { id: journeyId, workspaceId } });
  if (!journey) return null;

  const grouped = await prisma.journeyEnrollment.groupBy({
    by: ['status'],
    where: { workspaceId, journeyId },
    _count: { _all: true },
  });

  const counts = Object.fromEntries(grouped.map((row) => [row.status, row._count._all]));
  const total = grouped.reduce((sum, row) => sum + row._count._all, 0);

  const exited = counts.EXITED ?? 0;

  return {
    id: journey.id,
    key: journey.key,
    name: journey.name,
    status: journey.status,
    total,
    active: counts.ACTIVE ?? 0,
    completed: counts.COMPLETED ?? 0,
    exited,
    canceled: counts.CANCELED ?? 0,
    failed: counts.FAILED ?? 0,
    /**
     * Salir antes del ultimo paso es el resultado deseado: significa que el
     * contacto respondio, compro o lo tomo una persona. Por eso se mide como
     * "recuperados" y no como abandono.
     */
    recoveryRate: total === 0 ? 0 : Math.round((exited / total) * 1000) / 10,
  };
}
