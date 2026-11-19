import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import { canManageMarketing } from '@/lib/marketing/roles';
import { prisma } from '@/lib/prisma';

const schema = z.object({ createsOpportunity: z.boolean() }).strict();

/** P32: opciones del formulario principal (el que recibe las consultas de la web). */
export async function PATCH(request: Request) {
  const user = await requireCurrentUser();
  if (!canManageMarketing(user.role)) {
    return NextResponse.json({ message: 'No tienes permiso para cambiar el formulario.' }, { status: 403 });
  }
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  const workspaceId = user.workspace.id;
  const form = await prisma.form.findFirst({ where: { workspaceId, isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!form) return NextResponse.json({ message: 'No hay un formulario activo.' }, { status: 404 });

  await prisma.form.updateMany({ where: { id: form.id, workspaceId }, data: { createsOpportunity: parsed.data.createsOpportunity } });
  await recordAudit({ workspaceId, actorId: user.id, action: 'form.settings_updated', entity: 'Form', entityId: form.id, metadata: parsed.data });
  return NextResponse.json({ data: parsed.data });
}
