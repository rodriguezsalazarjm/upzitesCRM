import { NextResponse } from 'next/server';
import { UserRole } from '../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/domain/audit';
import { prisma } from '@/lib/prisma';

/** Desactiva el servicio completo para que el cotizador deje de ofrecerlo. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  if (user.role !== UserRole.OWNER) {
    return NextResponse.json(
      { message: 'Solo la persona propietaria puede desactivar un servicio.' },
      { status: 403 },
    );
  }

  const selected = await prisma.pricingRuleSet.findFirst({
    where: { id, workspaceId: user.workspace.id },
    select: { id: true, serviceKey: true },
  });
  if (!selected) return NextResponse.json({ message: 'Servicio no encontrado.' }, { status: 404 });

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM workspaces WHERE id = ${user.workspace.id} FOR UPDATE`;
    const archived = await tx.pricingRuleSet.updateMany({
      where: { workspaceId: user.workspace.id, serviceKey: selected.serviceKey },
      data: { status: 'ARCHIVED' },
    });
    await recordAudit(
      {
        workspaceId: user.workspace.id,
        actorId: user.id,
        action: 'pricing.service_archived',
        entity: 'PricingRuleSet',
        entityId: selected.id,
        metadata: { serviceKey: selected.serviceKey, versions: archived.count },
      },
      tx,
    );
    return archived;
  });

  return NextResponse.json({ data: { archived: result.count } });
}
