import {
  ActivityType,
  DeliveryStatus,
  OrderStatus,
  PaymentStatus,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { recordAudit } from '../domain/audit';
import { applyApprovedPayment } from '../domain';
import { cancelCheckoutRecovery, upsertPayment } from './checkout';
import { grantDigitalDelivery } from './delivery';
import { notifyDigitalDelivery } from './delivery-notify';

/**
 * Procesa el pago de un PEDIDO (no de una suscripcion).
 *
 * Precondiciones que garantiza el llamador (la ruta del webhook):
 *   - la firma de Mercado Pago ya fue validada;
 *   - el pago ya fue re-consultado contra la API del proveedor, no se confia
 *     en el cuerpo de la notificacion.
 */
export type OrderPaymentInput = {
  orderId: string;
  externalPaymentId: string;
  status: PaymentStatus;
  rawStatus: string;
  amount: number;
  currency: string;
  payerEmail?: string | null;
  baseUrl: string;
};

export type OrderPaymentResult = {
  handled: boolean;
  reason?: string;
  orderId?: string;
  delivered?: number;
  /** Si el acceso salio hacia el cliente por algun canal. */
  notified?: boolean;
  /** Accesos revocados por un reembolso o contracargo. */
  revoked?: number;
  alreadyProcessed?: boolean;
};

/**
 * Revoca lo entregado de un pedido y lo marca como reembolsado.
 *
 * **No revierte el ciclo de vida del contacto.** Un reembolso no significa que
 * nunca fue cliente: quien compro cinco veces y devolvio una sigue siendolo, y
 * degradarlo por una devolucion borraria historia comercial cierta. Queda
 * registrado como actividad, que es donde una persona lo va a ver.
 */
export async function revokeOrderAccess(input: {
  workspaceId: string;
  orderId: string;
  reason: string;
  actorId?: string | null;
}) {
  const revoked = await prisma.digitalDelivery.updateMany({
    where: {
      workspaceId: input.workspaceId,
      orderId: input.orderId,
      status: { not: DeliveryStatus.REVOKED },
    },
    data: { status: DeliveryStatus.REVOKED, revokedAt: new Date() },
  });

  const order = await prisma.customerOrder.update({
    where: { id: input.orderId },
    data: { status: OrderStatus.REFUNDED },
    select: { contactId: true, total: true, currency: true },
  });

  if (order.contactId) {
    await prisma.activity.create({
      data: {
        workspaceId: input.workspaceId,
        contactId: order.contactId,
        type: ActivityType.DEAL,
        title: 'Pago devuelto',
        description: `${input.reason}. Se revocaron ${revoked.count} acceso(s) del pedido.`,
      },
    });
  }

  await recordAudit({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: 'order.refunded',
    entity: 'CustomerOrder',
    entityId: input.orderId,
    metadata: { reason: input.reason, revoked: revoked.count },
  });

  return revoked.count;
}

export async function processOrderPayment(input: OrderPaymentInput): Promise<OrderPaymentResult> {
  const order = await prisma.customerOrder.findUnique({
    where: { id: input.orderId },
    include: { lines: true },
  });

  if (!order) {
    return { handled: false, reason: 'pedido no encontrado' };
  }

  const workspaceId = order.workspaceId;

  // Un pago pendiente o rechazado se registra, pero NO entrega nada.
  if (input.status !== PaymentStatus.APPROVED) {
    await upsertPayment({
      workspaceId,
      orderId: order.id,
      externalId: input.externalPaymentId,
      status: input.status,
      rawStatus: input.rawStatus,
      amount: input.amount,
      currency: input.currency,
      payerEmail: input.payerEmail,
    });

    // D27: un reembolso o un contracargo tienen que revocar lo entregado. Antes
    // se registraba el pago devuelto y el cliente se quedaba con el acceso.
    if (input.status === PaymentStatus.REFUNDED) {
      const revoked = await revokeOrderAccess({
        workspaceId,
        orderId: order.id,
        reason: `pago ${input.rawStatus}`,
      });

      return {
        handled: true,
        orderId: order.id,
        reason: `pago en estado ${input.rawStatus}`,
        delivered: 0,
        revoked,
      };
    }

    return { handled: true, orderId: order.id, reason: `pago en estado ${input.rawStatus}`, delivered: 0 };
  }

  // Validacion de monto: si lo cobrado no coincide con el total del pedido, se
  // rechaza. Cubre una preferencia manipulada o un pedido editado despues de
  // generar el checkout.
  if (input.amount !== order.total) {
    await recordAudit({
      workspaceId,
      action: 'order.payment_amount_mismatch',
      entity: 'CustomerOrder',
      entityId: order.id,
      metadata: { expected: order.total, received: input.amount, paymentId: input.externalPaymentId },
    });
    return { handled: false, reason: 'el monto no coincide con el pedido' };
  }

  if (input.currency !== order.currency) {
    await recordAudit({
      workspaceId,
      action: 'order.payment_currency_mismatch',
      entity: 'CustomerOrder',
      entityId: order.id,
      metadata: { expected: order.currency, received: input.currency },
    });
    return { handled: false, reason: 'la moneda no coincide con el pedido' };
  }

  const { alreadyProcessed } = await upsertPayment({
    workspaceId,
    orderId: order.id,
    externalId: input.externalPaymentId,
    status: PaymentStatus.APPROVED,
    rawStatus: input.rawStatus,
    amount: input.amount,
    currency: input.currency,
    payerEmail: input.payerEmail,
  });

  if (alreadyProcessed) {
    return { handled: true, orderId: order.id, alreadyProcessed: true, delivered: 0 };
  }

  await prisma.customerOrder.update({
    where: { id: order.id },
    data: { status: OrderStatus.CONFIRMED, confirmedAt: new Date() },
  });

  // Efectos comerciales: cliente, oportunidad ganada y cancelacion de
  // seguimientos. Pasa por el servicio de dominio de la Fase 1, no se escribe
  // el estado a mano.
  if (order.contactId) {
    await applyApprovedPayment({
      workspaceId,
      contactId: order.contactId,
      paymentId: input.externalPaymentId,
      amount: input.amount,
    });

    await prisma.activity.create({
      data: {
        workspaceId,
        contactId: order.contactId,
        type: ActivityType.DEAL,
        title: 'Pago confirmado',
        description: `Pedido por ${order.total} ${order.currency}.`,
      },
    });
  }

  await cancelCheckoutRecovery(workspaceId, order.id, 'el pago fue confirmado');

  const delivery = await grantDigitalDelivery({
    workspaceId,
    orderId: order.id,
    baseUrl: input.baseUrl,
  });

  // D29: hasta ahora los accesos se generaban y se devolvian aqui, y nadie los
  // mandaba. El cliente pagaba y no recibia nada.
  //
  // Solo se notifica lo recien generado: si el pago ya se habia procesado,
  // `grantDigitalDelivery` devuelve tokens nulos —los validos son los de la
  // primera vez— y reenviar seria mandar enlaces que no sirven.
  const notified = await notifyDigitalDelivery({
    workspaceId,
    orderId: order.id,
    contactId: order.contactId,
    links: delivery.deliveries,
  });

  await recordAudit({
    workspaceId,
    action: 'order.payment_confirmed',
    entity: 'CustomerOrder',
    entityId: order.id,
    metadata: {
      paymentId: input.externalPaymentId,
      amount: input.amount,
      deliveries: delivery.deliveries.length,
      notifiedByWhatsapp: notified.whatsapp,
      notifiedByEmail: notified.email,
    },
  });

  return {
    handled: true,
    orderId: order.id,
    delivered: delivery.deliveries.filter((d) => d.token !== null).length,
    notified: notified.whatsapp || notified.email,
  };
}

/**
 * Decide si una notificacion corresponde a un pedido o a una suscripcion.
 *
 * Compatibilidad hacia atras deliberada: las preferencias creadas ANTES de la
 * Fase 5 no llevan `kind`, y esas son de suscripcion. Solo se trata como pedido
 * lo que viene marcado explicitamente. Asi un pago en vuelo no cambia de
 * significado a mitad de camino.
 */
export function classifyPayment(metadata: Record<string, unknown> | null | undefined) {
  const kind = metadata && typeof metadata.kind === 'string' ? metadata.kind : null;
  return kind === 'order' ? ('order' as const) : ('subscription' as const);
}
