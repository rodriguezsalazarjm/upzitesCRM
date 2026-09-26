import { MembershipStatus, SupportAccessMode } from '../../generated/prisma/enums';
import { prisma } from './prisma';
import { withPlatformScope } from './tenant-guard';
import { chooseLoginWorkspace, isPlatformOperator, supportSessionExpiry } from './workspace-access';

/**
 * Operaciones que CAMBIAN el workspace de la sesion: elegir al iniciar sesion,
 * cambiar de negocio y entrar/salir de soporte. Devuelven el nuevo contenido
 * de la cookie; el route handler es quien la escribe.
 */

export type SessionTarget = { userId: string; activeWorkspaceId: string | null; supportSessionId?: string | null };

/** Workspace de entrada para un usuario (login, resolvedor). */
export async function pickWorkspaceForUser(userId: string) {
  const user = await withPlatformScope(() =>
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        lastActiveWorkspaceId: true,
        memberships: { select: { workspaceId: true, role: true, status: true, createdAt: true } },
      },
    }),
  );
  if (!user) return null;
  return chooseLoginWorkspace(user.memberships, user.lastActiveWorkspaceId);
}

export type SwitchResult =
  | { ok: true; session: SessionTarget; workspace: { id: string; name: string; slug: string } }
  | { ok: false; status: 404 };

/**
 * Cambia al workspace pedido SOLO si hay membership ACTIVE. Un SUPER_ADMIN sin
 * membership recibe el mismo 404 que cualquiera: entrar a un workspace ajeno
 * exige una SupportSession explicita (ver `startSupportSession`).
 */
export async function switchWorkspace(input: {
  userId: string;
  workspaceId: string;
  /** Soporte en curso, si lo hay: cambiar de workspace lo cierra. */
  currentSupportSessionId?: string | null;
}): Promise<SwitchResult> {
  const membership = await prisma.workspaceMembership.findUnique({
    where: { userId_workspaceId: { userId: input.userId, workspaceId: input.workspaceId } },
    select: { status: true, workspace: { select: { id: true, name: true, slug: true } } },
  });
  if (!membership || membership.status !== MembershipStatus.ACTIVE) return { ok: false, status: 404 };

  await prisma.$transaction(async (tx) => {
    if (input.currentSupportSessionId) {
      await closeSupportSession(tx, input.userId, input.currentSupportSessionId, 'switched_to_own_workspace');
    }
    await tx.user.update({ where: { id: input.userId }, data: { lastActiveWorkspaceId: input.workspaceId } });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.userId,
        action: 'workspace.switched_in',
        entity: 'Workspace',
        entityId: input.workspaceId,
      },
    });
  });

  return {
    ok: true,
    session: { userId: input.userId, activeWorkspaceId: input.workspaceId },
    workspace: membership.workspace,
  };
}

// --- Soporte -----------------------------------------------------------------

export type SupportError = 'NOT_OPERATOR' | 'WORKSPACE_NOT_FOUND' | 'IS_MEMBER' | 'REASON_REQUIRED' | 'NOT_IN_SUPPORT';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function closeSupportSession(tx: Tx, userId: string, supportSessionId: string, how: string) {
  const closed = await tx.supportSession.updateMany({
    where: { id: supportSessionId, actorUserId: userId, endedAt: null },
    data: { endedAt: new Date() },
  });
  if (closed.count === 0) return;
  const support = await tx.supportSession.findUniqueOrThrow({ where: { id: supportSessionId } });
  await tx.platformAuditLog.create({
    data: {
      actorUserId: userId,
      action: 'support.ended',
      targetWorkspaceId: support.workspaceId,
      supportSessionId,
      metadata: { how },
    },
  });
}

/**
 * Entrada de un operador a un workspace del que NO es miembro. Siempre nace
 * READ_ONLY y con TTL maximo de 60 minutos. Para sus propios negocios el
 * operador usa su membership (cambio normal), no soporte.
 */
export async function startSupportSession(input: {
  actorUserId: string;
  workspaceId: string;
  reason: string;
  minutes?: number;
  now?: Date;
}): Promise<{ ok: true; session: SessionTarget; supportSessionId: string; expiresAt: Date } | { ok: false; error: SupportError }> {
  const reason = input.reason.trim();
  if (reason.length < 5) return { ok: false, error: 'REASON_REQUIRED' };

  return withPlatformScope(async () => {
    const actor = await prisma.user.findUnique({ where: { id: input.actorUserId }, select: { platformRole: true } });
    if (!actor || !isPlatformOperator(actor.platformRole)) return { ok: false as const, error: 'NOT_OPERATOR' as const };

    const workspace = await prisma.workspace.findUnique({ where: { id: input.workspaceId }, select: { id: true } });
    if (!workspace) return { ok: false as const, error: 'WORKSPACE_NOT_FOUND' as const };

    const membership = await prisma.workspaceMembership.findUnique({
      where: { userId_workspaceId: { userId: input.actorUserId, workspaceId: input.workspaceId } },
      select: { status: true },
    });
    if (membership?.status === MembershipStatus.ACTIVE) return { ok: false as const, error: 'IS_MEMBER' as const };

    const now = input.now ?? new Date();
    const expiresAt = supportSessionExpiry(now, input.minutes);
    const support = await prisma.$transaction(async (tx) => {
      // Una sola sesion de soporte abierta por operador.
      const open = await tx.supportSession.findMany({
        where: { actorUserId: input.actorUserId, endedAt: null },
        select: { id: true },
      });
      for (const session of open) await closeSupportSession(tx, input.actorUserId, session.id, 'replaced');

      const created = await tx.supportSession.create({
        data: {
          actorUserId: input.actorUserId,
          workspaceId: input.workspaceId,
          mode: SupportAccessMode.READ_ONLY,
          reason,
          startedAt: now,
          expiresAt,
        },
      });
      await tx.platformAuditLog.create({
        data: {
          actorUserId: input.actorUserId,
          action: 'support.started',
          targetWorkspaceId: input.workspaceId,
          supportSessionId: created.id,
          metadata: { mode: SupportAccessMode.READ_ONLY, reason, expiresAt: expiresAt.toISOString() },
        },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          actorId: input.actorUserId,
          action: 'support.started',
          entity: 'SupportSession',
          entityId: created.id,
          metadata: { supportSessionId: created.id, mode: SupportAccessMode.READ_ONLY, reason },
        },
      });
      return created;
    });

    return {
      ok: true as const,
      session: { userId: input.actorUserId, activeWorkspaceId: input.workspaceId, supportSessionId: support.id },
      supportSessionId: support.id,
      expiresAt,
    };
  });
}

/** Eleva la sesion de soporte vigente a READ_WRITE. Exige motivo propio. */
export async function elevateSupportSession(input: {
  actorUserId: string;
  supportSessionId: string;
  reason: string;
  now?: Date;
}): Promise<{ ok: true } | { ok: false; error: SupportError }> {
  const reason = input.reason.trim();
  if (reason.length < 5) return { ok: false, error: 'REASON_REQUIRED' };
  const now = input.now ?? new Date();

  return withPlatformScope(async () => {
    const actor = await prisma.user.findUnique({ where: { id: input.actorUserId }, select: { platformRole: true } });
    if (!actor || !isPlatformOperator(actor.platformRole)) return { ok: false as const, error: 'NOT_OPERATOR' as const };

    return prisma.$transaction(async (tx) => {
      const updated = await tx.supportSession.updateMany({
        where: { id: input.supportSessionId, actorUserId: input.actorUserId, endedAt: null, expiresAt: { gt: now } },
        data: { mode: SupportAccessMode.READ_WRITE, elevatedAt: now, elevatedReason: reason },
      });
      if (updated.count === 0) return { ok: false as const, error: 'NOT_IN_SUPPORT' as const };
      const support = await tx.supportSession.findUniqueOrThrow({ where: { id: input.supportSessionId } });
      const metadata = { supportSessionId: support.id, mode: SupportAccessMode.READ_WRITE, reason };
      await tx.platformAuditLog.create({
        data: {
          actorUserId: input.actorUserId,
          action: 'support.elevated',
          targetWorkspaceId: support.workspaceId,
          supportSessionId: support.id,
          metadata,
        },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: support.workspaceId,
          actorId: input.actorUserId,
          action: 'support.elevated',
          entity: 'SupportSession',
          entityId: support.id,
          metadata,
        },
      });
      return { ok: true as const };
    });
  });
}

/** Cierra el soporte y devuelve al operador a su propio workspace (si tiene). */
export async function endSupportSession(input: { actorUserId: string; supportSessionId: string }) {
  await withPlatformScope(() =>
    prisma.$transaction((tx) => closeSupportSession(tx, input.actorUserId, input.supportSessionId, 'manual')),
  );
  const activeWorkspaceId = await pickWorkspaceForUser(input.actorUserId);
  return { session: { userId: input.actorUserId, activeWorkspaceId } satisfies SessionTarget };
}

