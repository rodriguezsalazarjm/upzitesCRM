import type { Prisma, PrismaClient } from '../../../generated/prisma/client';
import { prisma } from '../prisma';

/**
 * Cliente Prisma o transaccion. Los servicios de dominio lo reciben para poder
 * componerse dentro de una misma transaccion sin duplicar logica.
 */
export type Db = PrismaClient | Prisma.TransactionClient;

export type AuditInput = {
  workspaceId: string;
  action: string;
  entity: string;
  entityId?: string | null;
  actorId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Registra un cambio en el audit log. La Fase 1 exige que toda transicion de
 * estado y todo cambio de consentimiento quede auditado.
 */
export async function recordAudit(input: AuditInput, db: Db = prisma) {
  return db.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actorId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      metadata: input.metadata,
    },
  });
}
