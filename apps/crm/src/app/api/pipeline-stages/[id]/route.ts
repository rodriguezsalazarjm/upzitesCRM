import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentWorkspaceId } from '@/lib/crm-data';
import { notFound, orNull, parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { requireCurrentUser } from '@/lib/auth';
import { canManageWorkspaceSettings } from '@/lib/workspace-roles';

const updateStageSchema = z.object({
  name: z.string().min(1).optional(),
  position: z.number().int().min(1).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional(),
});

/** Configurar el pipeline es configuracion del workspace: OWNER/ADMIN (403 para MEMBER). */
async function requireSettingsManager() {
  const user = await requireCurrentUser();
  if (!canManageWorkspaceSettings(user.role)) {
    return NextResponse.json({ message: 'Solo el owner o un admin puede configurar el pipeline.' }, { status: 403 });
  }
  return null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSettingsManager();
  if (denied) return denied;
  const { id } = await params;
  const parsed = await parseBody(request, updateStageSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;
  const workspaceId = await getCurrentWorkspaceId();

  const stage = await orNull(
    prisma.pipelineStage.update({
      where: { id, workspaceId },
      data: input,
    }),
  );

  // D13: un id de otro workspace no encuentra nada y eso es un 404,
  // no un error del servidor.
  if (!stage) return notFound('Etapa');

  return NextResponse.json({ data: stage });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSettingsManager();
  if (denied) return denied;
  const { id } = await params;
  const workspaceId = await getCurrentWorkspaceId();

  const eliminado = await orNull(
    prisma.pipelineStage.delete({
      where: { id, workspaceId },
    }),
  );
  if (!eliminado) return notFound('Etapa');

  return NextResponse.json({ ok: true });
}
