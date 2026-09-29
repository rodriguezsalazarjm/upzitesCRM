import { InvitationOrigin, WorkspaceRole } from '../../../generated/prisma/enums';

/**
 * Permisos de gestion de equipo (P0-F). Puros: el servicio los aplica en el
 * servidor en cada operacion; la UI solo los usa para no mostrar botones
 * inutiles. Nunca se infieren de la UI.
 *
 *  OWNER : invita MEMBER/ADMIN; MEMBER <-> ADMIN; promueve a OWNER; suspende y
 *          reactiva a cualquiera (sin dejar el workspace sin OWNER); gestiona
 *          todas las invitaciones.
 *  ADMIN : invita MEMBER; suspende/reactiva MEMBER; revoca/reenvia solo
 *          invitaciones MEMBER creadas desde el workspace. No toca ADMIN/OWNER
 *          ni roles.
 *  MEMBER: solo lectura.
 *
 * Nadie invita directamente a un OWNER: se promueve despues, explicitamente.
 */

export type Actor = { userId: string; role: WorkspaceRole };

export function canInviteRole(actor: Actor, role: WorkspaceRole) {
  if (role === WorkspaceRole.OWNER) return false;
  if (actor.role === WorkspaceRole.OWNER) return true;
  return actor.role === WorkspaceRole.ADMIN && role === WorkspaceRole.MEMBER;
}

/** Suspender / reactivar a `target` (la proteccion del ultimo OWNER va aparte). */
export function canManageMember(actor: Actor, target: { userId: string; role: WorkspaceRole }) {
  if (actor.role === WorkspaceRole.OWNER) return true;
  return actor.role === WorkspaceRole.ADMIN && target.role === WorkspaceRole.MEMBER && target.userId !== actor.userId;
}

/**
 * Cambiar roles (incluida la promocion a OWNER): solo OWNER. La proteccion
 * del ultimo OWNER se aplica aparte, bajo lock (team/service).
 */
export function canChangeRole(actor: Actor) {
  return actor.role === WorkspaceRole.OWNER;
}

export function canManageInvitation(actor: Actor, invitation: { role: WorkspaceRole; origin: InvitationOrigin }) {
  if (actor.role === WorkspaceRole.OWNER) return true;
  return actor.role === WorkspaceRole.ADMIN && invitation.role === WorkspaceRole.MEMBER && invitation.origin === InvitationOrigin.WORKSPACE;
}

/** Lo que la UI puede ofrecer (el servidor vuelve a decidir en cada accion). */
export function teamCapabilities(actor: Actor) {
  return {
    invite: canInviteRole(actor, WorkspaceRole.MEMBER),
    inviteRoles: [WorkspaceRole.MEMBER, WorkspaceRole.ADMIN].filter((role) => canInviteRole(actor, role)),
    changeRoles: actor.role === WorkspaceRole.OWNER,
    readOnly: actor.role === WorkspaceRole.MEMBER,
  };
}
