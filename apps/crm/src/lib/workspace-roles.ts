import { WorkspaceRole } from '../../generated/prisma/enums';
import { hasWorkspaceRole } from './workspace-access';

/**
 * Reglas de rol de WORKSPACE compartidas por el sidebar, los guards de pagina
 * y las APIs (P0-E): "quien ve el modulo" y "quien puede abrirlo" salen de la
 * misma jerarquia (`hasWorkspaceRole`).
 */
export function roleAllows(role: WorkspaceRole, minRole: WorkspaceRole | undefined | null) {
  return !minRole || hasWorkspaceRole(role, minRole);
}

/** Configuracion del workspace (perfil, pipeline, presets): OWNER/ADMIN. */
export function canManageWorkspaceSettings(role: WorkspaceRole) {
  return hasWorkspaceRole(role, WorkspaceRole.ADMIN);
}
