import { OrderStatus, PaymentStatus, ProductStatus } from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { createOrderProviderCheckout } from './checkout';
import { isAllowedPaymentRedirect, maskEmail, verifyCheckoutToken } from './public-checkout-link';

/**
 * Checkout PUBLICO de un pedido: `/checkout/[id]?t=<token>`.
 *
 * Es la pagina a la que vuelve el comprador desde Mercado Pago (back_urls) y
 * desde la que puede iniciar o reintentar el pago. Sirve a cualquier workspace:
 * todo sale del pedido persistido, nada del cliente ni de un negocio concreto.
 *
 * Reglas:
 *  - El id solo no basta: el enlace lleva un token HMAC atado al pedido y con
 *    vencimiento. Sin token valido no se muestra nada del comprador.
 *  - Precio, moneda y producto salen del pedido guardado. El formulario de pago
 *    no envia montos: solo el token.
 *  - El estado mostrado sale de la base (pedido + pagos). Lo que Mercado Pago
 *    agrega a la URL de retorno solo elige el texto mientras llega el webhook.
 *  - Se cobra con la conexion de Mercado Pago DEL WORKSPACE del pedido
 *    (createOrderProviderCheckout), nunca con la cuenta SaaS de Upzites.
 *  - Por ahora, un solo item y sin descuentos (lo que cobra la preferencia es
 *    exactamente el total del pedido).
 */

/** Una preferencia ya creada se reutiliza durante este tiempo (doble clic, volver atras). */
export const PREFERENCE_REUSE_MS = 24 * 3_600_000;

export type PublicCheckoutState = 'PAYABLE' | 'PENDING' | 'PAID';
export type PublicCheckoutUnavailable = 'NOT_FOUND' | 'EXPIRED' | 'UNAVAILABLE';

export type PublicCheckoutView =
  | { ok: false; reason: PublicCheckoutUnavailable }
  | {
      ok: true;
      orderId: string;
      workspaceName: string;
      item: { name: string; quantity: number; unitPrice: number };
      total: number;
      currency: string;
      buyer: { name: string | null; email: string | null };
      state: PublicCheckoutState;
    };

const PAID_STATUSES: OrderStatus[] = [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.FULFILLED];
const PAYABLE_STATUSES: OrderStatus[] = [OrderStatus.DRAFT, OrderStatus.PENDING_PAYMENT];

async function loadOrder(orderId: string) {
  return prisma.customerOrder.findUnique({
    where: { id: orderId },
    include: {
      workspace: { select: { name: true } },
      contact: { select: { firstName: true, lastName: true, email: true } },
      lines: { include: { variant: { select: { id: true, isActive: true, product: { select: { workspaceId: true, status: true } } } } } },
      payments: { select: { status: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
}

type LoadedOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

/**
 * Coherencia del pedido para cobrarlo en publico: un item de un producto
 * ACTIVO del MISMO workspace, sin descuento, con total positivo y consistente.
 */
function isSellable(order: LoadedOrder) {
  if (order.lines.length !== 1) return false;
  const [line] = order.lines;
  const product = line.variant?.product;
  if (!product || !line.variant?.isActive || product.workspaceId !== order.workspaceId || product.status !== ProductStatus.ACTIVE) return false;
  if (line.quantity < 1 || line.total !== line.unitPrice * line.quantity) return false;
  return order.discount === 0 && order.total > 0 && order.total === line.total;
}

function stateOf(order: LoadedOrder): PublicCheckoutState | null {
  if (PAID_STATUSES.includes(order.status)) return 'PAID';
  if (!PAYABLE_STATUSES.includes(order.status)) return null;
  return order.payments[0]?.status === PaymentStatus.PENDING ? 'PENDING' : 'PAYABLE';
}

export async function loadPublicCheckout(orderId: string, token: string | null | undefined, now = new Date()): Promise<PublicCheckoutView> {
  const check = verifyCheckoutToken(orderId, token, now);
  if (!check.ok) return { ok: false, reason: check.reason === 'EXPIRED' ? 'EXPIRED' : 'NOT_FOUND' };

  const order = await loadOrder(orderId);
  if (!order) return { ok: false, reason: 'NOT_FOUND' };

  const state = stateOf(order);
  // Un pedido ya pagado se muestra como pagado aunque luego se archive el producto.
  if (!state || (state !== 'PAID' && !isSellable(order))) return { ok: false, reason: 'UNAVAILABLE' };

  const [line] = order.lines;
  const contactName = order.contact ? `${order.contact.firstName} ${order.contact.lastName ?? ''}`.trim() : '';
  return {
    ok: true,
    orderId: order.id,
    workspaceName: order.workspace.name,
    item: { name: line.name, quantity: line.quantity, unitPrice: line.unitPrice },
    total: order.total,
    currency: order.currency,
    buyer: { name: contactName || order.customerName || null, email: maskEmail(order.contact?.email ?? order.customerEmail) },
    state,
  };
}

export type StartPaymentResult =
  | { ok: true; redirectUrl: string; reused: boolean }
  | { ok: false; reason: PublicCheckoutUnavailable | 'ALREADY_PAID' | 'PENDING' | 'PAYMENTS_UNAVAILABLE' };

/**
 * Inicia (o retoma) el pago de un pedido desde el checkout publico.
 *
 * Idempotente: bajo un lock por pedido, si ya hay una preferencia reciente se
 * reutiliza en vez de crear otra (un doble clic no genera dos preferencias ni
 * duplica la recuperacion de checkout).
 */
export async function startPublicCheckoutPayment(orderId: string, token: string | null | undefined, now = new Date()): Promise<StartPaymentResult> {
  const check = verifyCheckoutToken(orderId, token, now);
  if (!check.ok) return { ok: false, reason: check.reason === 'EXPIRED' ? 'EXPIRED' : 'NOT_FOUND' };

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`public_checkout:${orderId}`}, 0))`;

      const order = await loadOrder(orderId);
      if (!order) return { ok: false, reason: 'NOT_FOUND' } as const;
      const state = stateOf(order);
      if (state === 'PAID') return { ok: false, reason: 'ALREADY_PAID' } as const;
      if (state === 'PENDING') return { ok: false, reason: 'PENDING' } as const;
      if (!state || !isSellable(order)) return { ok: false, reason: 'UNAVAILABLE' } as const;

      const metadata = (order.metadata ?? {}) as { checkoutUrl?: unknown; checkoutCreatedAt?: unknown };
      const createdAt = typeof metadata.checkoutCreatedAt === 'string' ? Date.parse(metadata.checkoutCreatedAt) : Number.NaN;
      if (
        order.status === OrderStatus.PENDING_PAYMENT &&
        typeof metadata.checkoutUrl === 'string' &&
        Number.isFinite(createdAt) &&
        now.getTime() - createdAt < PREFERENCE_REUSE_MS &&
        isAllowedPaymentRedirect(metadata.checkoutUrl)
      ) {
        return { ok: true, redirectUrl: metadata.checkoutUrl, reused: true } as const;
      }

      try {
        const checkout = await createOrderProviderCheckout({ workspaceId: order.workspaceId, orderId: order.id });
        if (!isAllowedPaymentRedirect(checkout.providerUrl)) return { ok: false, reason: 'PAYMENTS_UNAVAILABLE' } as const;
        return { ok: true, redirectUrl: checkout.providerUrl, reused: false } as const;
      } catch (error) {
        // Sin conexion de Mercado Pago, sin entitlement o proveedor caido: al
        // comprador solo se le dice que el pago no esta disponible.
        console.error('public_checkout_start_failed', { orderId, error: error instanceof Error ? error.message : String(error) });
        return { ok: false, reason: 'PAYMENTS_UNAVAILABLE' } as const;
      }
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}
