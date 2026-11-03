import type { MessagingPolicy } from '../../../generated/prisma/client';

/**
 * Parte pura de la politica de contacto: la politica por defecto y el calculo
 * de horario (zona del workspace, dias habiles, cambio de hora). Sin base de
 * datos, para poder probarla con relojes controlados. `policy.ts` la reexporta.
 */

export const DEFAULT_POLICY = {
  timezone: 'America/Santiago',
  quietStartMinute: 20 * 60 + 30,
  quietEndMinute: 9 * 60,
  maxWhatsappPerDay: 1,
  maxEmailPerWeek: 3,
  maxConsecutiveNoReply: 3,
  allowSameDayMultichannel: false,
  sendDays: [0, 1, 2, 3, 4, 5, 6] as number[],
  outOfHoursBehavior: 'POSTPONE' as 'POSTPONE' | 'SKIP',
};

export type ContactPolicy = {
  timezone: string;
  quietStartMinute: number;
  quietEndMinute: number;
  maxWhatsappPerDay: number;
  maxEmailPerWeek: number;
  maxConsecutiveNoReply: number;
  allowSameDayMultichannel: boolean;
  /** Punto 7: dias habiles (0 = domingo). Ausente = todos. */
  sendDays?: number[];
  /** Punto 7: que hace un seguimiento que vence fuera de horario. */
  outOfHoursBehavior?: 'POSTPONE' | 'SKIP';
};

export function policyFrom(row: MessagingPolicy | null): ContactPolicy {
  return row ? { ...row } : { ...DEFAULT_POLICY, sendDays: [...DEFAULT_POLICY.sendDays] };
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

function isQuietMinute(minute: number, policy: ContactPolicy) {
  // Cuando el inicio es posterior al fin, la ventana cruza la medianoche.
  return policy.quietStartMinute > policy.quietEndMinute
    ? minute >= policy.quietStartMinute || minute < policy.quietEndMinute
    : minute >= policy.quietStartMinute && minute < policy.quietEndMinute;
}

/** Dia de la semana de una hora de pared (0 = domingo), sin depender de la zona del servidor. */
function weekdayOf(wall: Pick<WallTime, 'year' | 'month' | 'day'>) {
  return new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay();
}

function isSendDay(wall: WallTime, policy: ContactPolicy) {
  const days = policy.sendDays;
  // Sin dias configurados (o una lista vacia por error) no se bloquea todo:
  // dejar a un workspace sin poder escribir nunca es peor que no acotar.
  if (!days || days.length === 0 || days.length >= 7) return true;
  return days.includes(weekdayOf(wall));
}

/**
 * Fuera del horario de envio: dentro de la ventana de silencio o en un dia no
 * habil (Punto 7). El nombre se conserva porque todo el sistema lo usa.
 */
export function isQuietHour(date: Date, policy: ContactPolicy) {
  const wall = wallTimeIn(date, policy.timezone);
  return isQuietMinute(wall.hour * 60 + wall.minute, policy) || !isSendDay(wall, policy);
}

/**
 * Proximo instante habil. Si la fecha ya esta dentro del horario se devuelve
 * tal cual: reprogramar algo que podia salir seria un retraso gratuito.
 *
 * Se trabaja en hora de pared y se convierte al final con
 * `instantForWallTime`, que resuelve el desfase vigente en ESA fecha: un cambio
 * de horario entre hoy y el proximo dia habil no corre la hora de apertura.
 */
export function nextAllowedInstant(date: Date, policy: ContactPolicy): Date {
  if (!isQuietHour(date, policy)) return date;

  const wall = wallTimeIn(date, policy.timezone);
  const minute = wall.hour * 60 + wall.minute;
  const open = { hour: Math.floor(policy.quietEndMinute / 60), minute: policy.quietEndMinute % 60 };

  // Hoy todavia sirve si es dia habil y el silencio es el de la madrugada (antes
  // de la apertura). En cualquier otro caso se busca la apertura de un dia
  // siguiente.
  const crossesMidnight = policy.quietStartMinute > policy.quietEndMinute;
  const beforeOpenToday = crossesMidnight
    ? minute < policy.quietEndMinute
    : minute < policy.quietEndMinute && minute >= policy.quietStartMinute;
  let offset = isSendDay(wall, policy) && isQuietMinute(minute, policy) && beforeOpenToday ? 0 : 1;

  for (; offset <= 8; offset += 1) {
    // Date.UTC normaliza dia 32 -> dia 1 del mes siguiente, asi que no hace
    // falta tratar el fin de mes aparte.
    const day = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + offset));
    const candidate: WallTime = {
      year: day.getUTCFullYear(),
      month: day.getUTCMonth() + 1,
      day: day.getUTCDate(),
      ...open,
    };
    if (isSendDay(candidate, policy)) return instantForWallTime(candidate, policy.timezone);
  }

  // Inalcanzable con al menos un dia habil; se devuelve algo razonable.
  return new Date(date.getTime() + 24 * 3_600_000);
}
