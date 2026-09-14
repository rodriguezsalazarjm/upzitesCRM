import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import { canManageMarketing } from '@/lib/marketing/roles';
import { updateWorkspaceProfileSchema } from '@/lib/onboarding/profile-input';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireCurrentUser();

  const profile = await prisma.workspaceProfile.upsert({
    where: { workspaceId: user.workspace.id },
    create: { workspaceId: user.workspace.id },
    update: {},
  });

  return NextResponse.json({ data: { ...profile, businessName: user.workspace.name } });
}

/**
 * Guarda los pasos del wizard que son datos: negocio, horarios, tipo e
 * informacion. Los demas pasos no se "guardan" —se cumplen conectando algo— y
 * por eso no tienen endpoint propio.
 */
export async function PATCH(request: Request) {
  const user = await requireCurrentUser();

  if (!canManageMarketing(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede cambiar los datos del negocio.' },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, updateWorkspaceProfileSchema);
  if (!parsed.ok) return parsed.response;
  const { businessName, timezone, ...profileData } = parsed.data;

  if (timezone) {
    try {
      new Intl.DateTimeFormat('es-CL', { timeZone: timezone });
    } catch {
      return NextResponse.json(
        { message: 'Selecciona una zona horaria válida.', code: 'INVALID_TIMEZONE' },
        { status: 400 },
      );
    }
  }

  if (
    profileData.businessStartMinute !== undefined &&
    profileData.businessEndMinute !== undefined &&
    profileData.businessStartMinute >= profileData.businessEndMinute
  ) {
    return NextResponse.json(
      { message: 'El horario de atencion debe empezar antes de terminar.', code: 'INVALID_HOURS' },
      { status: 400 },
    );
  }

  const profile = await prisma.$transaction(async (tx) => {
    if (businessName) {
      await tx.workspace.update({
        where: { id: user.workspace.id },
        data: { name: businessName },
      });
    }

    const saved = await tx.workspaceProfile.upsert({
      where: { workspaceId: user.workspace.id },
      create: { workspaceId: user.workspace.id, ...profileData },
      update: profileData,
    });

    if (timezone) {
      const policy = await tx.messagingPolicy.upsert({
        where: { workspaceId: user.workspace.id },
        create: { workspaceId: user.workspace.id, timezone },
        update: { timezone },
      });

      await recordAudit(
        {
          workspaceId: user.workspace.id,
          actorId: user.id,
          action: 'messaging_policy.updated',
          entity: 'MessagingPolicy',
          entityId: policy.id,
          metadata: { timezone },
        },
        tx,
      );
    }

    await recordAudit(
      {
        workspaceId: user.workspace.id,
        actorId: user.id,
        action: 'workspace.profile_updated',
        entity: 'WorkspaceProfile',
        entityId: saved.id,
        metadata: { fields: Object.keys(parsed.data) },
      },
      tx,
    );

    return saved;
  });

  return NextResponse.json({ data: profile });
}
