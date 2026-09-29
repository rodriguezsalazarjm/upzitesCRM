import { NextResponse } from 'next/server';
import { z } from 'zod';
import { WorkspaceRole } from '../../../../../../generated/prisma/enums';
import { requireCurrentUser } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { handleTeam } from '@/lib/team/http';
import { changeWorkspaceRole, reactivateMember, suspendMember } from '@/lib/team/service';

export const dynamic = 'force-dynamic';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('change_role'), role: z.nativeEnum(WorkspaceRole) }).strict(),
  z.object({ action: z.literal('suspend') }).strict(),
  z.object({ action: z.literal('reactivate') }).strict(),
]);

/**
 * Acciones sobre un miembro. El `userId` de la URL es el OBJETIVO: se valida
 * que tenga membership en el workspace activo. Permisos en lib/team.
 */
export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const user = await requireCurrentUser();
  const { userId } = await params;
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const actor = { userId: user.id, role: user.role, workspaceId: user.workspace.id };
  return handleTeam(async () => {
    const input = parsed.data;
    const result =
      input.action === 'change_role'
        ? await changeWorkspaceRole(actor, { targetUserId: userId, role: input.role })
        : input.action === 'suspend'
          ? await suspendMember(actor, userId)
          : await reactivateMember(actor, userId);
    return NextResponse.json({ data: result });
  });
}
