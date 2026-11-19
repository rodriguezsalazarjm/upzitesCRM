import { PaymentIncidentKind, PaymentIncidentStatus } from '../../../generated/prisma/client';
import { recordAudit } from '../domain/audit';
import { prisma } from '../prisma';

export type IncidentInput = {
  workspaceId: string;
  kind: PaymentIncidentKind;
  externalPaymentId: string;
  paymentId?: string | null;
  orderId?: string | null;
  amount?: number | null;
  currency?: string | null;
  evidence: Record<string, unknown>;
};

/**
 * P31: deja la incidencia en la cola del negocio. Idempotente por
 * (workspace, tipo, pago externo): los reintentos del webhook no duplican la
 * fila ni reabren una que alguien ya resolvió.
 */
export async function recordPaymentIncident(input: IncidentInput) {
  const { workspaceId, kind, externalPaymentId, evidence, ...rest } = input;
  return prisma.paymentIncident.upsert({
    where: { workspaceId_kind_externalPaymentId: { workspaceId, kind, externalPaymentId } },
    create: { workspaceId, kind, externalPaymentId, evidence: evidence as never, ...rest },
    update: {},
    select: { id: true, status: true },
  });
}

export async function countOpenIncidents(workspaceId: string) {
  return prisma.paymentIncident.count({ where: { workspaceId, status: PaymentIncidentStatus.OPEN } });
}

/** Cierra una incidencia abierta con una nota. Devuelve null si no existe o ya estaba cerrada. */
export async function resolvePaymentIncident(input: {
  workspaceId: string;
  id: string;
  status: 'RESOLVED' | 'DISMISSED';
  note: string;
  actorId: string;
}) {
  const now = new Date();
  const { count } = await prisma.paymentIncident.updateMany({
    where: { id: input.id, workspaceId: input.workspaceId, status: PaymentIncidentStatus.OPEN },
    data: { status: input.status, resolutionNote: input.note, resolvedById: input.actorId, resolvedAt: now },
  });
  if (count === 0) return null;
  await recordAudit({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: input.status === 'RESOLVED' ? 'payment_incident.resolved' : 'payment_incident.dismissed',
    entity: 'PaymentIncident',
    entityId: input.id,
    metadata: { note: input.note },
  });
  return { id: input.id, status: input.status, resolvedAt: now };
}

export { PaymentIncidentKind };
