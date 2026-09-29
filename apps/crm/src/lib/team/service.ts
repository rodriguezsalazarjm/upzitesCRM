import { InvitationOrigin, MembershipStatus, WorkspaceRole } from '../../../generated/prisma/enums';
import type { Prisma } from '../../../generated/prisma/client';
import { recordAudit } from '../domain/audit';
import { withEntitlementLock } from '../entitlements/lock';
import { reconcileWorkspaceEntitlements } from '../entitlements/reconcile';
import { createInvitation, InvitationError, resendInvitation, revokeInvitation, sendInvitationEmail } from '../invitations';
import type { PlatformEmailSender } from '../platform/transactional-email';
import { prisma } from '../prisma';
import { canChangeRole, canInviteRole, canManageInvitation, canManageMember, teamCapabilities, type Actor } from './permissions';
import { assertSeatAvailable, getWorkspaceSeatUsage, reservingInvitationWhere } from './seats';

/**
 * Gestion de equipo del workspace (P0-F). TODO se decide aqui, en el
 * servidor: la API solo traduce errores. El workspace y el actor salen del
 * contexto verificado; el unico id que llega del cliente es el del objetivo
 * (usuario o invitacion), y se valida que pertenezca a ESTE workspace.
 */

export type TeamActor = Actor & { workspaceId: string };

export type TeamErrorCode = 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_INPUT' | 'LAST_OWNER' | 'INVALID_STATE';

export class TeamError extends Error {
  constructor(
    readonly code: TeamErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TeamError';
  }
}

const forbidden = (message = 'No tienes permiso para esta accion.') => new TeamError('FORBIDDEN', message);

// --- Vista ----------------------------------------------------------------------

export async function getTeamView(actor: TeamActor, now = new Date()) {
  const [seats, memberships, invitations] = await Promise.all([
    getWorkspaceSeatUsage(actor.workspaceId, undefined, now),
    prisma.workspaceMembership.findMany({
      where: { workspaceId: actor.workspaceId },
      select: { role: true, status: true, planLimitedAt: true, planLimitedReason: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
      orderBy: [{ createdAt: 'asc' }],
    }),
    prisma.workspaceInvitation.findMany({
      where: { workspaceId: actor.workspaceId, acceptedAt: null, revokedAt: null },
      select: { id: true, email: true, role: true, origin: true, expiresAt: true, lastSentAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const blocked = new Set(seats.blockedInvitationIds);
  const activeOwners = memberships.filter((m) => m.role === WorkspaceRole.OWNER && m.status === MembershipStatus.ACTIVE).length;
  const member = (m: (typeof memberships)[number]) => ({
    userId: m.user.id,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    status: m.status,
    // Independiente de `status`: fuera del cupo por el plan (P0-C).
    planLimited: m.planLimitedAt !== null,
    isSelf: m.user.id === actor.userId,
    canManage: canManageMember(actor, { userId: m.user.id, role: m.role }),
    // La UI no ofrece degradarlo ni suspenderlo; el servidor lo impide igual (LAST_OWNER).
    isLastOwner: m.role === WorkspaceRole.OWNER && m.status === MembershipStatus.ACTIVE && activeOwners === 1,
  });
  const pending = invitations.map((i) => {
    const expired = i.expiresAt <= now;
    return {
      id: i.id,
      email: i.email,
      role: i.role,
      origin: i.origin,
      expiresAt: i.expiresAt,
      lastSentAt: i.lastSentAt,
      expired,
      // Pendiente y vigente pero sin asiento (downgrade): requiere cupo.
      seatBlocked: !expired && blocked.has(i.id),
      canManage: canManageInvitation(actor, i),
    };
  });
  return {
    seats: { active: seats.active, reserved: seats.reserved, limit: seats.limit, remaining: seats.remaining, requiredPlan: seats.requiredPlan },
    active: memberships.filter((m) => m.status === MembershipStatus.ACTIVE).map(member),
    suspended: memberships.filter((m) => m.status === MembershipStatus.SUSPENDED).map(member),
    invitations: pending,
    capabilities: teamCapabilities(actor),
  };
}

// --- Invitaciones -----------------------------------------------------------------

export async function inviteTeamMember(actor: TeamActor, input: { email: string; role: WorkspaceRole }, options: { sender?: PlatformEmailSender; sendEmail?: boolean } = {}) {
  if (input.role === WorkspaceRole.OWNER) {
    throw new TeamError('INVALID_INPUT', 'No se invita directamente a un owner: invita como admin y luego promuévelo.');
  }
  if (!canInviteRole(actor, input.role)) throw forbidden(actor.role === WorkspaceRole.ADMIN ? 'Un admin solo puede invitar miembros.' : undefined);
  const created = await createInvitation({
    workspaceId: actor.workspaceId,
    email: input.email,
    role: input.role,
    origin: InvitationOrigin.WORKSPACE,
    actorId: actor.userId,
    via: 'workspace',
  });
  const email = options.sendEmail === false ? null : await sendInvitationEmail({ invitationId: created.invitation.id, workspaceId: actor.workspaceId, token: created.token }, options.sender);
  return { invitation: created.invitation, url: created.url, emailSent: email?.sent ?? false };
}

async function manageableInvitation(actor: TeamActor, invitationId: string) {
  const invitation = await prisma.workspaceInvitation.findFirst({ where: { id: invitationId, workspaceId: actor.workspaceId } });
  if (!invitation) throw new TeamError('NOT_FOUND', 'Invitacion no encontrada.');
  if (!canManageInvitation(actor, invitation)) throw forbidden();
  return invitation;
}

export async function revokeTeamInvitation(actor: TeamActor, invitationId: string) {
  await manageableInvitation(actor, invitationId);
  await revokeInvitation({ workspaceId: actor.workspaceId, invitationId, actorId: actor.userId, via: 'workspace' });
}

export async function resendTeamInvitation(actor: TeamActor, invitationId: string, options: { sender?: PlatformEmailSender } = {}) {
  await manageableInvitation(actor, invitationId);
  const resent = await resendInvitation({ workspaceId: actor.workspaceId, invitationId, actorId: actor.userId, via: 'workspace' });
  const email = await sendInvitationEmail({ invitationId, workspaceId: actor.workspaceId, token: resent.token }, options.sender);
  return { url: resent.url, emailSent: email.sent };
}

// --- Miembros ---------------------------------------------------------------------

/**
 * Serializa todo lo que puede cambiar el numero de OWNER activos del
 * workspace. Con este lock, dos degradaciones simultaneas de los dos ultimos
 * OWNER no pueden pasar ambas.
 */
async function lockOwners(tx: Prisma.TransactionClient, workspaceId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`workspace-owners:${workspaceId}`}, 0))`;
}

async function assertAnotherActiveOwner(tx: Prisma.TransactionClient, workspaceId: string, exceptUserId: string) {
  const others = await tx.workspaceMembership.count({
    where: { workspaceId, role: WorkspaceRole.OWNER, status: MembershipStatus.ACTIVE, userId: { not: exceptUserId } },
  });
  if (others === 0) throw new TeamError('LAST_OWNER', 'El negocio no puede quedarse sin owner: promueve primero a otra persona.');
}

async function loadTarget(tx: Prisma.TransactionClient, workspaceId: string, userId: string) {
  const target = await tx.workspaceMembership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: { id: true, userId: true, role: true, status: true },
  });
  if (!target) throw new TeamError('NOT_FOUND', 'Esa persona no es parte de este negocio.');
  return target;
}

/**
 * Operacion CENTRAL de cambio de rol. Solo OWNER. Degradar a un OWNER exige
 * que quede otro OWNER ACTIVE, bajo lock transaccional.
 */
export async function changeWorkspaceRole(actor: TeamActor, input: { targetUserId: string; role: WorkspaceRole }) {
  return prisma.$transaction(async (tx) => {
    await lockOwners(tx, actor.workspaceId);
    const target = await loadTarget(tx, actor.workspaceId, input.targetUserId);
    if (!canChangeRole(actor)) throw forbidden('Solo un owner puede cambiar roles.');
    if (target.status !== MembershipStatus.ACTIVE) throw new TeamError('INVALID_STATE', 'Reactiva a esta persona antes de cambiar su rol.');
    if (target.role === input.role) return { changed: false, role: target.role };
    if (target.role === WorkspaceRole.OWNER) await assertAnotherActiveOwner(tx, actor.workspaceId, target.userId);

    await tx.workspaceMembership.update({ where: { id: target.id }, data: { role: input.role } });
    await recordAudit(
      {
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        action: 'workspace.member.role_changed',
        entity: 'WorkspaceMembership',
        entityId: target.id,
        metadata: { targetUserId: target.userId, from: target.role, to: input.role, actor: actor.userId },
      },
      tx,
    );
    return { changed: true, role: input.role };
  });
}

/**
 * Suspender: la persona pierde acceso a ESTE workspace (el contexto verifica
 * la membership en cada request), libera su asiento y conserva sus otros
 * workspaces. No se borra el User ni la membership; lo asignado conserva su
 * userId. `planLimitedAt` no se toca: es otro concepto.
 */
export async function suspendMember(actor: TeamActor, targetUserId: string) {
  const result = await prisma.$transaction(async (tx) => {
    await lockOwners(tx, actor.workspaceId);
    const target = await loadTarget(tx, actor.workspaceId, targetUserId);
    if (!canManageMember(actor, target)) throw forbidden();
    if (target.status === MembershipStatus.SUSPENDED) return { changed: false };
    if (target.role === WorkspaceRole.OWNER) await assertAnotherActiveOwner(tx, actor.workspaceId, target.userId);

    await tx.workspaceMembership.update({ where: { id: target.id }, data: { status: MembershipStatus.SUSPENDED } });
    // Si su ultimo workspace usado era este, el proximo login elige otro.
    await tx.user.updateMany({ where: { id: target.userId, lastActiveWorkspaceId: actor.workspaceId }, data: { lastActiveWorkspaceId: null } });
    await recordAudit(
      {
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        action: 'workspace.member.suspended',
        entity: 'WorkspaceMembership',
        entityId: target.id,
        metadata: { targetUserId: target.userId, role: target.role, actor: actor.userId },
      },
      tx,
    );
    return { changed: true };
  });
  // Un asiento liberado puede devolver al cupo a alguien limitado por plan.
  if (result.changed) await reconcileWorkspaceEntitlements(actor.workspaceId);
  return result;
}

/** Reactivar vuelve a ocupar un asiento: se comprueba bajo el lock de users.max. */
export async function reactivateMember(actor: TeamActor, targetUserId: string) {
  return withEntitlementLock(actor.workspaceId, 'users.max', async (tx) => {
    const target = await loadTarget(tx, actor.workspaceId, targetUserId);
    if (!canManageMember(actor, target)) throw forbidden();
    if (target.status === MembershipStatus.ACTIVE) return { changed: false };
    await assertSeatAvailable(actor.workspaceId, tx);
    await tx.workspaceMembership.update({ where: { id: target.id }, data: { status: MembershipStatus.ACTIVE } });
    await recordAudit(
      {
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        action: 'workspace.member.reactivated',
        entity: 'WorkspaceMembership',
        entityId: target.id,
        metadata: { targetUserId: target.userId, role: target.role, actor: actor.userId },
      },
      tx,
    );
    return { changed: true };
  });
}

/** Para la tarea del checklist: invitacion vigente (reserva asiento). */
export function reservingInvitationsCount(workspaceId: string, now = new Date()) {
  return prisma.workspaceInvitation.count({ where: reservingInvitationWhere(workspaceId, now) });
}

export { InvitationError };
