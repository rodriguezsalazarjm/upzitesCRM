import { NextResponse } from 'next/server';
import { JourneyStatus } from '../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/domain/audit';
import { prisma } from '@/lib/prisma';
import { canManageMarketing } from '@/lib/marketing/roles';

export const dynamic = 'force-dynamic';

/**
 * Pausa un journey.
 *
 * Las inscripciones NO se cancelan: quedan donde estan y siguen cuando se
 * reactive. Pausar es el freno de mano de la spec —"apagar campanas sin detener
 * el CRM"— y por eso tiene que ser reversible sin perder estado.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  if (!canManageMarketing(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede pausar journeys.' },
      { status: 403 },
    );
  }

  const journey = await prisma.journey.findFirst({
    where: { id, workspaceId: user.workspace.id },
    select: { id: true, key: true, status: true },
  });

  if (!journey) return NextResponse.json({ message: 'Journey no encontrado' }, { status: 404 });

  const updated = await prisma.journey.update({
    where: { id: journey.id },
    data: { status: JourneyStatus.PAUSED, pausedAt: new Date() },
  });

  const active = await prisma.journeyEnrollment.count({
    where: { journeyId: journey.id, status: 'ACTIVE' },
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'journey.paused',
    entity: 'Journey',
    entityId: journey.id,
    metadata: { key: journey.key, activeEnrollments: active },
  });

  return NextResponse.json({ data: { ...updated, activeEnrollments: active } });
}
