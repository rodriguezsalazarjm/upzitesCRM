import {
  MembershipStatus,
  PlatformRole,
  SupportAccessMode,
  WorkspaceRole,
} from '../../generated/prisma/enums';

/**
 * Reglas de acceso de P0-FOUNDATION, como funciones puras.
 *
 * Aqui se decide, sin tocar base ni cookies, si un usuario puede operar un
 * workspace y con que rol. `workspace-context.ts` carga los datos y delega en
 * estas funciones; los tests unitarios las ejercitan directamente.
 *
 * Dos ejes que NO se mezclan:
 *  - WorkspaceRole: que puede hacer dentro de UN workspace (via membership).
 *  - PlatformRole: que puede hacer sobre la plataforma (Ops, clientes, soporte).
 * Ser OWNER de un workspace no da nada de plataforma, y ser SUPER_ADMIN no da
 * entrada a un workspace: para eso hace falta membership o SupportSession.
 */

export const SUPPORT_SESSION_MAX_TTL_MS = 60 * 60 * 1000;

const WORKSPACE_ROLE_RANK: Record<WorkspaceRole, number> = {
  [WorkspaceRole.MEMBER]: 1,
  [WorkspaceRole.ADMIN]: 2,
  [WorkspaceRole.OWNER]: 3,
};

const PLATFORM_ROLE_RANK: Record<PlatformRole, number> = {
  [PlatformRole.USER]: 0,
  [PlatformRole.PLATFORM_ADMIN]: 1,
  [PlatformRole.SUPER_ADMIN]: 2,
};

export function hasWorkspaceRole(role: WorkspaceRole, min: WorkspaceRole) {
  return WORKSPACE_ROLE_RANK[role] >= WORKSPACE_ROLE_RANK[min];
}

export function hasPlatformRole(role: PlatformRole, min: PlatformRole) {
  // USER nunca "alcanza" un minimo de plataforma, ni siquiera USER: pedir
  // requirePlatformRole(USER) seria un error de programacion, no un permiso.
  if (min === PlatformRole.USER) return false;
  return PLATFORM_ROLE_RANK[role] >= PLATFORM_ROLE_RANK[min];
}

/** Operador de plataforma: PLATFORM_ADMIN o SUPER_ADMIN. */
export function isPlatformOperator(role: PlatformRole) {
  return hasPlatformRole(role, PlatformRole.PLATFORM_ADMIN);
}

/** Metodos que no mutan. Todo lo demas cuenta como escritura. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isMutationMethod(method: string | null | undefined) {
  return !SAFE_METHODS.has((method ?? '').toUpperCase());
}

export type AccessUser = { id: string; platformRole: PlatformRole };

export type AccessMembership = {
  role: WorkspaceRole;
  status: MembershipStatus;
  /** null si el workspace ya no existe. */
  workspace: { id: string; name: string; slug: string } | null;
};

export type AccessSupportSession = {
  id: string;
  actorUserId: string;
  workspaceId: string;
  mode: SupportAccessMode;
  expiresAt: Date;
  endedAt: Date | null;
  workspace: { id: string; name: string; slug: string } | null;
};

export type AccessDenyReason =
  | 'USER_NOT_FOUND'
  | 'NO_ACTIVE_WORKSPACE'
  | 'NOT_A_MEMBER'
  | 'MEMBERSHIP_SUSPENDED'
  | 'WORKSPACE_GONE'
  | 'SUPPORT_SESSION_INVALID';

export type AccessDecision =
  | {
      ok: true;
      access: 'MEMBER';
      role: WorkspaceRole;
      workspace: { id: string; name: string; slug: string };
    }
  | {
      ok: true;
      access: 'SUPPORT';
      /** Ve lo que ve un ADMIN; las escrituras las filtra canWrite(). */
      role: WorkspaceRole;
      workspace: { id: string; name: string; slug: string };
      supportSession: { id: string; mode: SupportAccessMode; expiresAt: Date };
    }
  | { ok: false; reason: AccessDenyReason };

/**
 * Decide el acceso de un request. `membership` es la del workspace activo;
 * `supportSession` es la que nombra la cookie (si nombra alguna).
 */
export function resolveAccess(input: {
  now: Date;
  activeWorkspaceId: string | null;
  supportSessionId: string | null;
  user: AccessUser | null;
  membership: AccessMembership | null;
  supportSession: AccessSupportSession | null;
}): AccessDecision {
  const { now, user } = input;
  if (!user) return { ok: false, reason: 'USER_NOT_FOUND' };
  if (!input.activeWorkspaceId) return { ok: false, reason: 'NO_ACTIVE_WORKSPACE' };

  // Si la cookie nombra una SupportSession, manda ella: nunca se "cae" a la
  // membership, para que una sesion de soporte invalida no se convierta en
  // acceso por otra via sin que quede claro.
  if (input.supportSessionId) {
    const support = input.supportSession;
    const valid =
      support !== null &&
      support.id === input.supportSessionId &&
      support.actorUserId === user.id &&
      support.workspaceId === input.activeWorkspaceId &&
      support.endedAt === null &&
      support.expiresAt.getTime() > now.getTime() &&
      // Degradar al operador corta el soporte en curso en el siguiente request.
      isPlatformOperator(user.platformRole) &&
      support.workspace !== null;
    if (!valid) return { ok: false, reason: 'SUPPORT_SESSION_INVALID' };
    return {
      ok: true,
      access: 'SUPPORT',
      role: WorkspaceRole.ADMIN,
      workspace: support.workspace!,
      supportSession: { id: support.id, mode: support.mode, expiresAt: support.expiresAt },
    };
  }

  const membership = input.membership;
  if (!membership) return { ok: false, reason: 'NOT_A_MEMBER' };
  if (!membership.workspace) return { ok: false, reason: 'WORKSPACE_GONE' };
  if (membership.status !== MembershipStatus.ACTIVE) return { ok: false, reason: 'MEMBERSHIP_SUSPENDED' };

  return { ok: true, access: 'MEMBER', role: membership.role, workspace: membership.workspace };
}

export type WriteDecision =
  | { ok: true; audit: boolean }
  | { ok: false; code: 'SUPPORT_READ_ONLY' };

/**
 * Puede este acceso ejecutar una mutacion? Un miembro, siempre (los permisos
 * finos por rol siguen en cada endpoint). Soporte READ_ONLY, nunca. Soporte
 * READ_WRITE, si, pero cada escritura se audita.
 *
 * `method` desconocido (null) se trata como escritura: si el proxy no marco el
 * request, se falla cerrado.
 */
export function canWrite(
  decision: Extract<AccessDecision, { ok: true }>,
  method: string | null,
): WriteDecision {
  if (!isMutationMethod(method)) return { ok: true, audit: false };
  if (decision.access === 'MEMBER') return { ok: true, audit: false };
  if (decision.supportSession.mode === SupportAccessMode.READ_WRITE) return { ok: true, audit: true };
  return { ok: false, code: 'SUPPORT_READ_ONLY' };
}

export type LoginMembership = {
  workspaceId: string;
  role: WorkspaceRole;
  status: MembershipStatus;
  createdAt: Date;
};

/**
 * Workspace al que se entra al iniciar sesion:
 *  1. el ultimo usado, si sigue habiendo membership ACTIVE;
 *  2. si no, el OWNER mas antiguo;
 *  3. si no, la membership ACTIVE mas antigua;
 *  4. si no hay ninguna, null.
 */
export function chooseLoginWorkspace(
  memberships: LoginMembership[],
  lastActiveWorkspaceId: string | null,
): string | null {
  const active = memberships
    .filter((m) => m.status === MembershipStatus.ACTIVE)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  if (active.length === 0) return null;
  if (lastActiveWorkspaceId && active.some((m) => m.workspaceId === lastActiveWorkspaceId)) {
    return lastActiveWorkspaceId;
  }
  return (active.find((m) => m.role === WorkspaceRole.OWNER) ?? active[0]).workspaceId;
}

/** Recorta la duracion pedida para una SupportSession al maximo permitido. */
export function supportSessionExpiry(now: Date, requestedMinutes?: number) {
  const requestedMs = Math.max(1, requestedMinutes ?? 60) * 60 * 1000;
  return new Date(now.getTime() + Math.min(requestedMs, SUPPORT_SESSION_MAX_TTL_MS));
}
