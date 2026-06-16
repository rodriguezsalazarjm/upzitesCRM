import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { UserRole } from '../../generated/prisma/client';
import { DEV_DEMO_USER, isDatabaseUnavailable, isDevDemoEnabled } from './dev-demo';
import { prisma } from './prisma';

const SESSION_COOKIE = 'upzites_crm_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = {
  userId: string;
  workspaceId: string;
  role: UserRole;
  exp: number;
};

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
};

function getSessionSecret() {
  return process.env.CRM_SESSION_SECRET ?? process.env.DATABASE_URL ?? 'upzites-crm-dev-secret';
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(payload: string) {
  return createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

export function createSessionToken(payload: Omit<SessionPayload, 'exp'>) {
  const body = base64UrlEncode(
    JSON.stringify({
      ...payload,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    }),
  );
  return `${body}.${sign(body)}`;
}

function readSessionToken(token?: string): SessionPayload | null {
  if (!token) return null;

  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const expected = sign(body);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  const payload = JSON.parse(base64UrlDecode(body)) as SessionPayload;
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload;
}

export async function setSessionCookie(payload: Omit<SessionPayload, 'exp'>) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, createSessionToken(payload), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const session = readSessionToken(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session) return null;

  if (isDevDemoEnabled() && session.userId === DEV_DEMO_USER.id) {
    return DEV_DEMO_USER;
  }

  let user;
  try {
    user = await prisma.user.findFirst({
      where: {
        id: session.userId,
        workspaceId: session.workspaceId,
      },
      include: {
        workspace: true,
      },
    });
  } catch (error) {
    if (isDevDemoEnabled() && isDatabaseUnavailable(error)) {
      return DEV_DEMO_USER;
    }
    throw error;
  }

  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    workspace: {
      id: user.workspace.id,
      name: user.workspace.name,
      slug: user.workspace.slug,
    },
  };
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return user;
}

export function generateResetToken() {
  return randomBytes(32).toString('base64url');
}

export function hashResetToken(token: string) {
  return createHmac('sha256', getSessionSecret()).update(token).digest('hex');
}
