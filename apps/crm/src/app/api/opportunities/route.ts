import { NextResponse } from 'next/server';
import { z } from 'zod';
import { OpportunityStage, OpportunityStatus } from '../../../../generated/prisma/client';
import { getCurrentWorkspaceId, getOpportunities } from '@/lib/crm-data';
import { prisma } from '@/lib/prisma';

const stageMap = {
  nuevo: OpportunityStage.NEW,
  calificado: OpportunityStage.QUALIFIED,
  propuesta: OpportunityStage.PROPOSAL,
  negociacion: OpportunityStage.NEGOTIATION,
  ganado: OpportunityStage.WON,
  perdido: OpportunityStage.LOST,
} as const;

const opportunitySchema = z.object({
  title: z.string().min(1),
  contactId: z.string().optional(),
  companyId: z.string().optional(),
  stage: z.enum(['nuevo', 'calificado', 'propuesta', 'negociacion', 'ganado', 'perdido']).default('nuevo'),
  ownerId: z.string().optional(),
  value: z.number().int().nonnegative().default(0),
  probability: z.number().int().min(0).max(100).default(20),
  expectedCloseDate: z.string().datetime().optional(),
});

function statusForStage(stage: OpportunityStage) {
  if (stage === OpportunityStage.WON) return OpportunityStatus.WON;
  if (stage === OpportunityStage.LOST) return OpportunityStatus.LOST;
  return OpportunityStatus.OPEN;
}

export async function GET() {
  const opportunities = await getOpportunities();
  return NextResponse.json({ data: opportunities });
}

export async function POST(request: Request) {
  const input = opportunitySchema.parse(await request.json());
  const workspaceId = await getCurrentWorkspaceId();
  const stageKey = stageMap[input.stage];
  const stage = await prisma.pipelineStage.findUniqueOrThrow({
    where: {
      workspaceId_key: {
        workspaceId,
        key: stageKey,
      },
    },
  });

  const opportunity = await prisma.opportunity.create({
    data: {
      workspaceId,
      contactId: input.contactId,
      companyId: input.companyId,
      stageId: stage.id,
      ownerId: input.ownerId,
      title: input.title,
      value: input.value,
      probability: input.probability,
      expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : undefined,
      status: statusForStage(stageKey),
    },
  });

  return NextResponse.json({ data: opportunity }, { status: 201 });
}

