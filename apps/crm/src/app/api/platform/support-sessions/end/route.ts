import { NextResponse } from 'next/server';
import { clearSessionCookie, readSessionCookie, setSessionCookie } from '@/lib/session';
import { endSupportSession } from '@/lib/workspace-switch';

/** Sale del modo soporte y vuelve al workspace propio del operador. */
export async function POST(request: Request) {
  const session = await readSessionCookie();
  if (!session?.supportSessionId) return NextResponse.redirect(new URL('/dashboard', request.url), 303);

  const { session: next } = await endSupportSession({
    actorUserId: session.userId,
    supportSessionId: session.supportSessionId,
  });
  if (!next.activeWorkspaceId) {
    await clearSessionCookie();
    return NextResponse.redirect(new URL('/login', request.url), 303);
  }
  await setSessionCookie(next);
  return NextResponse.redirect(new URL('/dashboard', request.url), 303);
}
