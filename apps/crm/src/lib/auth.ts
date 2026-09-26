import { createHmac, randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import type { WorkspaceRole } from '../../generated/prisma/enums';
import { getSessionSecret } from './session-token';
import { getContextState } from './workspace-context';

export { createSessionToken } from './session-token';
export { clearSessionCookie, setSessionCookie } from './session';

/**
 * Contrato historico de "usuario actual": se conserva tal cual para las ~270
 * lecturas de `user.workspace.id`. Desde P0-FOUNDATION se calcula a partir del
 * workspace ACTIVO verificado por membership (ver lib/workspace-context), no
 * de `users.workspace_id`. `role` es el rol en ESE workspace.
 */
export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const state = await getContextState();
  if (state.kind !== 'ok') return null;
  const { ctx } = state;
  return {
    id: ctx.user.id,
    name: ctx.user.name,
    email: ctx.user.email,
    role: ctx.role,
    workspace: ctx.workspace,
  };
}

export async function requireCurrentUser(): Promise<CurrentUser> {
  const state = await getContextState();
  if (state.kind === 'anonymous') redirect('/login');
  // Sesion valida pero sin workspace permitido (membership revocada, soporte
  // vencido): el resolvedor elige otro y reemite la cookie.
  if (state.kind === 'no-workspace') redirect('/api/workspaces/resolve');
  const { ctx } = state;
  return {
    id: ctx.user.id,
    name: ctx.user.name,
    email: ctx.user.email,
    role: ctx.role,
    workspace: ctx.workspace,
  };
}

export function generateResetToken() {
  return randomBytes(32).toString('base64url');
}

export function hashResetToken(token: string) {
  return createHmac('sha256', getSessionSecret()).update(token).digest('hex');
}
