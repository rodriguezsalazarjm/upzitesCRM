import {
  AutomationTrigger,
  ConsentChannel,
  EmailEventType,
  EmailMessageStatus,
  SuppressionReason,
  type Prisma,
} from '../../../generated/prisma/client';
import { emitDomainEvent } from '../automation/emit';
import { suppressIdentifier } from '../domain/consent';
import { recalculateContactScore } from '../domain/scoring';
import { prisma } from '../prisma';
import type { NormalizedEmailEvent } from './provider';

/**
 * Procesamiento de los eventos que reporta el proveedor de email.
 *
 * Dos reglas gobiernan el archivo:
 *
 *  - **Idempotencia.** El proveedor reintenta; `EmailEvent.dedupeKey` es unico
 *    por workspace y un evento repetido no vuelve a contar. Sin esto una
 *    campana mostraria el doble de aperturas cada vez que el proveedor duda.
 *  - **Un rebote permanente suprime la direccion.** Es la unica forma de no
 *    seguir escribiendole a un buzon que no existe, que es lo que destruye la
 *    reputacion de envio. Un rebote transitorio, en cambio, no suprime nada.
 */

const STATUS_FOR_EVENT: Partial<Record<EmailEventType, EmailMessageStatus>> = {
  [EmailEventType.DELIVERED]: EmailMessageStatus.DELIVERED,
  [EmailEventType.OPENED]: EmailMessageStatus.OPENED,
  [EmailEventType.CLICKED]: EmailMessageStatus.CLICKED,
  [EmailEventType.BOUNCED]: EmailMessageStatus.BOUNCED,
  [EmailEventType.COMPLAINED]: EmailMessageStatus.COMPLAINED,
  [EmailEventType.UNSUBSCRIBED]: EmailMessageStatus.UNSUBSCRIBED,
  [EmailEventType.FAILED]: EmailMessageStatus.FAILED,
};

/**
 * Un mensaje entregado que luego se abre debe quedar OPENED, pero uno abierto
 * que recibe tarde el "delivered" no debe retroceder. El orden de llegada de
 * los webhooks no esta garantizado, asi que el estado solo avanza.
 */
const STATUS_RANK: Record<EmailMessageStatus, number> = {
  [EmailMessageStatus.QUEUED]: 0,
  [EmailMessageStatus.SENT]: 1,
  [EmailMessageStatus.DELIVERED]: 2,
  [EmailMessageStatus.OPENED]: 3,
  [EmailMessageStatus.CLICKED]: 4,
  // Los finales pesan mas: una queja o un rebote mandan sobre cualquier avance.
  [EmailMessageStatus.FAILED]: 5,
  [EmailMessageStatus.BOUNCED]: 6,
  [EmailMessageStatus.COMPLAINED]: 7,
  [EmailMessageStatus.UNSUBSCRIBED]: 8,
};

const TIMESTAMP_FIELD: Partial<Record<EmailEventType, keyof Prisma.EmailMessageUpdateInput>> = {
  [EmailEventType.DELIVERED]: 'deliveredAt',
  [EmailEventType.OPENED]: 'openedAt',
  [EmailEventType.CLICKED]: 'clickedAt',
  [EmailEventType.BOUNCED]: 'bouncedAt',
  [EmailEventType.COMPLAINED]: 'complainedAt',
  [EmailEventType.UNSUBSCRIBED]: 'unsubscribedAt',
  [EmailEventType.FAILED]: 'failedAt',
};

const COUNTER_FIELD: Partial<Record<EmailEventType, keyof Prisma.CampaignUpdateInput>> = {
  [EmailEventType.DELIVERED]: 'deliveredCount',
  [EmailEventType.OPENED]: 'openedCount',
  [EmailEventType.CLICKED]: 'clickedCount',
  [EmailEventType.BOUNCED]: 'bouncedCount',
  [EmailEventType.COMPLAINED]: 'complainedCount',
  [EmailEventType.UNSUBSCRIBED]: 'unsubscribedCount',
};

const AUTOMATION_TRIGGER: Partial<Record<EmailEventType, AutomationTrigger>> = {
  [EmailEventType.OPENED]: AutomationTrigger.EMAIL_OPENED,
  [EmailEventType.CLICKED]: AutomationTrigger.EMAIL_CLICKED,
  [EmailEventType.BOUNCED]: AutomationTrigger.EMAIL_BOUNCED,
};

export type ProcessEventResult =
  | { applied: true; emailMessageId: string; type: EmailEventType; suppressed: boolean }
  | { applied: false; reason: 'DUPLICATE' | 'UNKNOWN_MESSAGE' };

export async function processEmailEvent(event: NormalizedEmailEvent): Promise<ProcessEventResult> {
  // El mensaje es lo que da el workspace: sin el no se puede atribuir el evento
  // a nadie, y guardarlo sin workspace romperia el aislamiento por tenant.
  const message = event.providerMessageId
    ? await prisma.emailMessage.findFirst({
        where: { providerMessageId: event.providerMessageId },
        select: {
          id: true,
          workspaceId: true,
          contactId: true,
          campaignId: true,
          toEmail: true,
          status: true,
        },
      })
    : null;

  if (!message) return { applied: false, reason: 'UNKNOWN_MESSAGE' };

  try {
    await prisma.emailEvent.create({
      data: {
        workspaceId: message.workspaceId,
        emailMessageId: message.id,
        type: event.type,
        dedupeKey: event.dedupeKey,
        occurredAt: event.occurredAt,
        payload: (event.payload ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch {
    // Choque con la unicidad de dedupeKey: ya se proceso. Se corta aca para no
    // volver a mover contadores ni estados.
    return { applied: false, reason: 'DUPLICATE' };
  }

  const nextStatus = STATUS_FOR_EVENT[event.type];
  const timestampField = TIMESTAMP_FIELD[event.type];

  const data: Prisma.EmailMessageUpdateInput = {};
  if (timestampField) Object.assign(data, { [timestampField]: event.occurredAt });
  if (nextStatus && STATUS_RANK[nextStatus] > STATUS_RANK[message.status]) {
    data.status = nextStatus;
  }

  if (Object.keys(data).length > 0) {
    await prisma.emailMessage.update({ where: { id: message.id }, data });
  }

  if (message.campaignId) {
    const counter = COUNTER_FIELD[event.type];
    if (counter) {
      await prisma.campaign.update({
        where: { id: message.campaignId },
        data: { [counter]: { increment: 1 } },
      });
    }
  }

  // Rebote duro o queja: la direccion se suprime. Sobrevive al contacto y a
  // cualquier reimportacion, que es justamente el punto de la lista.
  let suppressed = false;
  const permanentFailure =
    (event.type === EmailEventType.BOUNCED && event.permanent !== false) ||
    event.type === EmailEventType.COMPLAINED;

  if (permanentFailure) {
    await suppressIdentifier({
      workspaceId: message.workspaceId,
      channel: ConsentChannel.EMAIL,
      identifier: event.recipient ?? message.toEmail,
      reason:
        event.type === EmailEventType.COMPLAINED
          ? SuppressionReason.SPAM_COMPLAINT
          : SuppressionReason.HARD_BOUNCE,
      notes: `evento ${event.type} del proveedor`,
    });
    suppressed = true;
  }

  // Abrir o hacer clic son senales de interes: el score se recalcula para que
  // la temperatura del contacto lo refleje sin esperar al barrido.
  if (message.contactId && (event.type === EmailEventType.OPENED || event.type === EmailEventType.CLICKED)) {
    await recalculateContactScore({
      workspaceId: message.workspaceId,
      contactId: message.contactId,
    });
  }

  const trigger = AUTOMATION_TRIGGER[event.type];
  if (trigger && message.contactId) {
    await emitDomainEvent({
      workspaceId: message.workspaceId,
      trigger,
      dedupeKey: `email-event:${event.dedupeKey}`,
      contactId: message.contactId,
      context: { email: { messageId: message.id, campaignId: message.campaignId } },
    });
  }

  return { applied: true, emailMessageId: message.id, type: event.type, suppressed };
}

export async function processEmailEvents(events: NormalizedEmailEvent[]) {
  const results: ProcessEventResult[] = [];
  for (const event of events) {
    results.push(await processEmailEvent(event));
  }

  return {
    received: events.length,
    applied: results.filter((result) => result.applied).length,
    duplicates: results.filter((result) => !result.applied && result.reason === 'DUPLICATE').length,
    unknown: results.filter((result) => !result.applied && result.reason === 'UNKNOWN_MESSAGE').length,
  };
}
