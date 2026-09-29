import { NextResponse } from 'next/server';
import { PlatformRole } from '../../../generated/prisma/enums';
import { DEV_DEMO_USER } from '../dev-demo';
import { crossTenantPrisma } from '../prisma';
import { readSessionCookie } from '../session';
import { hasPlatformRole } from '../workspace-access';

/**
 * Autorizacion de las rutas de PLATAFORMA (P0-D). Depende solo de la sesion y
 * de `User.platformRole`, leido en cada request: nunca del workspace activo,
 * de sus entitlements ni del rol en un workspace (un OWNER no es operador).
 *
 *  - PLATFORM_ADMIN: clientes SaaS, invitaciones, pagos manuales, renovar,
 *    suspender/reactivar, soporte, Ops.
 *  - SUPER_ADMIN: ademas COMP, roles de plataforma, Price Book, `isInternal`
 *    y negocios internos.
 * Quien no alcanza recibe 404: que la ruta exista no es asunto de un cliente.
 */

export type PlatformActor = { id: string; name: string; email: string; platformRole: PlatformRole };

export async function currentPlatformActor(min: PlatformRole = PlatformRole.PLATFORM_ADMIN): Promise<PlatformActor | null> {
  const session = await readSessionCookie();
  if (!session || session.userId === DEV_DEMO_USER.id) return null;
  const user = await crossTenantPrisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, platformRole: true },
  });
  return user && hasPlatformRole(user.platformRole, min) ? user : null;
}

export function isSuperAdmin(actor: Pick<PlatformActor, 'platformRole'>) {
  return actor.platformRole === PlatformRole.SUPER_ADMIN;
}

/** Para route handlers: el actor o un 404 listo para devolver. */
export async function platformGuard(min: PlatformRole = PlatformRole.PLATFORM_ADMIN) {
  const actor = await currentPlatformActor(min);
  if (!actor) return { ok: false as const, response: NextResponse.json({ message: 'No encontrado.' }, { status: 404 }) };
  return { ok: true as const, actor };
}

export class PlatformPermissionError extends Error {
  constructor(message = 'Solo un SUPER_ADMIN puede hacer esto.') {
    super(message);
    this.name = 'PlatformPermissionError';
  }
}

export function assertSuperAdmin(actor: Pick<PlatformActor, 'platformRole'>, what?: string) {
  if (!isSuperAdmin(actor)) throw new PlatformPermissionError(what ? `Solo un SUPER_ADMIN puede ${what}.` : undefined);
}
