import { notFound } from 'next/navigation';
import { requireCurrentUser } from './auth';
import { DEV_DEMO_USER } from './dev-demo';
import { prisma } from './prisma';

/**
 * Autorizacion de operador de plataforma (ver modelo `PlatformAdmin`).
 *
 * No se guarda en la cookie de sesion: se consulta en cada request para que
 * revocar el permiso corte el acceso de inmediato, sin esperar a que expire la
 * sesion. Tampoco se deduce del rol del workspace: un OWNER es dueno de SU
 * workspace, no de la plataforma.
 */
export async function isPlatformAdmin(userId: string) {
  if (userId === DEV_DEMO_USER.id) return false;
  const admin = await prisma.platformAdmin.findUnique({ where: { userId }, select: { id: true } });
  return Boolean(admin);
}

/**
 * Para paginas y rutas de plataforma. Quien no es operador recibe un 404, no un
 * 403: que la ruta exista tampoco es asunto de un cliente.
 */
export async function requirePlatformAdmin() {
  const user = await requireCurrentUser();
  if (!(await isPlatformAdmin(user.id))) notFound();
  return user;
}
