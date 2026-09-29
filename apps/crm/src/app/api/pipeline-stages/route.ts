import { NextResponse } from 'next/server';
import { z } from 'zod';
import { OpportunityStage } from '../../../../generated/prisma/client';
import { getCurrentWorkspaceId, getPipelineStages } from '@/lib/crm-data';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { requireCurrentUser } from '@/lib/auth';
import { canManageWorkspaceSettings } from '@/lib/workspace-roles';

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

/** Configurar el pipeline es configuracion del workspace: OWNER/ADMIN (403 para MEMBER). */
async function requireSettingsManager() {
  const user = await requireCurrentUser();
  if (!canManageWorkspaceSettings(user.role)) {
    return NextResponse.json({ message: 'Solo el owner o un admin puede configurar el pipeline.' }, { status: 403 });
  }
  return null;
}

export async function POST(request: Request) {
  const denied = await requireSettingsManager();
  if (denied) return denied;
  const parsed = await parseBody(request, stageSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;
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
