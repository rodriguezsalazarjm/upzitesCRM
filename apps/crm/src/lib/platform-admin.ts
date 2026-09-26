import { PlatformRole } from '../../generated/prisma/enums';
import { DEV_DEMO_USER } from './dev-demo';
import { prisma } from './prisma';
import { isPlatformOperator } from './workspace-access';
import { requirePlatformRole } from './workspace-context';

/**
 * Autorizacion de operador de plataforma: `User.platformRole` en
 * PLATFORM_ADMIN o SUPER_ADMIN (P0-FOUNDATION reemplazo la tabla de P0-A).
 *
 * No se guarda en la cookie de sesion: se consulta en cada request para que
 * revocar el permiso corte el acceso de inmediato, sin esperar a que expire la
 * sesion. Tampoco se deduce del rol del workspace: un OWNER es dueno de SU
 * workspace, no de la plataforma.
 */
export async function isPlatformAdmin(userId: string) {
  if (userId === DEV_DEMO_USER.id) return false;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { platformRole: true } });
  return user ? isPlatformOperator(user.platformRole) : false;
}

/**
 * Para paginas y rutas de plataforma. Quien no es operador recibe un 404, no un
 * 403: que la ruta exista tampoco es asunto de un cliente.
 */
export async function requirePlatformAdmin() {
  return requirePlatformRole(PlatformRole.PLATFORM_ADMIN);
}
