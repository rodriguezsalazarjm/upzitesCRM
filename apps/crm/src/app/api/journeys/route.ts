import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ConsentChannel,
  JourneyStepAction,
  JourneyTrigger,
} from '../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { canManageMarketing } from '@/lib/marketing/roles';
import { segmentDefinitionSchema } from '@/lib/marketing/segments';

export const dynamic = 'force-dynamic';

const stepSchema = z.object({
  position: z.number().int().min(1).max(50),
  label: z.string().min(1),
  action: z.nativeEnum(JourneyStepAction),
  delayHours: z.number().min(0).max(24 * 365),
  channel: z.nativeEnum(ConsentChannel).optional(),
  templateId: z.string().optional(),
  body: z.string().max(4096).optional(),
});

const createSchema = z.object({
  key: z.string().min(1).regex(/^[a-z][a-z0-9-]*$/, 'Usa minusculas y guiones'),
  name: z.string().min(1),
  description: z.string().optional(),
  trigger: z.nativeEnum(JourneyTrigger),
  segmentId: z.string().optional(),
  exitConditions: segmentDefinitionSchema.optional(),
  steps: z.array(stepSchema).min(1).max(20),
});

export async function GET() {
  const user = await requireCurrentUser();

  const journeys = await prisma.journey.findMany({
    where: { workspaceId: user.workspace.id },
    orderBy: { name: 'asc' },
    include: {
      steps: { orderBy: { position: 'asc' } },
      _count: { select: { enrollments: true } },
    },
  });

  return NextResponse.json({ data: journeys });
}

/**
 * Crea un journey. Siempre nace en DRAFT: publicar es un acto aparte, porque
 * significa empezar a escribirle a gente real.
 */
export async function POST(request: Request) {
  const user = await requireCurrentUser();

  if (!canManageMarketing(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede crear journeys.' },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, createSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  const positions = new Set(input.steps.map((step) => step.position));
  if (positions.size !== input.steps.length) {
    return NextResponse.json({ message: 'Las posiciones de los pasos se repiten.' }, { status: 400 });
  }

  if (input.segmentId) {
    const segment = await prisma.segment.findFirst({
      where: { id: input.segmentId, workspaceId: user.workspace.id },
      select: { id: true },
    });
    if (!segment) {
      return NextResponse.json({ message: 'El segmento no existe en este workspace.' }, { status: 400 });
    }
  }

  // Las plantillas tambien se comprueban contra el workspace: un id de otro
  // tenant no puede colarse por el cuerpo de la peticion.
  const templateIds = input.steps.map((step) => step.templateId).filter(Boolean) as string[];

  if (templateIds.length > 0) {
    const found = await prisma.emailTemplate.count({
      where: { id: { in: templateIds }, workspaceId: user.workspace.id },
    });
    if (found !== new Set(templateIds).size) {
      return NextResponse.json({ message: 'Alguna plantilla no existe en este workspace.' }, { status: 400 });
    }
  }

  const existing = await prisma.journey.findUnique({
    where: { workspaceId_key: { workspaceId: user.workspace.id, key: input.key } },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json({ message: 'Ya existe un journey con esa clave.' }, { status: 409 });
  }

  const journey = await prisma.journey.create({
    data: {
      workspaceId: user.workspace.id,
      key: input.key,
      name: input.name,
      description: input.description,
      trigger: input.trigger,
      segmentId: input.segmentId ?? null,
      exitConditions: input.exitConditions ?? undefined,
      steps: {
        create: input.steps.map((step) => ({
          position: step.position,
          label: step.label,
          action: step.action,
          delayHours: step.delayHours,
          channel: step.channel ?? null,
          templateId: step.templateId ?? null,
          body: step.body ?? null,
        })),
      },
    },
    include: { steps: { orderBy: { position: 'asc' } } },
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'journey.created',
    entity: 'Journey',
    entityId: journey.id,
    metadata: { key: journey.key, steps: journey.steps.length },
  });

  return NextResponse.json({ data: journey }, { status: 201 });
}
