import { NextResponse } from 'next/server';
import { z } from 'zod';
import { WorkspaceRole } from '../../../../../generated/prisma/enums';
import { parseBody } from '@/lib/http';
import { createInvitation, sendInvitationEmail } from '@/lib/invitations';
import { platformGuard } from '@/lib/platform/access';
import { handlePlatform } from '@/lib/platform/http';

export const dynamic = 'force-dynamic';

const schema = z.object({
  workspaceId: z.string().min(1),
  email: z.string().trim().email(),
  role: z.nativeEnum(WorkspaceRole).default(WorkspaceRole.MEMBER),
  sendEmail: z.boolean().default(true),
});

/** Invita a un miembro. El enlace vuelve UNA vez en la respuesta. */
export async function POST(request: Request) {
  const guard = await platformGuard();
  if (!guard.ok) return guard.response;
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;
  return handlePlatform(async () => {
    const created = await createInvitation({
      workspaceId: input.workspaceId,
      email: input.email,
      role: input.role,
      actorId: guard.actor.id,
      via: 'platform',
    });
    const email = input.sendEmail
      ? await sendInvitationEmail({ invitationId: created.invitation.id, workspaceId: input.workspaceId, token: created.token })
      : null;
    return NextResponse.json(
      { data: { invitationId: created.invitation.id, invitationUrl: created.url, emailSent: email?.sent ?? false } },
      { status: 201 },
    );
  });
}
