import { NextResponse } from 'next/server';
import { PricingRuleSetStatus, UserRole } from '../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/domain/audit';
import { prisma } from '@/lib/prisma';

/**
 * Publica una version de reglas y archiva la anterior.
 *
 * Solo el OWNER: cambiar los precios con los que se cotiza es una decision del
 * dueno del negocio, no de un operador.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  if (user.role !== UserRole.OWNER) {
    return NextResponse.json(
      { message: 'Solo el owner puede publicar reglas de precio.' },
      { status: 403 },
    );
  }

  const ruleSet = await prisma.pricingRuleSet.findFirst({
    where: { id, workspaceId: user.workspace.id },
    select: { id: true, serviceKey: true, version: true, status: true },
  });

  if (!ruleSet) return NextResponse.json({ message: 'Reglas no encontradas' }, { status: 404 });
  if (ruleSet.status === PricingRuleSetStatus.PUBLISHED) {
    return NextResponse.json({ data: { alreadyPublished: true } });
  }

  await prisma.$transaction([
    prisma.pricingRuleSet.updateMany({
      where: {
        workspaceId: user.workspace.id,
        serviceKey: ruleSet.serviceKey,
        status: PricingRuleSetStatus.PUBLISHED,
      },
      data: { status: PricingRuleSetStatus.ARCHIVED },
    }),
    prisma.pricingRuleSet.update({
      where: { id: ruleSet.id },
      data: { status: PricingRuleSetStatus.PUBLISHED, publishedAt: new Date() },
    }),
  ]);

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'pricing.rule_set_published',
    entity: 'PricingRuleSet',
    entityId: ruleSet.id,
    metadata: { serviceKey: ruleSet.serviceKey, version: ruleSet.version },
  });

  return NextResponse.json({ data: { published: ruleSet.version } });
}
