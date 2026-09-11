import { UserRole } from '../../../generated/prisma/client';

/**
 * Quien puede publicar un journey o lanzar una campana.
 *
 * Publicar significa empezar a escribirle a clientes reales, asi que se pide el
 * mismo nivel que para aprobar una cotizacion: owner o admin. Un usuario
 * operativo puede preparar el borrador, no dispararlo.
 */
export function canManageMarketing(role: UserRole) {
  return role === UserRole.OWNER || role === UserRole.ADMIN;
}
