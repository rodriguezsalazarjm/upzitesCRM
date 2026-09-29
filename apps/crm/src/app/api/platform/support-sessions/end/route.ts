import { NextResponse } from 'next/server';
import { readSessionCookie, setSessionCookie } from '@/lib/session';
import { endSupportSession } from '@/lib/workspace-switch';

/** Sale del modo soporte y vuelve al workspace propio del operador. */
export async function POST(request: Request) {
  const session = await readSessionCookie();
  if (!session?.supportSessionId) return NextResponse.redirect(new URL('/dashboard', request.url), 303);

  const { session: next } = await endSupportSession({
    actorUserId: session.userId,
    supportSessionId: session.supportSessionId,
  });
  // Vuelve al workspace previo (el ultimo usado). Un operador sin workspaces
  // propios vuelve a /platform en vez de perder la sesion.
  if (!next.activeWorkspaceId) {
    await setSessionCookie({ userId: session.userId, activeWorkspaceId: null, sessionVersion: session.sessionVersion });
    return NextResponse.redirect(new URL('/platform', request.url), 303);
  }
  await setSessionCookie({ ...next, sessionVersion: session.sessionVersion });
  return NextResponse.redirect(new URL('/dashboard', request.url), 303);
}
