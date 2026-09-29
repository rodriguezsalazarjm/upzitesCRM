import { cookies } from 'next/headers';
import { DEV_DEMO_USER, isDatabaseUnavailable, isDevDemoEnabled } from './dev-demo';
import { prisma } from './prisma';
import {
  createSessionToken,
  readSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  sessionVersionMatches,
  type Session,
  type SessionInput,
} from './session-token';

/**
 * Cookie de sesion del request actual, VERIFICADA contra la base: el usuario
 * existe y su `sessionVersion` es la de la cookie. Si no, `null` (anonimo).
 */
export async function readSessionCookie(): Promise<Session | null> {
  return verifySession(await readUnverifiedSessionCookie());
}

/**
 * Solo firma y vencimiento, sin base. La usa `workspace-context`, que verifica
 * la version con la misma consulta con la que carga al usuario.
 */
export async function readUnverifiedSessionCookie(): Promise<Session | null> {
  const cookieStore = await cookies();
  return readSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

/** `null` si el usuario no existe o su version de credenciales cambio. */
export async function verifySession(session: Session | null): Promise<Session | null> {
  if (!session) return null;
  if (isDevDemoEnabled() && session.userId === DEV_DEMO_USER.id) return session;
  try {
    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { sessionVersion: true } });
    return user && sessionVersionMatches(session, user) ? session : null;
  } catch (error) {
    if (isDevDemoEnabled() && isDatabaseUnavailable(error)) return null;
    throw error;
  }
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_TTL_SECONDS,
};

/** Emite siempre una cookie v2. Solo funciona donde Next permite escribir cookies. */
export async function setSessionCookie(input: SessionInput) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, createSessionToken(input), SESSION_COOKIE_OPTIONS);
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
