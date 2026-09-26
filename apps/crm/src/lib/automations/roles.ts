import { WorkspaceRole } from '../../../generated/prisma/client';

/** Solo owner/admin crean, editan y publican automatizaciones. SALES puede verlas. */
export function canManageAutomations(role: WorkspaceRole) {
  return role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN;
}
