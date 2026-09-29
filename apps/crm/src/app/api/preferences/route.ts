import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { getPreference, updatePreference } from '@/lib/preferences';

export const dynamic = 'force-dynamic';

/**
 * Preferencias de la persona en el workspace ACTIVO (P0-E). No hay forma de
 * nombrar a otro usuario ni a otro workspace: salen de la sesion verificada.
 */
export async function GET() {
  const user = await requireCurrentUser();
  return NextResponse.json({ data: await getPreference({ userId: user.id, workspaceId: user.workspace.id }) });
}

const patchSchema = z
  .object({
    sidebarWidth: z.number().int().min(0).max(2000).nullable().optional(),
    sidebarCollapsed: z.boolean().optional(),
    navOrder: z.array(z.string().max(40)).max(40).optional(),
    hiddenNavItems: z.array(z.string().max(40)).max(40).optional(),
    checklistHidden: z.boolean().optional(),
  })
  .strict();

export async function PATCH(request: Request) {
  const user = await requireCurrentUser();
  const parsed = await parseBody(request, patchSchema);
  if (!parsed.ok) return parsed.response;
  const data = await updatePreference({ userId: user.id, workspaceId: user.workspace.id }, parsed.data);
  return NextResponse.json({ data });
}
