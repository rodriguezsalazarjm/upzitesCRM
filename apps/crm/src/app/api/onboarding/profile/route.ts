import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BusinessType } from '../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import { canManageMarketing } from '@/lib/marketing/roles';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  businessName: z.string().min(1).max(120).optional(),
  businessType: z.nativeEnum(BusinessType).optional(),
  currency: z.string().length(3).optional(),
  country: z.string().length(2).optional(),
  businessStartMinute: z.number().int().min(0).max(1439).optional(),
  businessEndMinute: z.number().int().min(0).max(1439).optional(),
  businessDays: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional(),
  about: z.string().max(4000).optional(),
  policies: z.string().max(4000).optional(),
  shippingInfo: z.string().max(4000).optional(),
  returnsPolicy: z.string().max(4000).optional(),
});

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

  const parsed = await parseBody(request, updateSchema);
  if (!parsed.ok) return parsed.response;
  const { businessName, ...profileData } = parsed.data;

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

  if (businessName) {
    await prisma.workspace.update({
      where: { id: user.workspace.id },
      data: { name: businessName },
    });
  }

  const profile = await prisma.workspaceProfile.upsert({
    where: { workspaceId: user.workspace.id },
    create: { workspaceId: user.workspace.id, ...profileData },
    update: profileData,
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'workspace.profile_updated',
    entity: 'WorkspaceProfile',
    entityId: profile.id,
    metadata: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ data: profile });
}
