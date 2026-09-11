import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ConsentChannel } from '../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { campaignMetrics } from '@/lib/marketing/campaigns';
import { canManageMarketing } from '@/lib/marketing/roles';
import { parseDefinition } from '@/lib/marketing/segments';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().min(1).max(120),
  segmentId: z.string().min(1),
  templateId: z.string().min(1),
});

export async function GET() {
  const user = await requireCurrentUser();

  const campaigns = await prisma.campaign.findMany({
    where: { workspaceId: user.workspace.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const data = await Promise.all(
    campaigns.map((campaign) => campaignMetrics(user.workspace.id, campaign.id)),
  );

  return NextResponse.json({ data: data.filter(Boolean) });
}

export async function POST(request: Request) {
  const user = await requireCurrentUser();

  if (!canManageMarketing(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede crear campanas.' },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, createSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  const segment = await prisma.segment.findFirst({
    where: { id: input.segmentId, workspaceId: user.workspace.id },
  });

  if (!segment) {
    return NextResponse.json({ message: 'El segmento no existe en este workspace.' }, { status: 400 });
  }

  // Se rechaza aqui y no al enviar: enterarse de que la lista de suprimidos no
  // era enviable recien al momento del envio es enterarse tarde.
  const definition = parseDefinition(segment.definition);
  if (definition?.queryOnly) {
    return NextResponse.json(
      { message: 'Ese segmento es de solo consulta: no se le puede enviar.', code: 'QUERY_ONLY' },
      { status: 409 },
    );
  }

  const template = await prisma.emailTemplate.findFirst({
    where: { id: input.templateId, workspaceId: user.workspace.id },
    select: { id: true },
  });

  if (!template) {
    return NextResponse.json({ message: 'La plantilla no existe en este workspace.' }, { status: 400 });
  }

  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: user.workspace.id,
      name: input.name,
      channel: ConsentChannel.EMAIL,
      segmentId: segment.id,
      templateId: template.id,
      createdById: user.id,
    },
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'campaign.created',
    entity: 'Campaign',
    entityId: campaign.id,
    metadata: { name: campaign.name, segment: segment.key },
  });

  return NextResponse.json({ data: campaign }, { status: 201 });
}
