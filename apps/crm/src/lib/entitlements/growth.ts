import { MembershipStatus, type WorkspaceRole } from '../../../generated/prisma/enums';
import { withEntitlementLock } from './lock';

/**
 * Alta de un miembro dentro del limite `users.max`, serializada (P0-C). Es la
 * unica puerta para sumar usuarios a un workspace existente; las invitaciones
 * de P0-D la usaran. Reactivar a alguien que ya es miembro ACTIVE no suma.
 */
export async function addMembershipWithinPlan(input: {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  invitedById?: string | null;
}) {
  return withEntitlementLock(input.workspaceId, 'users.max', async (tx, guard) => {
    const existing = await tx.workspaceMembership.findUnique({
      where: { userId_workspaceId: { userId: input.userId, workspaceId: input.workspaceId } },
      select: { id: true, status: true },
    });
    if (existing?.status === MembershipStatus.ACTIVE) return existing;
    await guard.assertCanGrow();
    return tx.workspaceMembership.upsert({
      where: { userId_workspaceId: { userId: input.userId, workspaceId: input.workspaceId } },
      create: {
        userId: input.userId,
        workspaceId: input.workspaceId,
        role: input.role,
        invitedById: input.invitedById ?? null,
      },
      update: { status: MembershipStatus.ACTIVE, role: input.role, planLimitedAt: null, planLimitedReason: null },
      select: { id: true, status: true },
    });
  });
}
