import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AgentVersionStatus, WorkspaceRole } from '../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { assertFeature } from '@/lib/entitlements';
import { withEntitlementLock } from '@/lib/entitlements/lock';
import { gate } from '@/lib/entitlements/http';

const publishSchema = z.object({ versionId: z.string().min(1) });

/**
 * Publica una version. Solo el OWNER puede: dejar una IA hablando con los
 * clientes es una decision del dueno del negocio (spec, seccion 7).
 *
 * Archiva la anterior en la misma transaccion, para que nunca haya dos
 * publicadas al mismo tiempo.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  if (user.role !== WorkspaceRole.OWNER) {
    return NextResponse.json(
      { message: 'Solo el owner puede publicar un agente.' },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, publishSchema);
  if (!parsed.ok) return parsed.response;

  const version = await prisma.agentVersion.findFirst({
    where: {
      id: parsed.data.versionId,
      agentDefinitionId: id,
      definition: { workspaceId: user.workspace.id },
    },
    select: { id: true, version: true, status: true },
  });

  if (!version) return NextResponse.json({ message: 'Version no encontrada' }, { status: 404 });
  if (version.status === AgentVersionStatus.PUBLISHED) {
    return NextResponse.json({ data: { alreadyPublished: true } });
  }

  // P0-C: publicar un agente exige IA en el plan. Si el agente todavia no
  // estaba en vivo, ademas ocupa un lugar de `agents.max`; publicar una
  // version nueva de uno que ya atiende no suma. Conteo y publicacion van bajo
  // el lock del limite: dos publicaciones simultaneas no superan el cupo.
  const blocked = await gate(() =>
    withEntitlementLock(user.workspace.id, 'agents.max', async (tx, guard) => {
      await assertFeature(user.workspace.id, 'agents', tx);
      const live = await tx.agentVersion.count({
        where: { agentDefinitionId: id, status: AgentVersionStatus.PUBLISHED, definition: { workspaceId: user.workspace.id, isActive: true } },
      });
      if (live === 0) await guard.assertCanGrow();
      await tx.agentVersion.updateMany({
        where: { agentDefinitionId: id, status: AgentVersionStatus.PUBLISHED },
        data: { status: AgentVersionStatus.ARCHIVED },
      });
      await tx.agentVersion.update({
        where: { id: version.id },
        data: { status: AgentVersionStatus.PUBLISHED, publishedAt: new Date() },
      });
    }),
  );
  if (blocked) return blocked;

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'agent.version_published',
    entity: 'AgentVersion',
    entityId: version.id,
    metadata: { version: version.version },
  });

  return NextResponse.json({ data: { published: version.version } });
}
