import { NextResponse } from 'next/server';
import { z } from 'zod';
import { WorkspaceRole } from '../../../../../generated/prisma/enums';
import { requireCurrentUser } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { handleTeam } from '@/lib/team/http';
import { inviteTeamMember } from '@/lib/team/service';

export const dynamic = 'force-dynamic';

// Estricto: ni workspaceId ni actor en el cuerpo. OWNER no es invitable.
const schema = z
  .object({
    email: z.string().trim().email().max(200),
    role: z.enum([WorkspaceRole.MEMBER, WorkspaceRole.ADMIN]).default(WorkspaceRole.MEMBER),
  })
  .strict();

/** Invitar desde Equipo. OWNER: MEMBER/ADMIN. ADMIN: MEMBER. Reserva un asiento. */
export async function POST(request: Request) {
  const user = await requireCurrentUser();
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  return handleTeam(async () => {
    const result = await inviteTeamMember({ userId: user.id, role: user.role, workspaceId: user.workspace.id }, parsed.data);
    return NextResponse.json(
      {
        data: {
          invitationId: result.invitation.id,
          emailSent: result.emailSent,
          // El enlace se entrega UNA vez: sin proveedor de email, para copiar.
          url: result.url,
        },
      },
      { status: 201 },
    );
  });
}
