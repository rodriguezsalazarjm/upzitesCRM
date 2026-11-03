import {
  ConsentChannel,
  MessageDirection,
  SendCategory,
} from '../../../generated/prisma/client';
import { canContact } from '../domain/consent';
import { prisma } from '../prisma';
import type { Db } from '../domain/audit';
import { isQuietHour, nextAllowedInstant, policyFrom, type ContactPolicy } from './quiet-hours';

/**
 * Limites de contacto: ventana de silencio, topes de frecuencia y la regla de
 * no mezclar canales promocionales el mismo dia.
 *
 * Todo lo que envie algo a un contacto —journeys, campanas, seguimientos— pasa
 * por `evaluateSend`. Es la unica puerta, igual que `canContact` lo es para el
 * consentimiento.
 *
 * Dos decisiones que atraviesan el archivo:
 *
 *  - Las horas se evaluan en la zona del workspace, no en la del servidor. Un
 *    servidor en UTC no puede decidir si en Santiago son las 22:00.
 *  - Lo OPERACIONAL no se frena. La confirmacion de una compra no es marketing:
 *    no consume topes ni espera al amanecer. Lo unico que sigue bloqueandola es
 *    la supresion, porque un rebote duro significa que el correo no existe.
 */

export {
  DEFAULT_POLICY,
  instantForWallTime,
  isQuietHour,
  minutesOfDayIn,
  nextAllowedInstant,
  policyFrom,
  wallTimeIn,
  type ContactPolicy,
} from './quiet-hours';

/** Lee la politica del workspace, o la de fabrica si aun no tiene una. */
export async function getPolicy(workspaceId: string, db: Db = prisma): Promise<ContactPolicy> {
  const row = await db.messagingPolicy.findUnique({ where: { workspaceId } });
  return policyFrom(row);
}

// --- Decision de envio -------------------------------------------------------

export type SendDecision =
  | { allowed: true }
  | {
      allowed: false;
      /** Motivo estable, pensado para guardarse como evidencia. */
      reason:
        | 'NO_CONSENT'
        | 'REVOKED'
        | 'SUPPRESSED'
        | 'NO_IDENTIFIER'
        | 'NOT_FOUND'
        | 'QUIET_HOURS'
        | 'FREQUENCY_CAP'
        | 'MULTICHANNEL_SAME_DAY'
        | 'NO_REPLY_LIMIT';
      /** Cuando volveria a poder enviarse. Ausente si el bloqueo es definitivo. */
      retryAt?: Date;
      detail?: string;
    };

export type EvaluateSendInput = {
  workspaceId: string;
  contactId: string;
  channel: ConsentChannel;
  category?: SendCategory;
  now?: Date;
  policy?: ContactPolicy;
  /** Ignora la ventana de silencio. Solo para envios pedidos por un humano. */
  ignoreQuietHours?: boolean;
};

const DAY_MS = 24 * 3_600_000;

/**
 * Decide si se puede enviar ahora, y si no, cuando.
 *
 * El orden importa: primero lo que bloquea para siempre (consentimiento,
 * supresion), despues lo que solo posterga (silencio, frecuencia). Asi el
 * motivo guardado es el verdadero y no "quiet hours" cuando en realidad la
 * persona pidio no ser contactada.
 */
export async function evaluateSend(input: EvaluateSendInput): Promise<SendDecision> {
  const now = input.now ?? new Date();
  const category = input.category ?? SendCategory.PROMOTIONAL;
  const policy = input.policy ?? (await getPolicy(input.workspaceId));

  const consent = await canContact({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    channel: input.channel,
  });

  if (!consent.allowed) {
    // Lo operacional solo lo frena la supresion o la falta de direccion: un
    // rebote duro significa que el correo no existe, y sin correo no hay envio.
    const blocksOperational =
      consent.reason === 'SUPPRESSED' ||
      consent.reason === 'NO_IDENTIFIER' ||
      consent.reason === 'NOT_FOUND';

    if (category === SendCategory.PROMOTIONAL || blocksOperational) {
      return { allowed: false, reason: consent.reason };
    }
  }

  if (category === SendCategory.OPERATIONAL) return { allowed: true };

  if (!input.ignoreQuietHours && isQuietHour(now, policy)) {
    return { allowed: false, reason: 'QUIET_HOURS', retryAt: nextAllowedInstant(now, policy) };
  }

  // D41: el tope de intentos consecutivos sin respuesta. Estaba guardado en la
  // politica y no lo aplicaba nadie: un ajuste que no ajusta es peor que no
  // tenerlo, porque el cliente cree que esta protegido.
  //
  // "Consecutivos" se mide contra la ultima vez que el contacto respondio: si
  // contesta, la cuenta vuelve a cero sola. Y solo cuentan los seguimientos de
  // journey: un boletin al que nadie responde no es insistir.
  const sinRespuesta = await countConsecutiveNoReply(input.workspaceId, input.contactId, now);

  if (sinRespuesta >= policy.maxConsecutiveNoReply) {
    return {
      allowed: false,
      reason: 'NO_REPLY_LIMIT',
      detail: `${sinRespuesta} envios seguidos sin respuesta`,
    };
  }

  const capWindowMs = input.channel === ConsentChannel.EMAIL ? 7 * DAY_MS : DAY_MS;
  const cap =
    input.channel === ConsentChannel.EMAIL ? policy.maxEmailPerWeek : policy.maxWhatsappPerDay;

  const since = new Date(now.getTime() - capWindowMs);

  const recent = await prisma.contactSendLog.findMany({
    where: {
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      category: SendCategory.PROMOTIONAL,
      sentAt: { gte: since },
    },
    select: { channel: true, sentAt: true },
    orderBy: { sentAt: 'asc' },
  });

  const sameChannel = recent.filter((entry) => entry.channel === input.channel);

  if (sameChannel.length >= cap) {
    // El tope se libera cuando el envio mas antiguo de la ventana sale de ella.
    const oldest = sameChannel[sameChannel.length - cap];
    return {
      allowed: false,
      reason: 'FREQUENCY_CAP',
      retryAt: new Date(oldest.sentAt.getTime() + capWindowMs),
      detail: `${sameChannel.length}/${cap} en la ventana`,
    };
  }

  // Regla 9 de la spec: nada de WhatsApp y email promocional el mismo dia,
  // salvo que el workspace lo habilite.
  if (!policy.allowSameDayMultichannel) {
    const todayStart = new Date(now.getTime() - DAY_MS);
    const otherChannel = recent.find(
      (entry) => entry.channel !== input.channel && entry.sentAt >= todayStart,
    );

    if (otherChannel) {
      return {
        allowed: false,
        reason: 'MULTICHANNEL_SAME_DAY',
        retryAt: new Date(otherChannel.sentAt.getTime() + DAY_MS),
        detail: `ya se envio por ${otherChannel.channel} en las ultimas 24 h`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Cuantos SEGUIMIENTOS seguidos lleva sin que el contacto responda.
 *
 * Se cuenta desde su ultimo mensaje entrante; sin entrantes, desde siempre.
 *
 * **Solo cuenta envios de journey, no de campana.** La spec ubica este tope
 * junto a "maximo 1 seguimiento automatico por 24 horas por journey": habla de
 * insistirle a alguien que no contesta, no de un boletin que la persona pidio
 * recibir. Contar las campanas dejaria a cualquier lista de correo bloqueada
 * despues del tercer envio, porque a un boletin casi nadie responde.
 */
export async function countConsecutiveNoReply(
  workspaceId: string,
  contactId: string,
  now = new Date(),
) {
  const ultimaRespuesta = await prisma.message.findFirst({
    where: {
      workspaceId,
      direction: MessageDirection.INBOUND,
      conversation: { contactId },
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  return prisma.contactSendLog.count({
    where: {
      workspaceId,
      contactId,
      category: SendCategory.PROMOTIONAL,
      journeyId: { not: null },
      sentAt: {
        gt: ultimaRespuesta?.createdAt ?? new Date(0),
        lte: now,
      },
    },
  });
}

/** Deja constancia de un envio para que los topes lo cuenten. */
export async function recordSend(
  input: {
    workspaceId: string;
    contactId: string;
    channel: ConsentChannel;
    category?: SendCategory;
    journeyId?: string | null;
    campaignId?: string | null;
    sentAt?: Date;
  },
  db: Db = prisma,
) {
  return db.contactSendLog.create({
    data: {
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      channel: input.channel,
      category: input.category ?? SendCategory.PROMOTIONAL,
      journeyId: input.journeyId ?? null,
      campaignId: input.campaignId ?? null,
      sentAt: input.sentAt ?? new Date(),
    },
  });
}
