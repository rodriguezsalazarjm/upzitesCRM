import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { ALL_TOOL_NAMES } from '@/lib/agents/tools';
import { defaultModel } from '@/lib/agents/provider';

const versionSchema = z.object({
  instructions: z.string().min(20),
  model: z.string().min(1).optional(),
  // Solo herramientas que existen: pedir una inexistente es un error de
  // configuracion, no algo que deba descubrirse en produccion.
  allowedTools: z.array(z.enum(ALL_TOOL_NAMES as [string, ...string[]])).min(1),
  maxSteps: z.number().int().min(1).max(15).default(6),
});

/** Crea una version nueva en borrador. Nunca modifica la publicada. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  if (!canManageChannels(user.role)) {
    return NextResponse.json({ message: 'Solo el owner o un admin puede editar agentes.' }, { status: 403 });
  }

  const parsed = await parseBody(request, versionSchema);
  if (!parsed.ok) return parsed.response;

  const definition = await prisma.agentDefinition.findFirst({
    where: { id, workspaceId: user.workspace.id },
    select: { id: true },
  });
  if (!definition) return NextResponse.json({ message: 'Agente no encontrado' }, { status: 404 });

  const last = await prisma.agentVersion.findFirst({
    where: { agentDefinitionId: definition.id },
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  const version = await prisma.agentVersion.create({
    data: {
      agentDefinitionId: definition.id,
      version: (last?.version ?? 0) + 1,
      instructions: parsed.data.instructions,
      model: parsed.data.model ?? defaultModel(),
      allowedTools: parsed.data.allowedTools,
      maxSteps: parsed.data.maxSteps,
      createdById: user.id,
    },
    select: { id: true, version: true, status: true },
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'agent.version_created',
    entity: 'AgentVersion',
    entityId: version.id,
    metadata: { version: version.version },
  });

  return NextResponse.json({ data: version }, { status: 201 });
}
