import {
  BuyingIntent,
  LifecycleStatus,
  QuoteStatus,
} from '../../../generated/prisma/client';
import { recalculateContactScore } from '../domain/scoring';
import { prisma } from '../prisma';

/**
 * Tareas de mantenimiento periodico.
 *
 * Cada una existia como deuda documentada: codigo escrito que nadie llamaba, o
 * un estado que se guardaba y nadie barria. Un dato con fecha de vencimiento
 * que nada vence no es un dato con fecha de vencimiento.
 */

/**
 * Vence las cotizaciones cuya validez ya paso.
 *
 * `validUntil` se guardaba desde la Fase 7 y aparecia en el PDF, pero ninguna
 * cotizacion pasaba sola a EXPIRED: el cliente veia "vence el 20" y el 21
 * seguia diciendo "enviada".
 *
 * Solo se vencen las que estan esperando respuesta. Una aceptada ya cumplio su
 * proposito y una rechazada tambien: vencerlas borraria informacion.
 */
export async function expireOverdueQuotes(now = new Date()) {
  const result = await prisma.quote.updateMany({
    where: {
      status: { in: [QuoteStatus.APPROVED, QuoteStatus.SENT] },
      validUntil: { lt: now },
    },
    data: { status: QuoteStatus.EXPIRED },
  });

  return result.count;
}

/**
 * Recalcula el score de los contactos que llevan tiempo sin recalcularse.
 *
 * El scoring castiga el silencio —siete y treinta dias sin actividad restan
 * puntos— pero solo se recalculaba cuando pasaba algo. Un contacto que se
 * queda callado no genera ningun evento, que es justamente el caso en el que
 * su score deberia bajar: sin este barrido, un lead abandonado se queda
 * caliente para siempre.
 */
export async function ageStaleScores(limit = 200, now = new Date()) {
  const threshold = new Date(now.getTime() - 24 * 3_600_000);

  const contacts = await prisma.contact.findMany({
    where: {
      lifecycleStatus: { in: [LifecycleStatus.LEAD, LifecycleStatus.QUALIFIED] },
      OR: [{ scoreUpdatedAt: null }, { scoreUpdatedAt: { lt: threshold } }],
      // Un contacto con score cero y sin intencion no tiene de donde bajar.
      NOT: { leadScore: 0, buyingIntent: BuyingIntent.UNKNOWN },
    },
    orderBy: { scoreUpdatedAt: 'asc' },
    take: limit,
    select: { id: true, workspaceId: true },
  });

  let updated = 0;

  for (const contact of contacts) {
    const result = await recalculateContactScore({
      workspaceId: contact.workspaceId,
      contactId: contact.id,
    });
    if (result) updated += 1;
  }

  return updated;
}
