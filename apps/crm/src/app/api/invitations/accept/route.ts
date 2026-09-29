import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody } from '@/lib/http';
import { acceptInvitation } from '@/lib/invitations';
import { enforce } from '@/lib/ops/rate-limit';
import { handlePlatform } from '@/lib/platform/http';
import { readSessionCookie, setSessionCookie } from '@/lib/session';

export const dynamic = 'force-dynamic';

const schema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().max(120).optional(),
  password: z.string().max(200).optional(),
  confirmPassword: z.string().max(200).optional(),
});

/**
 * Acepta una invitacion. Email sin cuenta: crea la cuenta global con nombre y
 * contrasena. Email con cuenta: exige estar autenticado como esa cuenta y solo
 * agrega la membership. En ambos casos deja la sesion en el workspace nuevo.
 */
export async function POST(request: Request) {
  const limited = await enforce('login', request);
  if (limited) return limited;
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;
  const session = await readSessionCookie();

  return handlePlatform(async () => {
    const result = await acceptInvitation({
      token: input.token,
      sessionUserId: session?.userId ?? null,
      newAccount:
        input.password !== undefined
          ? { name: input.name ?? '', password: input.password, confirmPassword: input.confirmPassword ?? '' }
          : null,
    });
    // Cuenta nueva: version 0. Cuenta existente: exige su sesion (ya verificada), se conserva su version.
    await setSessionCookie({
      userId: result.userId,
      activeWorkspaceId: result.workspaceId,
      sessionVersion: result.createdAccount ? 0 : session!.sessionVersion,
    });
    return NextResponse.json({
      data: { workspaceId: result.workspaceId, createdAccount: result.createdAccount, alreadyMember: result.alreadyMember },
    });
  });
}
