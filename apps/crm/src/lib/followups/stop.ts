import { JourneyEnrollmentStatus, JourneyTrigger, OrderStatus } from '../../../generated/prisma/client';
import { recordAudit } from '../domain/audit';
import { prisma } from '../prisma';
import { COMMERCIAL_TRIGGERS, EXIT_REASON, isOptOutText } from './rules';

/**
 * Ganchos que detienen una secuencia de seguimiento en el momento en que deja
 * de corresponder (Punto 7). Viven aparte del motor para que los llamen el
 * webhook de pago, el inbound y el takeover sin formar ciclos de imports.
 */

export const PURCHASED: OrderStatus[] = [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.FULFILLED];

const COMMERCIAL = COMMERCIAL_TRIGGERS as readonly string[];

async function stopEnrollments(
  workspaceId: string,
  rows: { id: string; purchaseOrderId?: string | null }[],
  status: JourneyEnrollmentStatus,
  reason: string,
  metadata: Record<string, unknown>,
) {
  let stopped = 0;
  for (const row of rows) {
    // Condicional sobre ACTIVE: si el worker la termino entre medio, no se pisa.
    const result = await prisma.journeyEnrollment.updateMany({
      where: { id: row.id, workspaceId, status: JourneyEnrollmentStatus.ACTIVE },
      data: { status, exitedAt: new Date(), exitReason: reason, nextRunAt: null, ...(row.purchaseOrderId ? { purchaseOrderId: row.purchaseOrderId } : {}) },
    });
    if (result.count === 0) continue;
    stopped += 1;
    await recordAudit({ workspaceId, action: 'journey.exited', entity: 'JourneyEnrollment', entityId: row.id, metadata: { reason, ...metadata } });
  }
  return stopped;
}

/**
 * Compra confirmada: detiene las secuencias comerciales del contacto. Una
 * estrategia con producto solo se detiene si el pedido incluye ese producto;
 * la postventa (ORDER_PAID) nunca. Un pago pendiente no llega aqui.
 */
export async function stopFollowUpsForPurchase(input: { workspaceId: string; contactId: string; orderId: string }) {
  const order = await prisma.customerOrder.findFirst({
    where: { id: input.orderId, workspaceId: input.workspaceId, status: { in: PURCHASED } },
    select: { id: true, lines: { select: { variant: { select: { productId: true } } } } },
  });
  if (!order) return 0;
  const products = new Set(order.lines.map((line) => line.variant?.productId).filter(Boolean));

  const active = await prisma.journeyEnrollment.findMany({
    where: { workspaceId: input.workspaceId, contactId: input.contactId, status: JourneyEnrollmentStatus.ACTIVE, journey: { trigger: { not: JourneyTrigger.ORDER_PAID } } },
    select: { id: true, journey: { select: { productId: true } } },
  });
  const matching = active.filter((row) => !row.journey.productId || products.has(row.journey.productId));
  return stopEnrollments(input.workspaceId, matching.map((row) => ({ id: row.id, purchaseOrderId: order.id })), JourneyEnrollmentStatus.EXITED, EXIT_REASON.PURCHASED, { orderId: order.id });
}

/** El contacto escribio: toda secuencia activa se detiene; un "no me escriban" la cancela. */
export async function stopFollowUpsOnReply(input: { workspaceId: string; contactId: string; text?: string | null }) {
  const active = await prisma.journeyEnrollment.findMany({
    where: { workspaceId: input.workspaceId, contactId: input.contactId, status: JourneyEnrollmentStatus.ACTIVE },
    select: { id: true },
  });
  if (active.length === 0) return 0;
  const optOut = isOptOutText(input.text);
  return stopEnrollments(
    input.workspaceId,
    active,
    optOut ? JourneyEnrollmentStatus.CANCELED : JourneyEnrollmentStatus.EXITED,
    optOut ? EXIT_REASON.OPTED_OUT : EXIT_REASON.REPLIED,
    {},
  );
}

/** Una persona tomo la conversacion: las secuencias comerciales del contacto se detienen. */
export async function stopFollowUpsForTakeover(input: { workspaceId: string; contactId: string; conversationId: string }) {
  const active = await prisma.journeyEnrollment.findMany({
    where: { workspaceId: input.workspaceId, contactId: input.contactId, status: JourneyEnrollmentStatus.ACTIVE, journey: { trigger: { in: COMMERCIAL as JourneyTrigger[] } } },
    select: { id: true },
  });
  return stopEnrollments(input.workspaceId, active, JourneyEnrollmentStatus.EXITED, EXIT_REASON.HUMAN, { conversationId: input.conversationId });
}

/**
 * Los ganchos son efectos secundarios de algo que ya ocurrio (un pago, un
 * mensaje): si fallan, el hecho principal no se revierte. El chequeo previo a
 * cada paso del motor es la segunda red.
 */
export async function safely(task: () => Promise<unknown>) {
  try {
    await task();
  } catch (error) {
    console.error('[followups] gancho de detencion fallo', error);
  }
}
