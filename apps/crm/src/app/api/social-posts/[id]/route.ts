import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { isEntitlementError } from '@/lib/entitlements';
import { entitlementResponse } from '@/lib/entitlements/http';
import { parseBody } from '@/lib/http';
import { canManageMarketing } from '@/lib/marketing/roles';
import { SocialPostError, deleteSocialPost, saveSocialPost, socialPostAction, socialPostInputSchema } from '@/lib/social/service';

export const dynamic = 'force-dynamic';

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.enum(['retry', 'unschedule', 'duplicate', 'publish_now']) }),
  z.object({ action: z.literal('reschedule'), scheduledAt: z.string().datetime({ offset: true }) }),
]);

async function guarded(run: (workspaceId: string, userId: string) => Promise<unknown>) {
  const user = await requireCurrentUser();
  if (!canManageMarketing(user.role)) return NextResponse.json({ message: 'Solo el owner o un admin puede publicar.' }, { status: 403 });
  try {
    return NextResponse.json({ data: (await run(user.workspace.id, user.id)) ?? null });
  } catch (error) {
    if (isEntitlementError(error)) return entitlementResponse(error);
    if (error instanceof SocialPostError) return NextResponse.json({ message: error.message }, { status: 422 });
    throw error;
  }
}

/** Editar (borrador, programado o fallido). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseBody(request, socialPostInputSchema);
  if (!parsed.ok) return parsed.response;
  return guarded((workspaceId, userId) => saveSocialPost(workspaceId, userId, parsed.data, id));
}

/** Reintentar, cancelar, duplicar, publicar ya o mover de fecha (calendario P20). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseBody(request, actionSchema);
  if (!parsed.ok) return parsed.response;
  return guarded((workspaceId, userId) => socialPostAction(workspaceId, id, parsed.data, userId));
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded((workspaceId) => deleteSocialPost(workspaceId, id));
}
