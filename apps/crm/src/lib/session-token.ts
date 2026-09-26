import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token de sesion firmado (HMAC). Modulo puro: sin `next/headers` ni base de
 * datos, para poder usarlo desde el proxy, los route handlers y los tests.
 *
 * La cookie solo dice QUIEN es y QUE workspace eligio. Nunca autoriza por si
 * sola: el contexto de servidor re-verifica membership (o SupportSession) en
 * cada request, asi que revocar un acceso es inmediato aunque la cookie viva.
 */

export const SESSION_COOKIE = 'upzites_crm_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const MIN_SECRET_LENGTH = 16;

/** Formato actual (P0-FOUNDATION). */
export type SessionPayloadV2 = {
  v: 2;
  userId: string;
  /** null = usuario sin workspace activo (p. ej. sin memberships). */
  activeWorkspaceId: string | null;
  supportSessionId?: string;
  exp: number;
};

/** Formato anterior: un usuario, un workspace. Se sigue aceptando al leer. */
type SessionPayloadV1 = {
  userId: string;
  workspaceId: string;
  role?: string;
  exp: number;
};

/** Sesion normalizada, independiente de la version de la cookie. */
export type Session = {
  version: 1 | 2;
  userId: string;
  activeWorkspaceId: string | null;
  supportSessionId: string | null;
  exp: number;
};

export type SessionInput = {
  userId: string;
  activeWorkspaceId: string | null;
  supportSessionId?: string | null;
};

export function getSessionSecret() {
  const secret = process.env.CRM_SESSION_SECRET;

  if (secret && secret.length >= MIN_SECRET_LENGTH) {
    return secret;
  }

  // En produccion nunca degradamos a un secreto debil: firmar sesiones con la
  // URL de la BD o con un default hardcodeado las hace falsificables.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `CRM_SESSION_SECRET es obligatorio en produccion y debe tener al menos ${MIN_SECRET_LENGTH} caracteres.`,
    );
  }

  return secret ?? 'upzites-crm-dev-secret';
}

function sign(body: string) {
  return createHmac('sha256', getSessionSecret()).update(body).digest('base64url');
}

/** Firma un payload arbitrario. Exportado para que los tests fabriquen cookies v1. */
export function signSessionPayload(payload: object) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function createSessionToken(input: SessionInput, nowSeconds = Math.floor(Date.now() / 1000)) {
  const payload: SessionPayloadV2 = {
    v: 2,
    userId: input.userId,
    activeWorkspaceId: input.activeWorkspaceId,
    ...(input.supportSessionId ? { supportSessionId: input.supportSessionId } : {}),
    exp: nowSeconds + SESSION_TTL_SECONDS,
  };
  return signSessionPayload(payload);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function readSessionToken(
  token: string | undefined | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): Session | null {
  if (!token) return null;

  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(sign(body));
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  const exp = payload.exp;
  if (typeof exp !== 'number' || exp < nowSeconds) return null;
  if (!isNonEmptyString(payload.userId)) return null;

  if (payload.v === 2) {
    const v2 = payload as unknown as SessionPayloadV2;
    return {
      version: 2,
      userId: v2.userId,
      activeWorkspaceId: isNonEmptyString(v2.activeWorkspaceId) ? v2.activeWorkspaceId : null,
      supportSessionId: isNonEmptyString(v2.supportSessionId) ? v2.supportSessionId : null,
      exp,
    };
  }

  // v1: el workspace unico pasa a ser el activo. El backfill garantiza que
  // existe la membership correspondiente, asi que nadie pierde la sesion.
  const v1 = payload as unknown as SessionPayloadV1;
  if (!isNonEmptyString(v1.workspaceId)) return null;
  return { version: 1, userId: v1.userId, activeWorkspaceId: v1.workspaceId, supportSessionId: null, exp };
}
