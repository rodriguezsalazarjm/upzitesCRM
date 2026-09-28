import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { actionsSchema, conditionGroupSchema } from '@/lib/automation/schema';
import { assertRequirements } from '@/lib/entitlements';
import { gate } from '@/lib/entitlements/http';
import { withEntitlementLock } from '@/lib/entitlements/lock';
import { ruleActionsOf, ruleRequirements } from '@/lib/entitlements/requirements';

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  conditions: conditionGroupSchema.optional(),
  actions: actionsSchema.optional(),
  dedupeMinutes: z.number().int().min(0).max(60 * 24 * 30).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  if (!canManageChannels(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede modificar automatizaciones.' },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, updateSchema);
  if (!parsed.ok) return parsed.response;

  // P0-C: lectura, chequeo y escritura bajo el lock de
  // `automations.active.max`: dos activaciones simultaneas no pueden ocupar el
  // mismo ultimo lugar. Activar (o cambiar las acciones de una regla activa) se
  // valida como publicar. Editar las acciones de un preset la vuelve una regla
  // a medida, que si ocupa cupo. Desactivar siempre se permite.
  let found = true;
  const blocked = await gate(() =>
    withEntitlementLock(user.workspace.id, 'automations.active.max', async (tx, guard) => {
      const current = await tx.automationRule.findFirst({
        where: { id, workspaceId: user.workspace.id },
        select: { isActive: true, presetKey: true, actions: true, action: true, planLimitedAt: true },
      });
      if (!current) {
        found = false;
        return;
      }

      const nextActive = parsed.data.isActive ?? current.isActive;
      const nextPresetKey = parsed.data.actions ? null : current.presetKey;
      const newlyCounted = nextActive && !nextPresetKey && (!current.isActive || Boolean(current.presetKey));
      if (nextActive && (!current.isActive || parsed.data.actions)) {
        await assertRequirements(
          user.workspace.id,
          ruleRequirements(ruleActionsOf(parsed.data.actions ? { actions: parsed.data.actions } : current)),
          'activar esta automatización',
          tx,
        );
        if (newlyCounted) await guard.assertCanGrow();
      }

      await tx.automationRule.updateMany({
        where: { id, workspaceId: user.workspace.id },
        data: {
          name: parsed.data.name,
          description: parsed.data.description,
          isActive: parsed.data.isActive,
          conditions: parsed.data.conditions as never,
          actions: parsed.data.actions as never,
          dedupeMinutes: parsed.data.dedupeMinutes,
          presetKey: nextPresetKey,
          // Activada tras pasar el gate, o desactivada: no queda marca de plan.
          ...(parsed.data.isActive !== undefined && (!current.isActive || !nextActive)
            ? { planLimitedAt: null, planLimitedReason: null }
            : {}),
        },
      });
    }),
  );
  if (blocked) return blocked;
  if (!found) {
    return NextResponse.json({ message: 'Regla no encontrada' }, { status: 404 });
  }

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'automation.rule_updated',
    entity: 'AutomationRule',
    entityId: id,
    metadata: { isActive: parsed.data.isActive ?? null },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  if (!canManageChannels(user.role)) {
    return NextResponse.json({ message: 'Solo el owner o un admin puede eliminar automatizaciones.' }, { status: 403 });
  }

  const deleted = await prisma.automationRule.deleteMany({
    where: { id, workspaceId: user.workspace.id },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ message: 'Regla no encontrada' }, { status: 404 });
  }

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'automation.rule_deleted',
    entity: 'AutomationRule',
    entityId: id,
  });

  return NextResponse.json({ ok: true });
}
