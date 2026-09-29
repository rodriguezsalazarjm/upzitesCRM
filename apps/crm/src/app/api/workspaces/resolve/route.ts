import { NextResponse } from 'next/server';
import { clearSessionCookie, readSessionCookie, setSessionCookie } from '@/lib/session';
import { pickWorkspaceForUser } from '@/lib/workspace-switch';

/**
 * Resolvedor de workspace. Se llega aqui cuando la sesion es valida pero el
 * workspace activo ya no lo es (membership suspendida o revocada, soporte
 * vencido). Un Server Component no puede reescribir la cookie; este handler
 * si: elige un workspace permitido y vuelve al dashboard.
 */
export async function GET(request: Request) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.redirect(new URL('/login', request.url), 303);

  const activeWorkspaceId = await pickWorkspaceForUser(session.userId);
  if (!activeWorkspaceId) {
    await clearSessionCookie();
    return NextResponse.redirect(new URL('/login?error=sin-workspace', request.url), 303);
  }

  // Si el workspace elegido es el mismo que ya falla, no hay a donde ir: se
  // corta el bucle cerrando la sesion.
  if (activeWorkspaceId === session.activeWorkspaceId && !session.supportSessionId) {
    await clearSessionCookie();
    return NextResponse.redirect(new URL('/login?error=sin-workspace', request.url), 303);
  }

  await setSessionCookie({ userId: session.userId, activeWorkspaceId, sessionVersion: session.sessionVersion });
  return NextResponse.redirect(new URL('/dashboard', request.url), 303);
}
