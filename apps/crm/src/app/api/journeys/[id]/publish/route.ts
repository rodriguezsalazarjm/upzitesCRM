import { NextResponse } from 'next/server';
import { EmailDomainStatus, JourneyStatus } from '../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/domain/audit';
import { prisma } from '@/lib/prisma';
import { canManageMarketing } from '@/lib/marketing/roles';

export const dynamic = 'force-dynamic';

/**
 * Publica un journey: a partir de aqui inscribe contactos y les escribe.
 *
 * Se exige que tenga pasos y que los de email apunten a una plantilla
 * publicada. Publicar algo que va a fallar en el tercer paso es peor que no
 * publicarlo, porque el fallo aparece dias despues y sobre un cliente real.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  if (!canManageMarketing(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede publicar journeys.' },
      { status: 403 },
    );
  }

  const journey = await prisma.journey.findFirst({
    where: { id, workspaceId: user.workspace.id },
    include: { steps: { include: { template: { select: { status: true, name: true } } } } },
  });

  if (!journey) return NextResponse.json({ message: 'Journey no encontrado' }, { status: 404 });

  if (journey.steps.length === 0) {
    return NextResponse.json(
      { message: 'Un journey sin pasos no se puede publicar.', code: 'NO_STEPS' },
      { status: 409 },
    );
  }

  const brokenEmailStep = journey.steps.find(
    (step) => step.action === 'SEND_EMAIL' && step.template && step.template.status !== 'PUBLISHED',
  );

  if (brokenEmailStep) {
    return NextResponse.json(
      {
        message: `El paso "${brokenEmailStep.label}" usa una plantilla sin publicar.`,
        code: 'TEMPLATE_NOT_PUBLISHED',
      },
      { status: 409 },
    );
  }

  // Un paso de email sin dominio verificado no falla al publicar: falla en
  // silencio dias despues, cuando el envio ya salio hacia un cliente real y
  // `resolveSender` lo rechaza por DOMAIN_NOT_VERIFIED. Publicarlo asi es
  // prometer una recuperacion de ventas que nunca va a ocurrir.
  const sendsEmail = journey.steps.some((step) => step.action === 'SEND_EMAIL');

  if (sendsEmail) {
    const verifiedDomain = await prisma.emailDomain.findFirst({
      where: { workspaceId: user.workspace.id, status: EmailDomainStatus.VERIFIED },
      select: { id: true },
    });

    if (!verifiedDomain) {
      return NextResponse.json(
        {
          message:
            'Este seguimiento envia correos y todavia no tienes un dominio verificado. Verificalo primero, o quita los pasos de correo.',
          code: 'NO_VERIFIED_DOMAIN',
        },
        { status: 409 },
      );
    }
  }

  const updated = await prisma.journey.update({
    where: { id: journey.id },
    data: {
      status: JourneyStatus.PUBLISHED,
      publishedAt: journey.publishedAt ?? new Date(),
      pausedAt: null,
    },
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'journey.published',
    entity: 'Journey',
    entityId: journey.id,
    metadata: { key: journey.key, steps: journey.steps.length },
  });

  return NextResponse.json({ data: updated });
}
