import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** Historial de ejecuciones con su costo, para auditar que hizo la IA. */
export async function GET(request: Request) {
  const user = await requireCurrentUser();
  const { searchParams } = new URL(request.url);

  const runs = await prisma.agentRun.findMany({
    where: {
      workspaceId: user.workspace.id,
      conversationId: searchParams.get('conversationId') ?? undefined,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      status: true,
      trigger: true,
      output: true,
      toolCalls: true,
      steps: true,
      inputTokens: true,
      outputTokens: true,
      costEstimate: true,
      latencyMs: true,
      escalated: true,
      error: true,
      createdAt: true,
    },
  });

  const totals = await prisma.agentRun.aggregate({
    where: { workspaceId: user.workspace.id },
    _sum: { inputTokens: true, outputTokens: true, costEstimate: true },
    _count: { _all: true },
  });

  return NextResponse.json({
    data: runs,
    totals: {
      runs: totals._count._all,
      inputTokens: totals._sum.inputTokens ?? 0,
      outputTokens: totals._sum.outputTokens ?? 0,
      costEstimateClp: totals._sum.costEstimate ?? 0,
    },
  });
}
