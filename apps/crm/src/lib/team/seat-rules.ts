/** Reglas puras de asientos (P0-F). Ver seats.ts. */

export type PendingInvitation = { id: string; createdAt: Date };

/** Donde vive el filtro "reserva asiento". */
export function reservingInvitationWhere(workspaceId: string, now: Date) {
  return { workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } };
}

/**
 * Invitaciones que caben en el limite (las mas antiguas primero). Pura:
 * `blocked` son las que un downgrade dejo sin asiento.
 */
export function splitInvitationsBySeat(invitations: PendingInvitation[], active: number, limit: number) {
  const free = Math.max(0, limit - active);
  const ordered = [...invitations].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  return { fitting: ordered.slice(0, free).map((i) => i.id), blocked: ordered.slice(free).map((i) => i.id) };
}
