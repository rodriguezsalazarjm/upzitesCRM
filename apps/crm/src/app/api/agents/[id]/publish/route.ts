import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AgentVersionStatus, UserRole } from '../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';

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

  if (user.role !== UserRole.OWNER) {
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

  await prisma.$transaction([
    prisma.agentVersion.updateMany({
      where: { agentDefinitionId: id, status: AgentVersionStatus.PUBLISHED },
      data: { status: AgentVersionStatus.ARCHIVED },
    }),
    prisma.agentVersion.update({
      where: { id: version.id },
      data: { status: AgentVersionStatus.PUBLISHED, publishedAt: new Date() },
    }),
  ]);

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
