/**
 * QA visual del Punto 7 (solo base de pruebas): crea un pedido PENDIENTE del
 * lead con un producto activo del workspace. El pago se hace despues por el
 * checkout demo (simulado y marcado), nunca por Mercado Pago real.
 */
import { prisma } from '../../src/lib/prisma';

const [workspaceId, contactId] = process.argv.slice(2);
if (!workspaceId || !contactId) throw new Error('Uso: p7-order.ts <workspaceId> <contactId>');

const variant = await prisma.productVariant.findFirstOrThrow({
  where: { isActive: true, product: { workspaceId, status: 'ACTIVE' } },
  include: { product: { select: { name: true, currency: true } } },
});
const order = await prisma.customerOrder.create({
  data: {
    workspaceId,
    contactId,
    status: 'PENDING_PAYMENT',
    currency: variant.product.currency,
    subtotal: variant.priceMinor,
    total: variant.priceMinor,
    metadata: { fake: true },
    lines: { create: { variantId: variant.id, name: variant.product.name, unitPrice: variant.priceMinor, quantity: 1, total: variant.priceMinor } },
  },
});
console.log(JSON.stringify({ orderId: order.id, product: variant.product.name, total: order.total }));
await prisma.$disconnect();
