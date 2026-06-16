import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentWorkspaceId } from '@/lib/crm-data';
import { prisma } from '@/lib/prisma';

const updateStageSchema = z.object({
  name: z.string().min(1).optional(),
  position: z.number().int().min(1).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const input = updateStageSchema.parse(await request.json());
  const workspaceId = await getCurrentWorkspaceId();

  const stage = await prisma.pipelineStage.update({
    where: { id, workspaceId },
    data: input,
  });

  return NextResponse.json({ data: stage });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspaceId = await getCurrentWorkspaceId();

  await prisma.pipelineStage.delete({
    where: { id, workspaceId },
  });

  return NextResponse.json({ ok: true });
}
