import {
  ScheduledActionStatus,
  ScheduledActionType,
  type Prisma,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { recordAudit, type Db } from './audit';

/** Ventana en la que no se envia nada. Por defecto 20:30 a 09:00 (spec, seccion 11). */
export type QuietHours = {
  /** Minutos desde medianoche en que empieza el silencio. */
  startMinute: number;
  /** Minutos desde medianoche en que termina. */
  endMinute: number;
};

export const DEFAULT_QUIET_HOURS: QuietHours = {
  startMinute: 20 * 60 + 30,
  endMinute: 9 * 60,
};

function minutesOfDay(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

export function isWithinQuietHours(date: Date, quietHours: QuietHours = DEFAULT_QUIET_HOURS) {
  const minute = minutesOfDay(date);
  // La ventana cruza la medianoche cuando el inicio es posterior al fin.
  return quietHours.startMinute > quietHours.endMinute
    ? minute >= quietHours.startMinute || minute < quietHours.endMinute
    : minute >= quietHours.startMinute && minute < quietHours.endMinute;
}

/**
 * Corre una fecha al proximo horario habil si cae dentro de la ventana de
 * silencio. Es una funcion pura: la usan tanto el scheduler como las pruebas.
 */
export function nextValidRunAt(date: Date, quietHours: QuietHours = DEFAULT_QUIET_HOURS) {
  if (!isWithinQuietHours(date, quietHours)) return date;

  const result = new Date(date);
  const minute = minutesOfDay(date);
  // Si ya paso el inicio del silencio, el proximo horario valido es al dia
  // siguiente; si aun no amanece, es hoy mismo a la hora de apertura.
  if (quietHours.startMinute > quietHours.endMinute && minute >= quietHours.startMinute) {
    result.setDate(result.getDate() + 1);
  }
  result.setHours(Math.floor(quietHours.endMinute / 60), quietHours.endMinute % 60, 0, 0);
  return result;
}

export type ScheduleInput = {
  workspaceId: string;
  contactId?: string | null;
  type: ScheduledActionType;
  runAt: Date;
  payload?: Prisma.InputJsonValue;
  /** Agrupa acciones del mismo motivo para poder cancelarlas juntas. */
  cancelKey?: string | null;
  /** Si se pasa, corre `runAt` fuera de la ventana de silencio. */
  quietHours?: QuietHours;
  actorId?: string | null;
};

export async function scheduleAction(input: ScheduleInput, db: Db = prisma) {
  const runAt = input.quietHours ? nextValidRunAt(input.runAt, input.quietHours) : input.runAt;

  const action = await db.scheduledAction.create({
    data: {
      workspaceId: input.workspaceId,
      contactId: input.contactId ?? null,
      type: input.type,
      runAt,
      payload: input.payload,
      cancelKey: input.cancelKey ?? null,
    },
  });

  await recordAudit(
    {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: 'scheduled_action.created',
      entity: 'ScheduledAction',
      entityId: action.id,
      metadata: { type: input.type, runAt: runAt.toISOString(), cancelKey: input.cancelKey ?? null },
    },
    db,
  );

  return action;
}

/**
 * Cancela todas las acciones pendientes que comparten una `cancelKey`.
 *
 * Es el mecanismo que apaga una recuperacion completa de una sola vez cuando
 * el contacto responde, paga o pide no ser contactado.
 */
export async function cancelByKey(
  input: { workspaceId: string; cancelKey: string; reason: string; actorId?: string | null },
  db: Db = prisma,
) {
  const result = await db.scheduledAction.updateMany({
    where: {
      workspaceId: input.workspaceId,
      cancelKey: input.cancelKey,
      status: ScheduledActionStatus.PENDING,
    },
    data: { status: ScheduledActionStatus.CANCELED, canceledAt: new Date() },
  });

  if (result.count > 0) {
    await recordAudit(
      {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: 'scheduled_action.canceled',
        entity: 'ScheduledAction',
        metadata: { cancelKey: input.cancelKey, reason: input.reason, count: result.count },
      },
      db,
    );
  }

  return result.count;
}

export async function cancelForContact(
  input: { workspaceId: string; contactId: string; reason: string; types?: ScheduledActionType[]; actorId?: string | null },
  db: Db = prisma,
) {
  const result = await db.scheduledAction.updateMany({
    where: {
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      status: ScheduledActionStatus.PENDING,
      ...(input.types ? { type: { in: input.types } } : {}),
    },
    data: { status: ScheduledActionStatus.CANCELED, canceledAt: new Date() },
  });

  if (result.count > 0) {
    await recordAudit(
      {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: 'scheduled_action.canceled',
        entity: 'Contact',
        entityId: input.contactId,
        metadata: { reason: input.reason, count: result.count },
      },
      db,
    );
  }

  return result.count;
}

/**
 * Acciones vencidas listas para ejecutar. La Fase 3 conecta esto a una cola
 * durable; por ahora solo expone la consulta.
 */
export async function dueActions(limit = 50, now = new Date(), db: Db = prisma) {
  return db.scheduledAction.findMany({
    where: { status: ScheduledActionStatus.PENDING, runAt: { lte: now } },
    orderBy: { runAt: 'asc' },
    take: limit,
  });
}
