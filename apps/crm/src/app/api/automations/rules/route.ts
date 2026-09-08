import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AutomationTrigger } from '../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { actionsSchema, conditionGroupSchema } from '@/lib/automation/schema';
import { presetByKey } from '@/lib/automation/presets';

export const dynamic = 'force-dynamic';

const createSchema = z.union([
  // Activar una regla del catalogo.
  z.object({ presetKey: z.string().min(1) }),
  // O definir una a medida.
  z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    trigger: z.nativeEnum(AutomationTrigger),
    conditions: conditionGroupSchema.optional(),
    actions: actionsSchema,
    dedupeMinutes: z.number().int().min(0).max(60 * 24 * 30).default(0),
  }),
]);

export async function GET() {
  const user = await requireCurrentUser();

  const rules = await prisma.automationRule.findMany({
    where: { workspaceId: user.workspace.id },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ data: rules });
}

export async function POST(request: Request) {
  const user = await requireCurrentUser();

  // Publicar automatizaciones es de owner/admin (spec, seccion 7).
  if (!canManageChannels(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede crear automatizaciones.' },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, createSchema);
  if (!parsed.ok) return parsed.response;

  const input = parsed.data;
  const data =
    'presetKey' in input
      ? (() => {
          const preset = presetByKey(input.presetKey);
          if (!preset) return null;
          return {
            name: preset.name,
            description: preset.description,
            trigger: preset.trigger,
            conditions: preset.conditions,
            actions: preset.actions,
            dedupeMinutes: preset.dedupeMinutes,
          };
        })()
      : {
          name: input.name,
          description: input.description,
          trigger: input.trigger,
          conditions: input.conditions ?? { match: 'ALL', rules: [] },
          actions: input.actions,
          dedupeMinutes: input.dedupeMinutes,
        };

  if (!data) {
    return NextResponse.json({ message: 'La regla predefinida no existe.' }, { status: 404 });
  }

  const rule = await prisma.automationRule.create({
    data: {
      workspaceId: user.workspace.id,
      name: data.name,
      description: data.description,
      trigger: data.trigger,
      conditions: data.conditions as never,
      actions: data.actions as never,
      dedupeMinutes: data.dedupeMinutes,
    },
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'automation.rule_created',
    entity: 'AutomationRule',
    entityId: rule.id,
    metadata: { trigger: rule.trigger, name: rule.name },
  });

  return NextResponse.json({ data: rule }, { status: 201 });
}
