import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PlatformRole } from '../../../../../generated/prisma/enums';
import { parseBody } from '@/lib/http';
import { enforce } from '@/lib/ops/rate-limit';
import { setSessionCookie } from '@/lib/session';
import { requirePlatformRole } from '@/lib/workspace-context';
import { startSupportSession } from '@/lib/workspace-switch';

const startSchema = z.object({
  workspaceId: z.string().min(1),
  reason: z.string().trim().min(5).max(500),
  minutes: z.number().int().min(5).max(60).optional(),
});

/** Entra como soporte (READ_ONLY, max 60 min) a un workspace del que no se es miembro. */
export async function POST(request: Request) {
  const limited = await enforce('supportSession', request);
  if (limited) return limited;

  const actor = await requirePlatformRole(PlatformRole.PLATFORM_ADMIN);
  const parsed = await parseBody(request, startSchema);
  if (!parsed.ok) return parsed.response;

  const result = await startSupportSession({ actorUserId: actor.id, ...parsed.data });
  if (!result.ok) {
    const status = result.error === 'WORKSPACE_NOT_FOUND' || result.error === 'NOT_OPERATOR' ? 404 : 400;
    const message =
      result.error === 'IS_MEMBER'
        ? 'Eres miembro de este workspace: cambia a el normalmente.'
        : result.error === 'REASON_REQUIRED'
          ? 'Indica el motivo del acceso.'
          : 'Workspace no encontrado.';
    return NextResponse.json({ code: result.error, message }, { status });
  }

  await setSessionCookie({ ...result.session, sessionVersion: actor.sessionVersion });
  return NextResponse.json(
    { data: { supportSessionId: result.supportSessionId, mode: 'READ_ONLY', expiresAt: result.expiresAt } },
    { status: 201 },
  );
}
