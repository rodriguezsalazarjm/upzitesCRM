import {
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  ScheduledActionType,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { recordAudit } from '../domain/audit';
import { cancelByKey, scheduleAction } from '../domain';
import { getPreferenceClient } from '../mercado-pago';

/**
 * Checkout de un pedido con Mercado Pago.
 *
 * Discriminacion critica: la preferencia lleva `metadata.kind = 'order'`. El
 * webhook la usa para saber que ESTO es la compra de un producto y no el pago
 * de la suscripcion del CRM. Sin esa marca, el primer infoproducto vendido
 * habria activado una suscripcion mensual gratis.
 */
export const CHECKOUT_KIND_ORDER = 'order';
export const CHECKOUT_KIND_SUBSCRIPTION = 'subscription';

export class CheckoutError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'NOT_CONFIGURED' | 'INVALID_STATE' | 'PROVIDER',
  ) {
    super(message);
    this.name = 'CheckoutError';
  }
}

function baseUrl() {
  return (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
}

/** Clave de cancelacion de la recuperacion de checkout de un pedido. */
export function recoveryKeyFor(orderId: string) {
  return `checkout-recovery:${orderId}`;
}

export async function createOrderCheckout(input: {
  workspaceId: string;
  orderId: string;
  actorId?: string | null;
}) {
  const order = await prisma.customerOrder.findFirst({
    where: { id: input.orderId, workspaceId: input.workspaceId },
    include: { lines: true, contact: { select: { id: true, email: true } } },
  });

  if (!order) throw new CheckoutError('Pedido no encontrado.', 'NOT_FOUND');
  if (order.lines.length === 0) throw new CheckoutError('El pedido no tiene lineas.', 'INVALID_STATE');

  if (order.status === OrderStatus.CONFIRMED || order.status === OrderStatus.FULFILLED) {
    throw new CheckoutError('El pedido ya esta pagado.', 'INVALID_STATE');
  }

  const client = getPreferenceClient();
  if (!client) {
    throw new CheckoutError('Mercado Pago no esta configurado.', 'NOT_CONFIGURED');
  }

  const url = baseUrl();

  let preference;
  try {
    preference = await client.create({
      body: {
        items: order.lines.map((line) => ({
          id: line.variantId ?? line.id,
          title: line.name,
          quantity: line.quantity,
          currency_id: order.currency,
          unit_price: line.unitPrice,
        })),
        // external_reference lleva el ID DEL PEDIDO, no el del workspace: es la
        // otra mitad de la discriminacion con el pago de suscripcion.
        external_reference: order.id,
        metadata: {
          kind: CHECKOUT_KIND_ORDER,
          orderId: order.id,
          workspaceId: input.workspaceId,
        },
        payer: order.contact?.email ? { email: order.contact.email } : undefined,
        back_urls: {
          success: `${url}/checkout/${order.id}?status=success`,
          pending: `${url}/checkout/${order.id}?status=pending`,
          failure: `${url}/checkout/${order.id}?status=failure`,
        },
        auto_return: 'approved',
        notification_url: `${url}/api/billing/webhook`,
      },
    });
  } catch (error) {
    throw new CheckoutError(
      error instanceof Error ? error.message : 'Mercado Pago rechazo la preferencia.',
      'PROVIDER',
    );
  }

  const checkoutUrl = preference.sandbox_init_point ?? preference.init_point;
  if (!checkoutUrl) throw new CheckoutError('Mercado Pago no devolvio URL de pago.', 'PROVIDER');

  await prisma.customerOrder.update({
    where: { id: order.id },
    data: {
      status: OrderStatus.PENDING_PAYMENT,
      metadata: { preferenceId: preference.id ?? null, checkoutUrl },
    },
  });

  // Recuperacion de checkout abandonado (spec, seccion 9.5): 1 h, 24 h y 72 h.
  // Todas comparten cancelKey, asi el pago las apaga de una sola vez.
  if (order.contactId) {
    for (const hours of [1, 24, 72]) {
      await scheduleAction({
        workspaceId: input.workspaceId,
        contactId: order.contactId,
        type: ScheduledActionType.CHECKOUT_RECOVERY,
        runAt: new Date(Date.now() + hours * 3_600_000),
        cancelKey: recoveryKeyFor(order.id),
        payload: { orderId: order.id, attempt: hours },
      });
    }
  }

  await recordAudit({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: 'order.checkout_created',
    entity: 'CustomerOrder',
    entityId: order.id,
    metadata: { preferenceId: preference.id ?? null, total: order.total },
  });

  return { checkoutUrl, orderId: order.id };
}

/**
 * Registra un pago del proveedor de forma idempotente.
 *
 * El unique de `Payment.externalId` es lo que impide que diez reentregas del
 * webhook produzcan diez pagos. Devuelve `alreadyProcessed` para que el
 * llamador sepa que no debe volver a entregar nada.
 */
export async function upsertPayment(input: {
  workspaceId: string;
  orderId: string | null;
  externalId: string;
  status: PaymentStatus;
  rawStatus?: string;
  amount: number;
  currency: string;
  payerEmail?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const existing = await prisma.payment.findUnique({
    where: { externalId: input.externalId },
    select: { id: true, status: true, workspaceId: true },
  });

  if (existing) {
    // Un pago ya aprobado no se reprocesa; los demas estados si pueden avanzar.
    if (existing.status === PaymentStatus.APPROVED) {
      return { payment: existing, alreadyProcessed: true };
    }

    const updated = await prisma.payment.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        rawStatus: input.rawStatus,
        approvedAt: input.status === PaymentStatus.APPROVED ? new Date() : null,
      },
      select: { id: true, status: true, workspaceId: true },
    });

    return { payment: updated, alreadyProcessed: false };
  }

  const created = await prisma.payment.create({
    data: {
      workspaceId: input.workspaceId,
      orderId: input.orderId,
      provider: PaymentProvider.MERCADO_PAGO,
      externalId: input.externalId,
      status: input.status,
      rawStatus: input.rawStatus,
      amount: input.amount,
      currency: input.currency,
      payerEmail: input.payerEmail ?? null,
      metadata: input.metadata as never,
      approvedAt: input.status === PaymentStatus.APPROVED ? new Date() : null,
    },
    select: { id: true, status: true, workspaceId: true },
  });

  return { payment: created, alreadyProcessed: false };
}

/** Cancela la recuperacion de checkout de un pedido. */
export async function cancelCheckoutRecovery(workspaceId: string, orderId: string, reason: string) {
  return cancelByKey({ workspaceId, cancelKey: recoveryKeyFor(orderId), reason });
}
