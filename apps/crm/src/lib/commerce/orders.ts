import {
  CommerceProvider,
  OrderStatus,
  ProductStatus,
  type Prisma,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { recordAudit } from '../domain/audit';

/**
 * Creacion y consulta de pedidos del catalogo interno.
 *
 * Regla central: **el precio lo pone el servidor**, siempre. Ni el agente ni el
 * cliente pueden proponerlo. Cada linea guarda un snapshot del nombre, sku y
 * precio unitario al momento de la compra, para que cambiar el catalogo manana
 * no reescriba lo que alguien ya pago.
 */
export class OrderError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'INACTIVE' | 'OUT_OF_STOCK' | 'EMPTY' | 'INVALID_STATE',
  ) {
    super(message);
    this.name = 'OrderError';
  }
}

export type CreateOrderInput = {
  workspaceId: string;
  contactId?: string | null;
  conversationId?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  items: { variantId: string; quantity: number }[];
  notes?: string;
  actorId?: string | null;
};

export async function createOrder(input: CreateOrderInput) {
  if (input.items.length === 0) {
    throw new OrderError('El pedido no tiene lineas.', 'EMPTY');
  }

  // Se leen las variantes acotadas al workspace: un id de otro tenant no
  // resuelve, y el pedido falla en vez de mezclar catalogos.
  const variants = await prisma.productVariant.findMany({
    where: {
      id: { in: input.items.map((item) => item.variantId) },
      product: { workspaceId: input.workspaceId },
    },
    include: { product: true },
  });

  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  const lines: Prisma.OrderLineCreateWithoutOrderInput[] = [];
  let subtotal = 0;

  for (const item of input.items) {
    const variant = byId.get(item.variantId);
    if (!variant) throw new OrderError(`La variante ${item.variantId} no existe.`, 'NOT_FOUND');

    if (!variant.isActive || variant.product.status !== ProductStatus.ACTIVE) {
      throw new OrderError(`${variant.product.name} no esta disponible.`, 'INACTIVE');
    }

    // inventory null = sin control de stock (lo normal en un digital).
    if (variant.inventory !== null && variant.inventory < item.quantity) {
      throw new OrderError(`${variant.product.name} no tiene stock suficiente.`, 'OUT_OF_STOCK');
    }

    const quantity = Math.max(1, Math.floor(item.quantity));
    const total = variant.priceClp * quantity;
    subtotal += total;

    lines.push({
      variant: { connect: { id: variant.id } },
      name: `${variant.product.name}${variant.isDefault ? '' : ` — ${variant.name}`}`,
      sku: variant.sku,
      unitPrice: variant.priceClp,
      quantity,
      total,
    });
  }

  const order = await prisma.customerOrder.create({
    data: {
      workspaceId: input.workspaceId,
      provider: CommerceProvider.INTERNAL,
      contactId: input.contactId ?? null,
      conversationId: input.conversationId ?? null,
      customerEmail: input.customerEmail ?? null,
      customerName: input.customerName ?? null,
      notes: input.notes,
      status: OrderStatus.DRAFT,
      subtotal,
      total: subtotal,
      lines: { create: lines },
    },
    include: { lines: true },
  });

  await recordAudit({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: 'order.created',
    entity: 'CustomerOrder',
    entityId: order.id,
    metadata: { total: order.total, lines: order.lines.length },
  });

  return order;
}

/** Pedido del workspace, o null. Nunca resuelve un pedido de otro tenant. */
export async function getOrder(workspaceId: string, orderId: string) {
  return prisma.customerOrder.findFirst({
    where: { id: orderId, workspaceId },
    include: {
      lines: true,
      payments: { orderBy: { createdAt: 'desc' } },
      fulfillments: true,
      deliveries: { include: { asset: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
}

export async function cancelOrder(input: { workspaceId: string; orderId: string; reason?: string; actorId?: string }) {
  const order = await prisma.customerOrder.findFirst({
    where: { id: input.orderId, workspaceId: input.workspaceId },
    select: { id: true, status: true },
  });

  if (!order) throw new OrderError('Pedido no encontrado.', 'NOT_FOUND');

  // Un pedido ya confirmado no se cancela por esta via: eso es una devolucion,
  // que es otro flujo y toca el dinero.
  if (order.status === OrderStatus.CONFIRMED || order.status === OrderStatus.FULFILLED) {
    throw new OrderError('El pedido ya fue pagado. Una devolucion es otro proceso.', 'INVALID_STATE');
  }

  await prisma.customerOrder.update({
    where: { id: order.id },
    data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
  });

  await recordAudit({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: 'order.cancelled',
    entity: 'CustomerOrder',
    entityId: order.id,
    metadata: { reason: input.reason ?? null },
  });

  return { cancelled: true };
}

/** Catalogo activo del workspace, para el agente y la UI. */
export async function listCatalog(workspaceId: string, query?: string) {
  return prisma.product.findMany({
    where: {
      workspaceId,
      status: ProductStatus.ACTIVE,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: {
      variants: { where: { isActive: true }, orderBy: { priceClp: 'asc' } },
      assets: { select: { id: true, kind: true, name: true } },
    },
    orderBy: { name: 'asc' },
    take: 25,
  });
}
