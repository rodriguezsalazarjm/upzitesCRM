import { UserRole } from '../../../generated/prisma/client';

export function canApproveQuotes(role: UserRole) {
  return role === UserRole.OWNER || role === UserRole.ADMIN;
}
