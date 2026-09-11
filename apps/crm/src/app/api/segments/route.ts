import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SegmentSource } from '../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { canManageMarketing } from '@/lib/marketing/roles';
import { countSegment, segmentDefinitionSchema } from '@/lib/marketing/segments';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  key: z.string().min(1).regex(/^[a-z][a-z0-9-]*$/, 'Usa minusculas y guiones'),
  name: z.string().min(1),
  description: z.string().optional(),
  definition: segmentDefinitionSchema,
});

export async function GET() {
  const user = await requireCurrentUser();

  const segments = await prisma.segment.findMany({
    where: { workspaceId: user.workspace.id },
    orderBy: [{ source: 'asc' }, { name: 'asc' }],
  });

  return NextResponse.json({ data: segments });
}

export async function POST(request: Request) {
  const user = await requireCurrentUser();

  if (!canManageMarketing(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede crear segmentos.' },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, createSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  const existing = await prisma.segment.findUnique({
    where: { workspaceId_key: { workspaceId: user.workspace.id, key: input.key } },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json({ message: 'Ya existe un segmento con esa clave.' }, { status: 409 });
  }

  // Se cuenta al crear para que el segmento nazca con un numero real y no con
  // un cero que parece un error.
  const estimatedCount = await countSegment({
    workspaceId: user.workspace.id,
    definition: input.definition,
  });

  const segment = await prisma.segment.create({
    data: {
      workspaceId: user.workspace.id,
      key: input.key,
      name: input.name,
      description: input.description,
      source: SegmentSource.CUSTOM,
      definition: input.definition,
      estimatedCount,
      lastEvaluatedAt: new Date(),
    },
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'segment.created',
    entity: 'Segment',
    entityId: segment.id,
    metadata: { key: segment.key, estimatedCount },
  });

  return NextResponse.json({ data: segment }, { status: 201 });
}
