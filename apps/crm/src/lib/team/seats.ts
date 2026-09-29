import type { PlanCode } from '../../../generated/prisma/enums';
import { EntitlementError, getWorkspaceEntitlements, type Db } from '../entitlements';
import { requiredPlanForLimit } from '../entitlements/resolve';
import { countActiveMembers } from '../membership';
import { prisma } from '../prisma';
import { reservingInvitationWhere, splitInvitationsBySeat, type PendingInvitation } from './seat-rules';

export { reservingInvitationWhere, splitInvitationsBySeat };

/**
 * Contabilidad de asientos del workspace (P0-F). Fuente UNICA para invitar,
 * reactivar y aceptar.
 *
 *   ocupado = memberships ACTIVE (incluidas las limitadas por plan: el uso es
 *             lo que existe; ver countActiveMembers)
 *           + invitaciones que RESERVAN asiento: pendientes (sin aceptar ni
 *             revocar) y NO vencidas.
 *
 * Una invitacion vencida deja de reservar aunque la fila siga ahi (no hace
 * falta barrido: el filtro por `expiresAt` es la regla). Revocar libera en el
 * acto. Reenviar reusa la misma fila: no reserva un segundo asiento.
 *
 * Si un downgrade deja `activos + reservadas > users.max`, las invitaciones
 * que quedan fuera (las mas nuevas) NO se borran: quedan "bloqueadas por plan"
 * (derivado, sin status nuevo) y aceptarlas devuelve PLAN_LIMIT.
 */

export type SeatUsage = {
  active: number;
  reserved: number;
  limit: number;
  remaining: number;
  /** Plan a la venta que suma al menos un asiento, si existe. */
  requiredPlan: PlanCode | null;
};

function pendingReserving(workspaceId: string, db: Db, now: Date): Promise<PendingInvitation[]> {
  return db.workspaceInvitation.findMany({
    where: reservingInvitationWhere(workspaceId, now),
    select: { id: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

export async function getWorkspaceSeatUsage(workspaceId: string, db: Db = prisma, now = new Date()): Promise<SeatUsage & { blockedInvitationIds: string[] }> {
  const [ent, active, pending] = await Promise.all([
    getWorkspaceEntitlements(workspaceId, db, now),
    countActiveMembers(workspaceId, db),
    pendingReserving(workspaceId, db, now),
  ]);
  const limit = ent.state === 'SUSPENDED' ? 0 : ent.limit('users.max');
  const reserved = pending.length;
  return {
    active,
    reserved,
    limit,
    remaining: Math.max(0, limit - active - reserved),
    requiredPlan: requiredPlanForLimit('users.max', Math.max(limit, active + reserved) + 1),
    blockedInvitationIds: splitInvitationsBySeat(pending, active, limit).blocked,
  };
}

function seatError(usage: SeatUsage, message: string) {
  return new EntitlementError('PLAN_LIMIT', message, {
    key: 'users.max',
    limit: usage.limit,
    usage: usage.active + usage.reserved,
    requiredPlan: usage.requiredPlan,
  });
}

/**
 * Chequeo para OCUPAR un asiento nuevo (invitar, reactivar). Llamar dentro de
 * `withEntitlementLock(workspaceId, 'users.max')` con su `tx`.
 * `releasing` = reservas que la misma operacion libera (reinvitar a un email
 * que ya tenia una invitacion pendiente).
 */
export async function assertSeatAvailable(workspaceId: string, db: Db, options: { releasing?: number; now?: Date } = {}) {
  const ent = await getWorkspaceEntitlements(workspaceId, db, options.now);
  if (ent.state === 'SUSPENDED') {
    throw new EntitlementError('WORKSPACE_SUSPENDED', 'El workspace esta suspendido: no se pueden hacer cambios.', { key: 'users.max' });
  }
  const usage = await getWorkspaceSeatUsage(workspaceId, db, options.now);
  if (usage.active + usage.reserved - (options.releasing ?? 0) + 1 > usage.limit) {
    throw seatError(usage, `Has alcanzado el limite de usuarios de tu plan (${usage.limit}).`);
  }
  return usage;
}

/**
 * Al ACEPTAR: la invitacion ya reservaba su asiento, salvo que un downgrade la
 * haya dejado fuera. Defensa final bajo el lock.
 */
export async function assertInvitationHasSeat(workspaceId: string, invitationId: string, db: Db, now = new Date()) {
  const usage = await getWorkspaceSeatUsage(workspaceId, db, now);
  const ent = await getWorkspaceEntitlements(workspaceId, db, now);
  if (ent.state === 'SUSPENDED') {
    throw new EntitlementError('WORKSPACE_SUSPENDED', 'El workspace esta suspendido: no se pueden hacer cambios.', { key: 'users.max' });
  }
  if (usage.blockedInvitationIds.includes(invitationId) || usage.active + 1 > usage.limit) {
    throw seatError(usage, 'Esta invitacion requiere un cupo disponible en el plan del negocio.');
  }
}

