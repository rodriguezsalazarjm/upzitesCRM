import {
  ActivityType,
  DeliveryStatus,
  OrderStatus,
  PaymentIncidentKind,
  PaymentStatus,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { formatMinor } from './money';
import { recordAudit } from '../domain/audit';
import { applyApprovedPayment } from '../domain';
import { safely, stopFollowUpsForPurchase } from '../followups/stop';
import { cancelCheckoutRecovery, upsertPayment } from './checkout';
import { grantDigitalDelivery, sendDelivery } from './delivery';
import { recordPaymentIncident } from './payment-incidents';

const PAID_ORDER_STATUSES: OrderStatus[] = [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.FULFILLED];
const MISMATCH_KIND: Record<string, PaymentIncidentKind> = {
  'order.payment_amount_mismatch': PaymentIncidentKind.AMOUNT_MISMATCH,
  'order.payment_currency_mismatch': PaymentIncidentKind.CURRENCY_MISMATCH,
  'order.payment_stale_preference': PaymentIncidentKind.STALE_PREFERENCE,
};

/**
 * P31: un pago que no se pudo asociar a un pedido del workspace que cobró.
 * Solo se encola cuando se sabe qué cuenta cobró (webhook por workspace): nunca
 * en la cola de otro negocio, y sin enlazar el pedido ajeno.
 */
export async function recordOrphanPayment(input: {
  workspaceId?: string;
  externalPaymentId: string;
  amount: number;
  currency: string;
  reason: string;
  referencedOrderId?: string | null;
  externalReference?: string | null;
  rawStatus?: string;
}) {
  if (!input.workspaceId) return;
  await recordPaymentIncident({
    workspaceId: input.workspaceId,
    kind: PaymentIncidentKind.ORPHAN_PAYMENT,
    externalPaymentId: input.externalPaymentId,
    amount: input.amount,
    currency: input.currency,
    evidence: {
      reason: input.reason,
      referencedOrderId: input.referencedOrderId ?? null,
      externalReference: input.externalReference ?? null,
      rawStatus: input.rawStatus ?? null,
      receivedAmount: input.amount,
      receivedCurrency: input.currency,
    },
  });
}

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
  /** Workspace dueno de la cuenta que cobro. Si viene, el pedido debe ser suyo. */
  workspaceId?: string;
  /** Valores obtenidos del payment reconsultado, nunca del return URL. */
  externalReference?: string | null;
  preferenceId?: string | null;
  /** Pago SIMULADO (solo modo demo local, ver lib/testing/local-mode): queda marcado en Payment y auditoria. */
  simulated?: boolean;
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

  const orphan = (reason: string) => recordOrphanPayment({
    workspaceId: input.workspaceId,
    externalPaymentId: input.externalPaymentId,
    amount: input.amount,
    currency: input.currency,
    reason,
    referencedOrderId: input.orderId,
    externalReference: input.externalReference,
    rawStatus: input.rawStatus,
  });

  if (!order) {
    await orphan('pedido no encontrado');
    return { handled: false, reason: 'pedido no encontrado' };
  }

  // Un pago cobrado con la cuenta de Mercado Pago del workspace A solo puede
  // pagar pedidos de A. El orderId viene de la metadata del pago, y quien
  // controla la cuenta de A podria poner ahi el id de un pedido ajeno.
  if (input.workspaceId && order.workspaceId !== input.workspaceId) {
    await orphan('el pedido indicado no es de este negocio');
    return { handled: false, reason: 'pedido de otro workspace' };
  }

  if (input.externalReference && input.externalReference !== order.id) {
    await orphan('la referencia externa no coincide con el pedido');
    return { handled: false, reason: 'external_reference no coincide con el pedido' };
  }

  const workspaceId = order.workspaceId;

  // Un pago pendiente o rechazado se registra, pero NO entrega nada.
  if (input.status !== PaymentStatus.APPROVED) {
    const { payment } = await upsertPayment({
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
      // Devolver el pago DUPLICADO no deshace la compra: el pedido sigue pagado por el original.
      const stored = await prisma.payment.findFirst({ where: { workspaceId, id: payment.id }, select: { metadata: true } });
      const duplicateOf = (stored?.metadata as Record<string, unknown> | null)?.duplicateOf;
      const revoked = duplicateOf
        ? 0
        : await revokeOrderAccess({
            workspaceId,
            orderId: order.id,
            reason: `pago ${input.rawStatus}`,
          });
      // Mercado Pago informa el contracargo como charged_back (mapeado a REFUNDED).
      await recordPaymentIncident({
        workspaceId,
        kind: input.rawStatus === 'charged_back' ? PaymentIncidentKind.CHARGEBACK : PaymentIncidentKind.REFUND,
        externalPaymentId: input.externalPaymentId,
        paymentId: payment.id,
        orderId: order.id,
        amount: input.amount,
        currency: input.currency,
        evidence: { rawStatus: input.rawStatus, receivedAmount: input.amount, receivedCurrency: input.currency, revoked, ...(duplicateOf ? { previousPaymentId: duplicateOf } : {}) },
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

  const orderMetadata = order.metadata && typeof order.metadata === 'object' && !Array.isArray(order.metadata)
    ? order.metadata as Record<string, unknown>
    : {};
  const currentPreferenceId = typeof orderMetadata.preferenceId === 'string' ? orderMetadata.preferenceId : null;
  const stalePreference = Boolean(input.preferenceId && currentPreferenceId && input.preferenceId !== currentPreferenceId);
  const mismatch = input.amount !== order.total
    ? { action: 'order.payment_amount_mismatch', reason: 'el monto no coincide con el pedido' }
    : input.currency !== order.currency
      ? { action: 'order.payment_currency_mismatch', reason: 'la moneda no coincide con el pedido' }
      : stalePreference
        ? { action: 'order.payment_stale_preference', reason: 'la preferencia no es la vigente del pedido' }
      : null;

  if (mismatch) {
    const evidence = {
      validation: mismatch.action,
      expectedAmount: order.total,
      receivedAmount: input.amount,
      expectedCurrency: order.currency,
      receivedCurrency: input.currency,
      preferenceId: input.preferenceId ?? null,
      currentPreferenceId,
      stalePreference,
      externalReference: input.externalReference ?? null,
    };
    const { payment } = await upsertPayment({
      workspaceId,
      orderId: order.id,
      externalId: input.externalPaymentId,
      status: PaymentStatus.APPROVED,
      rawStatus: input.rawStatus,
      amount: input.amount,
      currency: input.currency,
      payerEmail: input.payerEmail,
      metadata: evidence,
    });
    const existingAlert = await prisma.auditLog.findFirst({
      where: {
        workspaceId,
        action: mismatch.action,
        entity: 'Payment',
        entityId: payment.id,
      },
      select: { id: true },
    });
    if (!existingAlert) {
      await recordAudit({
        workspaceId,
        action: mismatch.action,
        entity: 'Payment',
        entityId: payment.id,
        metadata: { ...evidence, orderId: order.id, paymentId: input.externalPaymentId },
      });
    }
    await recordPaymentIncident({
      workspaceId,
      kind: MISMATCH_KIND[mismatch.action],
      externalPaymentId: input.externalPaymentId,
      paymentId: payment.id,
      orderId: order.id,
      amount: input.amount,
      currency: input.currency,
      evidence,
    });
    return { handled: false, orderId: order.id, reason: mismatch.reason, delivered: 0 };
  }

  // P31: el pedido ya estaba pagado por OTRO pago aprobado: se registra el cobro
  // y se encola, pero no se vuelve a confirmar ni a entregar. handled=true para
  // que Mercado Pago no reintente: lo que falta es una devolución manual.
  // El original es el que confirmó: un pago rechazado por mismatch (metadata.validation)
  // o ya marcado duplicado también queda APPROVED, pero no pagó el pedido.
  const previousPayment = PAID_ORDER_STATUSES.includes(order.status)
    ? (await prisma.payment.findMany({
        where: { workspaceId, orderId: order.id, status: PaymentStatus.APPROVED, externalId: { not: input.externalPaymentId } },
        orderBy: { createdAt: 'asc' },
        select: { externalId: true, metadata: true },
      })).find((p) => {
        const meta = (p.metadata ?? {}) as Record<string, unknown>;
        return !meta.validation && !meta.duplicateOf;
      }) ?? null
    : null;
  if (previousPayment) {
    const { payment, alreadyProcessed: seen } = await upsertPayment({
      workspaceId,
      orderId: order.id,
      externalId: input.externalPaymentId,
      status: PaymentStatus.APPROVED,
      rawStatus: input.rawStatus,
      amount: input.amount,
      currency: input.currency,
      payerEmail: input.payerEmail,
      metadata: { duplicateOf: previousPayment.externalId, ...(input.simulated ? { simulated: true } : {}) },
    });
    await recordPaymentIncident({
      workspaceId,
      kind: PaymentIncidentKind.DUPLICATE_PAYMENT,
      externalPaymentId: input.externalPaymentId,
      paymentId: payment.id,
      orderId: order.id,
      amount: input.amount,
      currency: input.currency,
      evidence: { previousPaymentId: previousPayment.externalId, receivedAmount: input.amount, receivedCurrency: input.currency, expectedAmount: order.total, expectedCurrency: order.currency },
    });
    return { handled: true, orderId: order.id, alreadyProcessed: seen, reason: 'pago duplicado: el pedido ya estaba pagado', delivered: 0 };
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
    metadata: {
      preferenceId: input.preferenceId ?? null,
      currentPreferenceId,
      stalePreference,
      externalReference: input.externalReference ?? null,
      ...(input.simulated ? { simulated: true } : {}),
    },
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
    // Punto 7: la compra confirmada detiene los seguimientos en el acto.
    const contactId = order.contactId;
    await safely(() => stopFollowUpsForPurchase({ workspaceId, contactId, orderId: order.id }));

    await prisma.activity.create({
      data: {
        workspaceId,
        contactId: order.contactId,
        type: ActivityType.DEAL,
        title: 'Pago confirmado',
        description: `Pedido por ${formatMinor(order.total, order.currency)}.`,
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
  // Solo se envia lo recien generado: si la entrega ya existia, el envio (y su
  // reenvio) ya ocurrio o es una accion explicita desde Pedidos. El intento
  // queda registrado en la entrega (SENT / FAILED / sin canal), ver sendDelivery.
  const sent = delivery.deliveryId && !delivery.alreadyDelivered
    ? await sendDelivery({ workspaceId, deliveryId: delivery.deliveryId, baseUrl: input.baseUrl, reason: 'initial' })
    : null;
  const notified = sent?.ok ? sent.channels : { whatsapp: false, email: false };

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
      ...(input.simulated ? { simulated: true } : {}),
    },
  });

  return {
    handled: true,
    orderId: order.id,
    // Contenidos entregados (archivos y enlaces), no filas: desde el Punto 3 hay
    // una entrega por pedido con todos sus contenidos.
    delivered: delivery.alreadyDelivered ? 0 : (delivery.items ?? 0),
    notified: notified.whatsapp || notified.email,
  };
}

export { classifyPayment, SAAS_SUBSCRIPTION_KIND, type PaymentClass } from './payment-class';
