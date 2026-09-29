import { PlatformRole } from '../../../generated/prisma/enums';
import { crossTenantPrisma } from '../prisma';
import { normalizeEmail } from '../identity';
import { assertSuperAdmin, type PlatformActor } from './access';

/**
 * Roles de PLATAFORMA (P0-D). Solo un SUPER_ADMIN los cambia; el CLI
 * (`scripts/platform-admin.ts`) queda como via de bootstrap y recuperacion.
 *
 * Nunca queda la plataforma sin SUPER_ADMIN: bajar al ultimo se rechaza. La
 * comprobacion y el cambio corren bajo un advisory lock de transaccion, asi
 * que dos degradaciones simultaneas de los dos ultimos no pueden pasar ambas.
 */

export class PlatformRoleError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'LAST_SUPER_ADMIN' | 'REASON_REQUIRED',
    message: string,
  ) {
    super(message);
    this.name = 'PlatformRoleError';
  }
}

export async function searchUsers(query: string) {
  const q = query.trim();
  if (q.length < 2) return [];
  return crossTenantPrisma.user.findMany({
    where: { OR: [{ email: { contains: q.toLowerCase() } }, { name: { contains: q, mode: 'insensitive' } }] },
    select: { id: true, name: true, email: true, platformRole: true },
    orderBy: { email: 'asc' },
    take: 20,
  });
}

export function listOperators() {
  return crossTenantPrisma.user.findMany({
    where: { platformRole: { in: [PlatformRole.PLATFORM_ADMIN, PlatformRole.SUPER_ADMIN] } },
    select: { id: true, name: true, email: true, platformRole: true, updatedAt: true },
    orderBy: { email: 'asc' },
  });
}

export async function setPlatformRole(input: {
  actor: PlatformActor;
  /** userId o email. */
  target: { userId?: string; email?: string };
  role: PlatformRole;
  reason: string;
}) {
  assertSuperAdmin(input.actor, 'gestionar roles de plataforma');
  if (!input.reason.trim()) throw new PlatformRoleError('REASON_REQUIRED', 'Indica el motivo del cambio.');
  return changePlatformRole(
    { target: input.target, role: input.role, actorUserId: input.actor.id, metadata: { via: 'platform', reason: input.reason.trim() } },
    PRODUCTION_SCOPE,
  );
}

/** Bootstrap y recuperacion (`scripts/platform-admin.ts`): misma regla y mismo lock. */
export function setPlatformRoleFromCli(input: { email: string; role: PlatformRole; note?: string | null }) {
  return changePlatformRole(
    { target: { email: input.email }, role: input.role, actorUserId: null, metadata: { via: 'cli', note: input.note ?? null } },
    PRODUCTION_SCOPE,
  );
}

/**
 * Universo sobre el que se cuenta "ultimo SUPER_ADMIN". En produccion es TODA
 * la plataforma (`null`). Solo los tests lo acotan a los actores que ellos
 * mismos crearon, para probar la regla sin tocar cuentas ajenas a la suite.
 */
type SuperAdminScope = { userIds: string[] } | null;
const PRODUCTION_SCOPE: SuperAdminScope = null;

/**
 * SOLO TESTS: la operacion real (mismo lock, misma transaccion, mismo
 * conteo) con el conteo acotado a `scope.userIds`. Prohibida en produccion y
 * fuera de scripts (ver platform.test.ts).
 */
export function setPlatformRoleInScopeForTests(
  input: Parameters<typeof setPlatformRole>[0],
  scope: { userIds: string[] },
) {
  if (process.env.NODE_ENV === 'production') throw new Error('setPlatformRoleInScopeForTests no se usa en produccion.');
  assertSuperAdmin(input.actor, 'gestionar roles de plataforma');
  return changePlatformRole(
    { target: input.target, role: input.role, actorUserId: input.actor.id, metadata: { via: 'test', reason: input.reason } },
    scope,
  );
}

async function changePlatformRole(
  change: { target: { userId?: string; email?: string }; role: PlatformRole; actorUserId: string | null; metadata: Record<string, unknown> },
  scope: SuperAdminScope,
) {
  return crossTenantPrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('platform:roles', 0))`;
    const target = await tx.user.findUnique({
      where: change.target.userId ? { id: change.target.userId } : { email: normalizeEmail(change.target.email ?? '') },
      select: { id: true, email: true, platformRole: true },
    });
    if (!target) throw new PlatformRoleError('NOT_FOUND', 'Usuario no encontrado.');
    if (target.platformRole === change.role) return { changed: false, user: target };

    if (target.platformRole === PlatformRole.SUPER_ADMIN && change.role !== PlatformRole.SUPER_ADMIN) {
      const supers = await tx.user.count({
        where: { platformRole: PlatformRole.SUPER_ADMIN, ...(scope ? { id: { in: scope.userIds } } : {}) },
      });
      if (supers <= 1) {
        throw new PlatformRoleError('LAST_SUPER_ADMIN', 'No se puede quitar al ultimo SUPER_ADMIN de la plataforma.');
      }
    }

    const user = await tx.user.update({
      where: { id: target.id },
      data: { platformRole: change.role },
      select: { id: true, email: true, platformRole: true },
    });
    await tx.platformAuditLog.create({
      data: {
        actorUserId: change.actorUserId,
        action: change.role === PlatformRole.USER ? 'platform_role.revoked' : 'platform_role.granted',
        targetUserId: target.id,
        metadata: { ...change.metadata, from: target.platformRole, to: change.role } as never,
      },
    });
    return { changed: true, user };
  });
}
