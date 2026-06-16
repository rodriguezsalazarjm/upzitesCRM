import { NextResponse } from 'next/server';
import { z } from 'zod';
import { OpportunityStage, OpportunityStatus } from '../../../../../generated/prisma/client';
import { getCurrentWorkspaceId } from '@/lib/crm-data';
import { prisma } from '@/lib/prisma';

const stageMap = {
  nuevo: OpportunityStage.NEW,
  calificado: OpportunityStage.QUALIFIED,
  propuesta: OpportunityStage.PROPOSAL,
  negociacion: OpportunityStage.NEGOTIATION,
  ganado: OpportunityStage.WON,
  perdido: OpportunityStage.LOST,
} as const;

const updateOpportunitySchema = z.object({
  title: z.string().min(1).optional(),
  contactId: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  stage: z.enum(['nuevo', 'calificado', 'propuesta', 'negociacion', 'ganado', 'perdido']).optional(),
  ownerId: z.string().nullable().optional(),
  value: z.number().int().nonnegative().optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().datetime().nullable().optional(),
});

function statusForStage(stage: OpportunityStage) {
  if (stage === OpportunityStage.WON) return OpportunityStatus.WON;
  if (stage === OpportunityStage.LOST) return OpportunityStatus.LOST;
  return OpportunityStatus.OPEN;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const input = updateOpportunitySchema.parse(await request.json());
  const workspaceId = await getCurrentWorkspaceId();
  const stageKey = input.stage ? stageMap[input.stage] : undefined;
  const stage = stageKey
    ? await prisma.pipelineStage.findUniqueOrThrow({
        where: {
          workspaceId_key: {
            workspaceId,
            key: stageKey,
          },
        },
      })
    : undefined;

  const opportunity = await prisma.opportunity.update({
    where: { id, workspaceId },
    data: {
      title: input.title,
      contactId: input.contactId,
      companyId: input.companyId,
      stageId: stage?.id,
      ownerId: input.ownerId,
      value: input.value,
      probability: input.probability,
      expectedCloseDate:
        input.expectedCloseDate === undefined
          ? undefined
          : input.expectedCloseDate
            ? new Date(input.expectedCloseDate)
            : null,
      status: stageKey ? statusForStage(stageKey) : undefined,
    },
  });

  return NextResponse.json({ data: opportunity });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspaceId = await getCurrentWorkspaceId();

  await prisma.opportunity.delete({
    where: { id, workspaceId },
  });

  return NextResponse.json({ ok: true });
}

