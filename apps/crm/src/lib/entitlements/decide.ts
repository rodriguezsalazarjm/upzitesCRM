import { WorkspaceRole } from '../../../generated/prisma/enums';
import type { LimitKey } from './config';

/**
 * Decisiones puras de la reconciliacion (D4): que se conserva y que queda
 * `planLimitedAt`. Sin base de datos, para probarlas sin conexion.
 */

export const byAge = (a: { createdAt: Date; id: string }, b: { createdAt: Date; id: string }) =>
  a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const ROLE_PRIORITY: Record<WorkspaceRole, number> = {
  [WorkspaceRole.OWNER]: 0,
  [WorkspaceRole.ADMIN]: 1,
  [WorkspaceRole.MEMBER]: 2,
};

/** Decision pura: que ids quedan limitados y por que. */
export type Decision = { allowed: string[]; limited: { id: string; reason: string }[] };

export function decideByLimit<T extends { id: string }>(
  sorted: T[],
  limit: number,
  reason: LimitKey,
  blocked: Map<string, string> = new Map(),
): Decision {
  const allowed: string[] = [];
  const limited: { id: string; reason: string }[] = [];
  for (const item of sorted) {
    const featureReason = blocked.get(item.id);
    if (featureReason) limited.push({ id: item.id, reason: featureReason });
    else if (allowed.length < limit) allowed.push(item.id);
    else limited.push({ id: item.id, reason });
  }
  return { allowed, limited };
}

/** Memberships: OWNER > ADMIN > MEMBER, luego antiguedad. Siempre un OWNER. */
export function decideMemberships(
  members: { id: string; role: WorkspaceRole; createdAt: Date }[],
  limit: number,
): Decision {
  const sorted = [...members].sort((a, b) => ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role] || byAge(a, b));
  const hasOwner = sorted[0]?.role === WorkspaceRole.OWNER;
  return decideByLimit(sorted, Math.max(limit, hasOwner ? 1 : 0), 'users.max');
}

