import {
  ConsentChannel,
  JourneyEnrollmentStatus,
  JourneyStepAction,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { recordAudit, type Db } from '../domain/audit';

/**
 * Salida de inscripciones en journeys.
 *
 * Vive en su propio archivo, sin importar nada de marketing, a proposito: lo
 * necesitan tanto los journeys como `revokeConsent`, y si estuviera junto al
 * motor de journeys se formaria un ciclo de imports (consent -> journeys ->
 * envio -> politica -> consent).
 */

const ACTION_FOR_CHANNEL: Record<ConsentChannel, JourneyStepAction | null> = {
  [ConsentChannel.WHATSAPP]: JourneyStepAction.SEND_WHATSAPP,
  [ConsentChannel.EMAIL]: JourneyStepAction.SEND_EMAIL,
  [ConsentChannel.ADS]: null,
};

export type ExitInput = {
  workspaceId: string;
  contactId: string;
  reason: string;
  /** Si se pasa, solo salen los journeys que escriben por ese canal. */
  channel?: ConsentChannel;
  status?: JourneyEnrollmentStatus;
  actorId?: string | null;
};

/**
 * Saca al contacto de sus journeys activos.
 *
 * Cuando se acota por canal, sale de todo journey que tenga **algun** paso de
 * ese canal, no solo de los que lo usan siempre. Es deliberadamente
 * conservador: ante la duda, no escribir. La puerta de envio vuelve a comprobar
 * el consentimiento de todas formas, asi que quedan dos capas.
 */
export async function exitEnrollments(input: ExitInput, db: Db = prisma) {
  const action = input.channel ? ACTION_FOR_CHANNEL[input.channel] : null;

  // ADS no tiene pasos de journey: revocar publicidad no interrumpe un
  // seguimiento comercial y no hay nada que sacar.
  if (input.channel && !action) return 0;

  const enrollments = await db.journeyEnrollment.findMany({
    where: {
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      status: JourneyEnrollmentStatus.ACTIVE,
      ...(action ? { journey: { steps: { some: { action } } } } : {}),
    },
    select: { id: true },
  });

  if (enrollments.length === 0) return 0;

  const now = new Date();

  await db.journeyEnrollment.updateMany({
    where: { id: { in: enrollments.map((enrollment) => enrollment.id) } },
    data: {
      status: input.status ?? JourneyEnrollmentStatus.CANCELED,
      exitedAt: now,
      exitReason: input.reason,
      nextRunAt: null,
    },
  });

  await recordAudit(
    {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: 'journey.enrollments_exited',
      entity: 'Contact',
      entityId: input.contactId,
      metadata: {
        reason: input.reason,
        channel: input.channel ?? null,
        count: enrollments.length,
      },
    },
    db,
  );

  return enrollments.length;
}
