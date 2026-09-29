import type { Prisma } from '../../generated/prisma/client';
import { prisma } from './prisma';

/**
 * Invalida TODAS las sesiones abiertas de un usuario: sube
 * `User.sessionVersion` y cualquier cookie emitida antes deja de valer en el
 * siguiente request (ver `readSessionCookie` / `resolveContextForSession`).
 *
 * La usa el reset de contrasena (dentro de su transaccion). Queda lista para
 * un futuro "cerrar sesion en todos los dispositivos". No emite una sesion
 * nueva: quien la llama decide si el usuario vuelve a entrar.
 */
export async function revokeAllSessions(userId: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const user = await tx.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  return user.sessionVersion;
}
