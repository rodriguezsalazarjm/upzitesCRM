import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { handleTeam } from '@/lib/team/http';
import { resendTeamInvitation, revokeTeamInvitation } from '@/lib/team/service';

export const dynamic = 'force-dynamic';

const schema = z.object({ action: z.enum(['resend', 'revoke']) }).strict();

/** Reenviar (token nuevo, misma reserva) o revocar (libera el asiento). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const actor = { userId: user.id, role: user.role, workspaceId: user.workspace.id };
  return handleTeam(async () => {
    if (parsed.data.action === 'revoke') {
      await revokeTeamInvitation(actor, id);
      return NextResponse.json({ data: { revoked: true } });
    }
    const result = await resendTeamInvitation(actor, id);
    return NextResponse.json({ data: { emailSent: result.emailSent, url: result.url } });
  });
}
