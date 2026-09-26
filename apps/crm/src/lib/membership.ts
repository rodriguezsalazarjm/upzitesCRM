import { MembershipStatus, WorkspaceRole } from '../../generated/prisma/enums';
import { prisma } from './prisma';
import { withPlatformScope } from './tenant-guard';

/**
 * Pertenencia de usuarios a workspaces (P0-FOUNDATION). Sin dependencias de
 * Next: lo usan tambien los workers y los motores de automatizacion.
 *
 * Reemplaza los `user.findFirst({ id, workspaceId })` del modelo de
 * un-solo-workspace: una persona puede operar varios negocios y su
 * `users.workspace_id` ("workspace de origen") ya no dice a cuales pertenece.
 */

export async function isActiveMember(workspaceId: string, userId: string) {
  if (!workspaceId || !userId) return false;
  const membership = await prisma.workspaceMembership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: { status: true },
  });
  return membership?.status === MembershipStatus.ACTIVE;
}

export class NotAMemberError extends Error {
  constructor() {
    super('El usuario no pertenece al workspace.');
  }
}

/** Lanza si el usuario no es miembro ACTIVE del workspace. */
export async function assertMember(workspaceId: string, userId: string) {
  if (!(await isActiveMember(workspaceId, userId))) throw new NotAMemberError();
}

/** Miembro ACTIVE con sus datos visibles, o null. */
export async function findActiveMember(workspaceId: string, userId: string) {
  if (!workspaceId || !userId) return null;
  const membership = await prisma.workspaceMembership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: { status: true, role: true, user: { select: { id: true, name: true } } },
  });
  if (membership?.status !== MembershipStatus.ACTIVE) return null;
  return { id: membership.user.id, name: membership.user.name, role: membership.role };
}

/** Ids de miembros ACTIVE con alguno de los roles dados. */
export async function activeMemberIdsWithRole(workspaceId: string, roles: WorkspaceRole[]) {
  const memberships = await prisma.workspaceMembership.findMany({
    where: { workspaceId, status: MembershipStatus.ACTIVE, role: { in: roles } },
    select: { userId: true },
  });
  return memberships.map((m) => m.userId);
}

/**
 * Usuarios que cuentan para `users.max`: memberships ACTIVE del workspace. Una
 * persona en tres workspaces cuenta como 1 en cada uno.
 */
export function countActiveMembers(workspaceId: string, db: Pick<typeof prisma, 'workspaceMembership'> = prisma) {
  return db.workspaceMembership.count({ where: { workspaceId, status: MembershipStatus.ACTIVE } });
}

/** Workspaces a los que el usuario puede cambiar (para el selector). */
export async function listMyWorkspaces(userId: string) {
  const memberships = await withPlatformScope(() =>
    prisma.workspaceMembership.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
      select: { role: true, workspace: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  );
  return memberships.map((m) => ({ ...m.workspace, role: m.role }));
}
