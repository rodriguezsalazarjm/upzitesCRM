import { WorkspaceRole } from '../../../generated/prisma/client';

export function canApproveQuotes(role: WorkspaceRole) {
  return role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN;
}
