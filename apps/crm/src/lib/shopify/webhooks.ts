import {
  ActivityType,
  CommerceProvider,
  FulfillmentStatus,
  FulfillmentType,
  IntegrationProvider,
  IntegrationStatus,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  WebhookEventStatus,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { recordAudit } from '../domain/audit';
import { applyApprovedPayment } from '../domain';
import { upsertShopifyOrder } from './orders';

export const SHOPIFY_PROVIDER = 'shopify';

/**
 * Procesamiento de webhooks de Shopify.
 *
 * Se suscribe solo a lo necesario (spec, seccion 14): pedidos, pagos,
 * fulfillment y desinstalacion. Cada evento se persiste antes de procesarse,
 * con la misma idempotencia que los de Meta.
 */
export const SHOPIFY_TOPICS = [
  'orders/create',
  'orders/paid',
  'orders/cancelled',
  'fulfillments/create',
  'app/uninstalled',
] as const;

export type ShopifyTopic = (typeof SHOPIFY_TOPICS)[number];

export type IngestResult = { eventId: string; duplicate: boolean };

/**
 * Persiste el evento de forma idempotente.
 *
 * `X-Shopify-Webhook-Id` es unico por entrega, no por evento: dos entregas del
 * mismo pedido traen ids distintos. Por eso la clave combina topic + shop +
 * id del recurso, que es lo que identifica al HECHO.
 */
export async function ingestShopifyWebhook(input: {
  topic: string;
  shop: string;
  payload: Record<string, unknown>;
}): Promise<IngestResult> {
  const resourceId = String(input.payload.id ?? input.payload.admin_graphql_api_id ?? '');
  const dedupeKey = `${input.topic}:${input.shop}:${resourceId}`;

  const existing = await prisma.webhookEvent.findUnique({
    where: { provider_dedupeKey: { provider: SHOPIFY_PROVIDER, dedupeKey } },
    select: { id: true },
  });

  if (existing) return { eventId: existing.id, duplicate: true };

  try {
    const created = await prisma.webhookEvent.create({
      data: {
        provider: SHOPIFY_PROVIDER,
        dedupeKey,
        externalId: resourceId || null,
        payload: { topic: input.topic, shop: input.shop, body: input.payload } as never,
        status: WebhookEventStatus.PENDING,
      },
    });
    return { eventId: created.id, duplicate: false };
  } catch {
    const raced = await prisma.webhookEvent.findUnique({
      where: { provider_dedupeKey: { provider: SHOPIFY_PROVIDER, dedupeKey } },
      select: { id: true },
    });
    if (raced) return { eventId: raced.id, duplicate: true };
    throw new Error('No se pudo persistir el evento de Shopify.');
  }
}

export type ProcessResult = { handled: boolean; reason?: string; orderId?: string };

/**
 * Resuelve el workspace por el dominio de la tienda.
 *
 * Misma regla que en WhatsApp: el tenant NUNCA sale del payload. El unico
 * vinculo confiable es el dominio, registrado al conectar.
 */
async function resolveConnection(shop: string) {
  return prisma.commerceConnection.findFirst({
    where: { provider: CommerceProvider.SHOPIFY, shopDomain: shop.toLowerCase() },
    select: { id: true, workspaceId: true, status: true },
  });
}

export async function processShopifyEvent(eventId: string): Promise<ProcessResult> {
  const event = await prisma.webhookEvent.findUnique({ where: { id: eventId } });

  if (!event || event.status === WebhookEventStatus.PROCESSED) {
    return { handled: false, reason: 'ya procesado' };
  }

  await prisma.webhookEvent.update({
    where: { id: event.id },
    data: { status: WebhookEventStatus.PROCESSING, attempts: { increment: 1 } },
  });

  const stored = event.payload as { topic: string; shop: string; body: Record<string, unknown> };

  try {
    const connection = await resolveConnection(stored.shop);

    if (!connection) {
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: WebhookEventStatus.IGNORED, processedAt: new Date() },
      });
      return { handled: false, reason: 'tienda no registrada' };
    }

    const result = await applyTopic(stored.topic, connection, stored.body);

    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: WebhookEventStatus.PROCESSED, processedAt: new Date(), error: null },
    });

    return result;
  } catch (error) {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: WebhookEventStatus.FAILED,
        error: error instanceof Error ? error.message : 'error desconocido',
      },
    });
    throw error;
  }
}

function toAmount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

async function applyTopic(
  topic: string,
  connection: { id: string; workspaceId: string },
  body: Record<string, unknown>,
): Promise<ProcessResult> {
  const { workspaceId } = connection;

  switch (topic) {
    case 'orders/create':
    case 'orders/paid': {
      const externalId = String(body.admin_graphql_api_id ?? body.id ?? '');
      if (!externalId) return { handled: false, reason: 'pedido sin id' };

      const paid = topic === 'orders/paid' || body.financial_status === 'paid';
      const customer = (body.customer ?? {}) as Record<string, unknown>;
      const total = toAmount(body.total_price);

      const { order, previousStatus } = await upsertShopifyOrder({
        workspaceId,
        externalId,
        status: paid ? OrderStatus.CONFIRMED : OrderStatus.PENDING_PAYMENT,
        total,
        currency: String(body.currency ?? 'CLP'),
        email: body.email ? String(body.email) : null,
        name: customer.first_name ? `${customer.first_name} ${customer.last_name ?? ''}`.trim() : null,
      });

      // Los efectos comerciales corren UNA sola vez: si el pedido ya estaba
      // confirmado, una reentrega no vuelve a convertir en cliente.
      if (paid && previousStatus !== OrderStatus.CONFIRMED) {
        await prisma.payment.upsert({
          where: { externalId: `shopify:${externalId}` },
          create: {
            workspaceId,
            orderId: order.id,
            provider: PaymentProvider.SHOPIFY,
            externalId: `shopify:${externalId}`,
            status: PaymentStatus.APPROVED,
            rawStatus: String(body.financial_status ?? 'paid'),
            amount: total,
            currency: String(body.currency ?? 'CLP'),
            payerEmail: body.email ? String(body.email) : null,
            approvedAt: new Date(),
          },
          update: {},
        });

        if (order.contactId) {
          await applyApprovedPayment({
            workspaceId,
            contactId: order.contactId,
            paymentId: `shopify:${externalId}`,
            amount: total,
          });

          await prisma.activity.create({
            data: {
              workspaceId,
              contactId: order.contactId,
              type: ActivityType.DEAL,
              title: 'Pago confirmado en Shopify',
              description: `Pedido ${body.name ?? externalId} por ${total}.`,
            },
          });
        }

        await recordAudit({
          workspaceId,
          action: 'shopify.order_paid',
          entity: 'CustomerOrder',
          entityId: order.id,
          metadata: { externalId, total },
        });
      }

      return { handled: true, orderId: order.id };
    }

    case 'orders/cancelled': {
      const externalId = String(body.admin_graphql_api_id ?? body.id ?? '');
      const updated = await prisma.customerOrder.updateMany({
        where: { workspaceId, provider: CommerceProvider.SHOPIFY, externalId },
        data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
      });
      return { handled: updated.count > 0, reason: updated.count === 0 ? 'pedido desconocido' : undefined };
    }

    case 'fulfillments/create': {
      const orderExternalId = String(body.order_id ?? '');
      const order = await prisma.customerOrder.findFirst({
        where: {
          workspaceId,
          provider: CommerceProvider.SHOPIFY,
          externalId: { contains: orderExternalId },
        },
        select: { id: true },
      });

      if (!order) return { handled: false, reason: 'pedido desconocido' };

      await prisma.fulfillmentOrder.create({
        data: {
          orderId: order.id,
          type: FulfillmentType.SHIPPING,
          status: FulfillmentStatus.FULFILLED,
          trackingUrl: body.tracking_url ? String(body.tracking_url) : null,
          deliveredAt: new Date(),
          metadata: { shopifyFulfillmentId: body.id ?? null },
        },
      });

      await prisma.customerOrder.update({
        where: { id: order.id },
        data: { status: OrderStatus.FULFILLED },
      });

      return { handled: true, orderId: order.id };
    }

    /**
     * Desinstalacion: el token deja de servir en el instante en que el cliente
     * desinstala. Se borra y la conexion queda inactiva; el historial de
     * pedidos se conserva.
     */
    case 'app/uninstalled': {
      await prisma.commerceConnection.update({
        where: { id: connection.id },
        data: { status: 'DISCONNECTED', accessTokenEncrypted: null },
      });

      await prisma.integration.updateMany({
        where: { workspaceId, provider: IntegrationProvider.SHOPIFY },
        data: { status: IntegrationStatus.DISCONNECTED },
      });

      await recordAudit({
        workspaceId,
        action: 'shopify.app_uninstalled',
        entity: 'CommerceConnection',
        entityId: connection.id,
      });

      return { handled: true };
    }

    default:
      return { handled: false, reason: `topic no manejado: ${topic}` };
  }
}
