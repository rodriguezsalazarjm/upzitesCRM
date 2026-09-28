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
import { assertRequirements } from '@/lib/entitlements';
import { gate } from '@/lib/entitlements/http';
import { withEntitlementLock } from '@/lib/entitlements/lock';
import { ruleActionsOf, ruleRequirements } from '@/lib/entitlements/requirements';

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

  // P0-C: una regla nace activa, asi que se valida como una publicacion. Sus
  // acciones tienen que estar en el plan (FREE: solo internas) y, si es a
  // medida, ocupa un lugar de `automations.active.max`. Las reglas del
  // catalogo de presets son internas y no ocupan cupo.
  const presetKey = 'presetKey' in input ? input.presetKey : null;
  // Chequeo y alta bajo el lock del limite: dos altas simultaneas no pueden
  // ocupar el mismo ultimo lugar.
  let rule!: Awaited<ReturnType<typeof prisma.automationRule.create>>;
  const blocked = await gate(() =>
    withEntitlementLock(user.workspace.id, 'automations.active.max', async (tx, guard) => {
      await assertRequirements(user.workspace.id, ruleRequirements(ruleActionsOf({ actions: data.actions })), 'activar esta automatización', tx);
      if (!presetKey) await guard.assertCanGrow();
      rule = await tx.automationRule.create({
        data: {
          workspaceId: user.workspace.id,
          presetKey,
          name: data.name,
          description: data.description,
          trigger: data.trigger,
          conditions: data.conditions as never,
          actions: data.actions as never,
          dedupeMinutes: data.dedupeMinutes,
        },
      });
    }),
  );
  if (blocked) return blocked;

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
