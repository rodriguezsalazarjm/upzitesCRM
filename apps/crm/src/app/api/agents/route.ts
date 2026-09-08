import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ALL_TOOL_NAMES, PENDING_TOOLS } from '@/lib/agents/tools';

export const dynamic = 'force-dynamic';

/** Agentes del workspace con sus versiones. Nunca devuelve claves de proveedor. */
export async function GET() {
  const user = await requireCurrentUser();

  const agents = await prisma.agentDefinition.findMany({
    where: { workspaceId: user.workspace.id },
    include: {
      versions: {
        orderBy: { version: 'desc' },
        select: {
          id: true,
          version: true,
          status: true,
          model: true,
          allowedTools: true,
          maxSteps: true,
          publishedAt: true,
          createdAt: true,
        },
      },
    },
  });

  return NextResponse.json({
    data: agents,
    availableTools: ALL_TOOL_NAMES,
    pendingTools: PENDING_TOOLS,
  });
}
