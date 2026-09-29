import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody } from '@/lib/http';
import { resendInvitation, revokeInvitation, sendInvitationEmail } from '@/lib/invitations';
import { platformGuard } from '@/lib/platform/access';
import { handlePlatform } from '@/lib/platform/http';

export const dynamic = 'force-dynamic';

const schema = z.object({
  action: z.enum(['revoke', 'resend']),
  workspaceId: z.string().min(1),
  sendEmail: z.boolean().default(true),
});

/** Revocar o reenviar (regenera el token: el enlace anterior deja de servir). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await platformGuard();
  if (!guard.ok) return guard.response;
  const { id: invitationId } = await params;
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;
  return handlePlatform(async () => {
    const actor = { actorId: guard.actor.id, via: 'platform' as const };
    if (input.action === 'revoke') {
      await revokeInvitation({ workspaceId: input.workspaceId, invitationId, ...actor });
      return NextResponse.json({ data: { revoked: true } });
    }
    const resent = await resendInvitation({ workspaceId: input.workspaceId, invitationId, ...actor });
    const email = input.sendEmail
      ? await sendInvitationEmail({ invitationId, workspaceId: input.workspaceId, token: resent.token })
      : null;
    return NextResponse.json({ data: { invitationUrl: resent.url, emailSent: email?.sent ?? false } });
  });
}
