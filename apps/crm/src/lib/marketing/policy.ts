import {
  ConsentChannel,
  SendCategory,
  type MessagingPolicy,
} from '../../../generated/prisma/client';
import { canContact } from '../domain/consent';
import { prisma } from '../prisma';
import type { Db } from '../domain/audit';

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

export const DEFAULT_POLICY = {
  timezone: 'America/Santiago',
  quietStartMinute: 20 * 60 + 30,
  quietEndMinute: 9 * 60,
  maxWhatsappPerDay: 1,
  maxEmailPerWeek: 3,
  maxConsecutiveNoReply: 3,
  allowSameDayMultichannel: false,
} as const;

export type ContactPolicy = {
  timezone: string;
  quietStartMinute: number;
  quietEndMinute: number;
  maxWhatsappPerDay: number;
  maxEmailPerWeek: number;
  maxConsecutiveNoReply: number;
  allowSameDayMultichannel: boolean;
};

export function policyFrom(row: MessagingPolicy | null): ContactPolicy {
  return row ? { ...row } : { ...DEFAULT_POLICY };
}

/** Lee la politica del workspace, o la de fabrica si aun no tiene una. */
export async function getPolicy(workspaceId: string, db: Db = prisma): Promise<ContactPolicy> {
  const row = await db.messagingPolicy.findUnique({ where: { workspaceId } });
  return policyFrom(row);
}

// --- Zona horaria ------------------------------------------------------------

type WallTime = { year: number; month: number; day: number; hour: number; minute: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Hora de pared de un instante en una zona. Lanza si la zona no existe. */
export function wallTimeIn(date: Date, timeZone: string): WallTime {
  const parts = formatterFor(timeZone).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

function asUtcMs(wall: WallTime) {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
}

/**
 * Convierte una hora de pared de una zona al instante UTC que le corresponde.
 *
 * Se resuelve iterando: se estima con el desfase actual y se corrige con el
 * desfase que realmente rige en la fecha estimada. Dos pasadas bastan y dejan
 * bien los cambios de horario de verano, que es cuando el desfase se mueve.
 */
export function instantForWallTime(wall: WallTime, timeZone: string): Date {
  const target = asUtcMs(wall);
  let guess = new Date(target);

  for (let i = 0; i < 2; i += 1) {
    const offset = asUtcMs(wallTimeIn(guess, timeZone)) - guess.getTime();
    guess = new Date(target - offset);
  }

  return guess;
}

export function minutesOfDayIn(date: Date, timeZone: string) {
  const wall = wallTimeIn(date, timeZone);
  return wall.hour * 60 + wall.minute;
}

export function isQuietHour(date: Date, policy: ContactPolicy) {
  const minute = minutesOfDayIn(date, policy.timezone);
  // Cuando el inicio es posterior al fin, la ventana cruza la medianoche.
  return policy.quietStartMinute > policy.quietEndMinute
    ? minute >= policy.quietStartMinute || minute < policy.quietEndMinute
    : minute >= policy.quietStartMinute && minute < policy.quietEndMinute;
}

/**
 * Proximo instante habil. Si la fecha ya esta fuera de la ventana de silencio
 * se devuelve tal cual: reprogramar algo que podia salir seria un retraso
 * gratuito.
 */
export function nextAllowedInstant(date: Date, policy: ContactPolicy): Date {
  if (!isQuietHour(date, policy)) return date;

  const wall = wallTimeIn(date, policy.timezone);
  const minute = wall.hour * 60 + wall.minute;

  // Si ya empezo el silencio de la noche, el proximo horario valido es manana.
  const crossesMidnight = policy.quietStartMinute > policy.quietEndMinute;
  const nextDay = crossesMidnight && minute >= policy.quietStartMinute;

  const base: WallTime = {
    year: wall.year,
    month: wall.month,
    day: wall.day + (nextDay ? 1 : 0),
    hour: Math.floor(policy.quietEndMinute / 60),
    minute: policy.quietEndMinute % 60,
  };

  // Date.UTC normaliza dia 32 -> dia 1 del mes siguiente, asi que no hace falta
  // tratar el fin de mes aparte.
  return instantForWallTime(base, policy.timezone);
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
        | 'MULTICHANNEL_SAME_DAY';
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
