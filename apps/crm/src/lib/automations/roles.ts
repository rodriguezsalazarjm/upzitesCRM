import { UserRole } from '../../../generated/prisma/client';

/** Solo owner/admin crean, editan y publican automatizaciones. SALES puede verlas. */
export function canManageAutomations(role: UserRole) {
  return role === UserRole.OWNER || role === UserRole.ADMIN;
}
