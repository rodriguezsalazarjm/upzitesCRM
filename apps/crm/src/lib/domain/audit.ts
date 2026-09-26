import type { Prisma, PrismaClient } from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { SUPPORT_SESSION_HEADER } from '../request-headers';

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
 * SupportSession del request actual, si lo hay. El proxy lo pone a partir de
 * la cookie firmada (y borra el que mande el cliente). Fuera de un request
 * (workers, cron, scripts) no hay headers y no aplica.
 */
async function currentSupportSessionId(): Promise<string | null> {
  try {
    const { headers } = await import('next/headers');
    return (await headers()).get(SUPPORT_SESSION_HEADER);
  } catch {
    return null;
  }
}

/**
 * Registra un cambio en el audit log. La Fase 1 exige que toda transicion de
 * estado y todo cambio de consentimiento quede auditado.
 *
 * Si la accion la hizo un operador en modo soporte, la entrada lleva el
 * `supportSessionId`: el AuditLog del workspace es la prueba de que la accion
 * OCURRIO (se llama al completarla), a diferencia del intento que el proxy
 * deja en PlatformAuditLog.
 */
export async function recordAudit(input: AuditInput, db: Db = prisma) {
  const supportSessionId = await currentSupportSessionId();
  const metadata =
    supportSessionId === null
      ? input.metadata
      : input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
        ? { ...(input.metadata as Prisma.InputJsonObject), supportSessionId }
        : input.metadata === undefined
          ? { supportSessionId }
          : { value: input.metadata, supportSessionId };

  return db.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actorId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      metadata,
    },
  });
}
