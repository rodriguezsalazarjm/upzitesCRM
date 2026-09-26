import { cookies } from 'next/headers';
import {
  createSessionToken,
  readSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  type Session,
  type SessionInput,
} from './session-token';

/** Cookie de sesion del request actual (route handler, server component o action). */
export async function readSessionCookie(): Promise<Session | null> {
  const cookieStore = await cookies();
  return readSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
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
