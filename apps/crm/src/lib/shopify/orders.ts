import {
  CommerceProvider,
  OrderStatus,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { recordAudit } from '../domain/audit';
import { DRAFT_ORDER_MUTATION, type GraphQLFetcher } from './client';
import { fetchLiveVariant } from './sync';

/**
 * Venta de productos Shopify iniciada desde una conversacion.
 *
 * El pedido se crea como Draft Order en Shopify y el cliente paga con el enlace
 * que devuelve la tienda. El CRM guarda su propia copia para el historial, pero
 * **la tienda es la fuente de verdad** del precio, el stock y el estado.
 */
export class ShopifyOrderError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'OUT_OF_STOCK' | 'PRICE_CHANGED' | 'PROVIDER',
  ) {
    super(message);
    this.name = 'ShopifyOrderError';
  }
}

export type ShopifyCheckoutInput = {
  workspaceId: string;
  connectionId: string;
  fetcher: GraphQLFetcher;
  externalVariantId: string;
  quantity: number;
  contactId?: string | null;
  conversationId?: string | null;
  email?: string | null;
  /** Precio que el agente le dijo al cliente. Si cambio, se aborta. */
  quotedPriceClp?: number;
};

export async function createShopifyCheckout(input: ShopifyCheckoutInput) {
  // Paso obligatorio: precio e inventario VIVOS antes de vender.
  const live = await fetchLiveVariant(input.fetcher, input.externalVariantId);

  if (!live) {
    throw new ShopifyOrderError('Ese producto ya no existe en la tienda.', 'NOT_FOUND');
  }

  if (!live.availableForSale) {
    throw new ShopifyOrderError(`${live.productTitle} no esta disponible.`, 'OUT_OF_STOCK');
  }

  if (live.inventory !== null && live.inventory < input.quantity) {
    throw new ShopifyOrderError(
      `${live.productTitle} no tiene stock suficiente (quedan ${live.inventory}).`,
      'OUT_OF_STOCK',
    );
  }

  // Si el agente cotizo un precio y la tienda ahora dice otro, se aborta en vez
  // de cobrar distinto de lo prometido.
  if (input.quotedPriceClp !== undefined && input.quotedPriceClp !== live.priceClp) {
    await recordAudit({
      workspaceId: input.workspaceId,
      action: 'shopify.price_changed_before_checkout',
      entity: 'CommerceConnection',
      entityId: input.connectionId,
      metadata: { quoted: input.quotedPriceClp, live: live.priceClp, variant: live.externalId },
    });
    throw new ShopifyOrderError(
      `El precio cambio: ahora es ${live.priceClp}. Confirmalo con el cliente antes de continuar.`,
      'PRICE_CHANGED',
    );
  }

  const data = await input.fetcher(DRAFT_ORDER_MUTATION, {
    input: {
      lineItems: [{ variantId: live.externalId, quantity: input.quantity }],
      ...(input.email ? { email: input.email } : {}),
      tags: ['upzites-crm'],
    },
  });

  const payload = (data.draftOrderCreate ?? {}) as Record<string, unknown>;
  const userErrors = Array.isArray(payload.userErrors) ? payload.userErrors : [];

  if (userErrors.length > 0) {
    const first = userErrors[0] as Record<string, unknown>;
    throw new ShopifyOrderError(String(first.message ?? 'Shopify rechazo el pedido.'), 'PROVIDER');
  }

  const draft = payload.draftOrder as Record<string, unknown> | null;
  const invoiceUrl = draft?.invoiceUrl ? String(draft.invoiceUrl) : null;

  if (!draft?.id || !invoiceUrl) {
    throw new ShopifyOrderError('Shopify no devolvio un enlace de pago.', 'PROVIDER');
  }

  const total = live.priceClp * input.quantity;
  const externalId = String(draft.id);

  // Copia local del pedido, idempotente por (workspace, proveedor, id externo).
  const order = await prisma.customerOrder.upsert({
    where: {
      workspaceId_provider_externalId: {
        workspaceId: input.workspaceId,
        provider: CommerceProvider.SHOPIFY,
        externalId,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      provider: CommerceProvider.SHOPIFY,
      externalId,
      contactId: input.contactId ?? null,
      conversationId: input.conversationId ?? null,
      customerEmail: input.email ?? null,
      status: OrderStatus.PENDING_PAYMENT,
      subtotal: total,
      total,
      metadata: { draftOrderName: draft.name ?? null, invoiceUrl },
      lines: {
        create: {
          name: `${live.productTitle}${live.title && live.title !== 'Default Title' ? ` — ${live.title}` : ''}`,
          sku: live.sku,
          unitPrice: live.priceClp,
          quantity: input.quantity,
          total,
        },
      },
    },
    update: { metadata: { draftOrderName: draft.name ?? null, invoiceUrl } },
  });

  await recordAudit({
    workspaceId: input.workspaceId,
    action: 'shopify.draft_order_created',
    entity: 'CustomerOrder',
    entityId: order.id,
    metadata: { externalId, total, variant: live.externalId },
  });

  return {
    orderId: order.id,
    checkoutUrl: invoiceUrl,
    totalClp: total,
    unitPriceClp: live.priceClp,
    productName: live.productTitle,
  };
}

/**
 * Aplica un evento de pedido recibido por webhook.
 *
 * Idempotente por `(workspaceId, provider, externalId)`: una reentrega del
 * mismo webhook actualiza la copia local en vez de crear otra.
 */
export async function upsertShopifyOrder(input: {
  workspaceId: string;
  externalId: string;
  status: OrderStatus;
  total: number;
  currency: string;
  email?: string | null;
  name?: string | null;
}) {
  const existing = await prisma.customerOrder.findUnique({
    where: {
      workspaceId_provider_externalId: {
        workspaceId: input.workspaceId,
        provider: CommerceProvider.SHOPIFY,
        externalId: input.externalId,
      },
    },
    select: { id: true, status: true, contactId: true },
  });

  const order = await prisma.customerOrder.upsert({
    where: {
      workspaceId_provider_externalId: {
        workspaceId: input.workspaceId,
        provider: CommerceProvider.SHOPIFY,
        externalId: input.externalId,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      provider: CommerceProvider.SHOPIFY,
      externalId: input.externalId,
      status: input.status,
      subtotal: input.total,
      total: input.total,
      currency: input.currency,
      customerEmail: input.email ?? null,
      customerName: input.name ?? null,
    },
    update: {
      status: input.status,
      total: input.total,
      currency: input.currency,
      ...(input.status === OrderStatus.CONFIRMED ? { confirmedAt: new Date() } : {}),
    },
  });

  return { order, wasExisting: Boolean(existing), previousStatus: existing?.status ?? null };
}
