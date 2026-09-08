import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { actionsSchema, conditionGroupSchema } from '@/lib/automation/schema';

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

  const updated = await prisma.automationRule.updateMany({
    where: { id, workspaceId: user.workspace.id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      isActive: parsed.data.isActive,
      conditions: parsed.data.conditions as never,
      actions: parsed.data.actions as never,
      dedupeMinutes: parsed.data.dedupeMinutes,
    },
  });

  if (updated.count === 0) {
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
