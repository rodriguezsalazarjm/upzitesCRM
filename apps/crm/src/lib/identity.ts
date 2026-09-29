import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { prisma } from './prisma';

/**
 * Identidad global (P0-FOUNDATION step 2): una persona = un `User`, con email
 * unico en toda la plataforma y memberships en N workspaces. Todo lo que
 * busca una cuenta por email pasa por aqui, con el mismo criterio de
 * normalizacion, para que "Ana@X.com " y "ana@x.com" nunca sean dos cuentas.
 */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

type Db = PrismaClient | Prisma.TransactionClient;

/** Busqueda deterministica por email global (unique). */
export function findUserByEmail<T extends Prisma.UserSelect>(email: string, select: T, db: Db = prisma) {
  return db.user.findUnique({ where: { email: normalizeEmail(email) }, select });
}
