import { prisma } from '../prisma';
import { currentDeliveryToken, defaultBaseUrl, deliveryUrl } from './delivery';

/**
 * Vista administrativa de la entrega de un pedido (OWNER/ADMIN): estado,
 * intentos, contenidos incluidos, revocacion e historial. El historial sale del
 * AuditLog existente (no hay otro sistema de logs) y nunca contiene tokens.
 */

const EVENT_TEXT: Record<string, string> = {
  'order.delivery_created': 'Entrega creada',
  'order.delivery_sent': 'Enviada',
  'order.delivery_failed': 'Envío fallido',
  'order.delivery_not_sent': 'Sin envío automático',
  'order.delivery_resent': 'Reenvío solicitado',
  'order.delivery_revoked': 'Acceso revocado',
};

export type DeliveryEvent = { id: string; at: Date; label: string; detail: string | null; actor: string | null };

function describe(action: string, metadata: unknown): string | null {
  const data = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {};
  if (action === 'order.delivery_created') return typeof data.items === 'number' ? `${data.items} contenido(s) incluidos.` : null;
  if (action === 'order.delivery_sent') {
    const channels = [data.whatsapp ? 'WhatsApp' : null, data.email ? (data.emailSimulated ? 'email simulado (sin envío real)' : 'email') : null].filter(Boolean);
    return channels.length ? `Por ${channels.join(' y ')}.` : null;
  }
  if (action === 'order.delivery_failed' || action === 'order.delivery_not_sent') return typeof data.error === 'string' ? data.error : null;
  return null;
}

export async function orderDeliveryView(workspaceId: string, orderId: string) {
  const order = await prisma.customerOrder.findFirst({
    where: { id: orderId, workspaceId },
    include: {
      lines: { orderBy: { id: 'asc' }, include: { variant: { select: { productId: true, product: { select: { type: true } } } } } },
      payments: { orderBy: { createdAt: 'desc' } },
      contact: { select: { firstName: true, lastName: true, email: true } },
      campaignRoute: { select: { name: true } },
      deliveries: { orderBy: { createdAt: 'asc' }, include: { items: { orderBy: { position: 'asc' } } } },
    },
  });
  if (!order) return null;

  const deliveryIds = order.deliveries.map((delivery) => delivery.id);
  const logs = deliveryIds.length
    ? await prisma.auditLog.findMany({
        where: { workspaceId, entity: 'DigitalDelivery', entityId: { in: deliveryIds }, action: { in: Object.keys(EVENT_TEXT) } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
    : [];
  const actorIds = [...new Set(logs.map((log) => log.actorId).filter((id): id is string => Boolean(id)))];
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
  const actorName = new Map(actors.map((actor) => [actor.id, actor.name]));

  const emptyAlert = await prisma.auditLog.findFirst({ where: { workspaceId, action: 'order.digital_delivery_empty', entityId: order.id }, select: { createdAt: true } });
  const baseUrl = defaultBaseUrl();

  return {
    order,
    noContentSold: emptyAlert?.createdAt ?? null,
    deliveries: order.deliveries.map((delivery) => {
      const token = delivery.status === 'REVOKED' ? null : currentDeliveryToken(delivery);
      return {
        id: delivery.id,
        status: delivery.status,
        createdAt: delivery.createdAt,
        attempts: delivery.attempts,
        lastAttemptAt: delivery.lastAttemptAt,
        lastError: delivery.lastError,
        sentAt: delivery.sentAt,
        revokedAt: delivery.revokedAt,
        expiresAt: delivery.expiresAt,
        lastAccessAt: delivery.lastAccessAt,
        downloadCount: delivery.downloadCount,
        /** Para copiar y mandar a mano cuando no hay canal. Solo se muestra a OWNER/ADMIN. */
        url: token ? deliveryUrl(baseUrl, token) : null,
        items: delivery.items.map((item) => ({ id: item.id, name: item.name, productName: item.productName, kind: item.kind, format: item.format, downloadCount: item.downloadCount })),
        events: logs
          .filter((log) => log.entityId === delivery.id)
          .map<DeliveryEvent>((log) => ({ id: log.id, at: log.createdAt, label: EVENT_TEXT[log.action] ?? log.action, detail: describe(log.action, log.metadata), actor: log.actorId ? (actorName.get(log.actorId) ?? 'Equipo') : null })),
      };
    }),
  };
}

export type OrderDeliveryView = NonNullable<Awaited<ReturnType<typeof orderDeliveryView>>>;
