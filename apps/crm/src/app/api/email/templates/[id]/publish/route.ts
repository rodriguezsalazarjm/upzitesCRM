import { NextResponse } from 'next/server';
import { EmailTemplateStatus } from '../../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/domain/audit';
import { prisma } from '@/lib/prisma';
import { canManageMarketing } from '@/lib/marketing/roles';

export const dynamic = 'force-dynamic';

/** Solo lo publicado se envia, igual que las reglas de precio de la Fase 7. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  if (!canManageMarketing(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede publicar plantillas.' },
      { status: 403 },
    );
  }

  const template = await prisma.emailTemplate.findFirst({
    where: { id, workspaceId: user.workspace.id },
    select: { id: true, key: true },
  });

  if (!template) return NextResponse.json({ message: 'Plantilla no encontrada' }, { status: 404 });

  const updated = await prisma.emailTemplate.update({
    where: { id: template.id },
    data: { status: EmailTemplateStatus.PUBLISHED, publishedAt: new Date() },
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'email.template_published',
    entity: 'EmailTemplate',
    entityId: template.id,
    metadata: { key: template.key },
  });

  return NextResponse.json({ data: updated });
}
