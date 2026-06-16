import { NextResponse } from 'next/server';
import { z } from 'zod';
import { OpportunityStage } from '../../../../generated/prisma/client';
import { getCurrentWorkspaceId, getPipelineStages } from '@/lib/crm-data';
import { prisma } from '@/lib/prisma';

const stageKeyMap = {
  nuevo: OpportunityStage.NEW,
  calificado: OpportunityStage.QUALIFIED,
  propuesta: OpportunityStage.PROPOSAL,
  negociacion: OpportunityStage.NEGOTIATION,
  ganado: OpportunityStage.WON,
  perdido: OpportunityStage.LOST,
} as const;

const stageSchema = z.object({
  key: z.enum(['nuevo', 'calificado', 'propuesta', 'negociacion', 'ganado', 'perdido']),
  name: z.string().min(1),
  position: z.number().int().min(1),
  probability: z.number().int().min(0).max(100),
  isWon: z.boolean().default(false),
  isLost: z.boolean().default(false),
});

export async function GET() {
  const stages = await getPipelineStages();
  return NextResponse.json({ data: stages });
}

export async function POST(request: Request) {
  const input = stageSchema.parse(await request.json());
  const workspaceId = await getCurrentWorkspaceId();

  const stage = await prisma.pipelineStage.create({
    data: {
      workspaceId,
      key: stageKeyMap[input.key],
      name: input.name,
      position: input.position,
      probability: input.probability,
      isWon: input.isWon,
      isLost: input.isLost,
    },
  });

  return NextResponse.json({ data: stage }, { status: 201 });
}
