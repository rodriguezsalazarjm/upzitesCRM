import { OrderStatus, PaymentStatus, ProductStatus, type Prisma } from '../../../generated/prisma/client';
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
      bump: { name: string; unitPrice: number; selected: boolean } | null;
      total: number;
      currency: string;
      buyer: { name: string | null; email: string | null };
      state: PublicCheckoutState;
    };

const PAID_STATUSES: OrderStatus[] = [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.FULFILLED];
const PAYABLE_STATUSES: OrderStatus[] = [OrderStatus.DRAFT, OrderStatus.PENDING_PAYMENT];

type DbClient = typeof prisma | Prisma.TransactionClient;

async function loadOrder(orderId: string, db: DbClient = prisma) {
  return db.customerOrder.findUnique({
    where: { id: orderId },
    include: {
      workspace: { select: { name: true } },
      contact: { select: { firstName: true, lastName: true, email: true } },
      lines: { include: { variant: { select: { id: true, priceClp: true, isActive: true, product: { select: { workspaceId: true, status: true, currency: true, metadata: true } } } } } },
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
  if (order.lines.length < 1 || order.lines.length > 2) return false;
  const line = mainLine(order);
  if (!line) return false;
  const product = line.variant?.product;
  if (!product || !line.variant?.isActive || product.workspaceId !== order.workspaceId || product.status !== ProductStatus.ACTIVE) return false;
  if (line.quantity < 1 || line.total !== line.unitPrice * line.quantity) return false;
  if (order.discount !== 0 || order.total <= 0 || order.total !== order.lines.reduce((sum, item) => sum + item.total, 0)) return false;
  return order.lines.every((item) => item.quantity === 1 && item.total === item.unitPrice && item.variant?.isActive && item.variant.product.workspaceId === order.workspaceId && item.variant.product.status === ProductStatus.ACTIVE && item.variant.product.currency === order.currency);
}

type CheckoutMetadata = {
  mainVariantId?: unknown;
  bumpVariantId?: unknown;
  bumpSelected?: unknown;
  checkoutUrl?: unknown;
  checkoutCreatedAt?: unknown;
  preferenceId?: unknown;
  preferenceTotal?: unknown;
  [key: string]: unknown;
};

function metadataOf(order: { metadata: unknown }): CheckoutMetadata {
  return order.metadata && typeof order.metadata === 'object' && !Array.isArray(order.metadata)
    ? { ...(order.metadata as CheckoutMetadata) }
    : {};
}

function configuredBumpVariantId(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const bump = (metadata as { orderBump?: unknown }).orderBump;
  if (!bump || typeof bump !== 'object' || Array.isArray(bump)) return null;
  const variantId = (bump as { variantId?: unknown }).variantId;
  return typeof variantId === 'string' && variantId.length > 0 ? variantId : null;
}

function mainLine(order: LoadedOrder) {
  const configured = metadataOf(order).mainVariantId;
  if (typeof configured === 'string') return order.lines.find((line) => line.variantId === configured) ?? null;
  return order.lines.length === 1 ? order.lines[0] : null;
}

async function resolveBump(order: LoadedOrder, db: DbClient = prisma) {
  const main = mainLine(order);
  const bumpVariantId = configuredBumpVariantId(main?.variant?.product.metadata);
  if (!main || !bumpVariantId || bumpVariantId === main.variantId) return null;
  const variant = await db.productVariant.findFirst({
    where: {
      id: bumpVariantId,
      isActive: true,
      product: { workspaceId: order.workspaceId, status: ProductStatus.ACTIVE, currency: order.currency },
    },
    include: { product: { select: { name: true } } },
  });
  if (!variant || variant.priceClp <= 0) return null;
  return { variantId: variant.id, name: variant.product.name, unitPrice: variant.priceClp };
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

  const line = mainLine(order)!;
  const bump = await resolveBump(order);
  const selected = bump ? order.lines.some((item) => item.variantId === bump.variantId) : false;
  const contactName = order.contact ? `${order.contact.firstName} ${order.contact.lastName ?? ''}`.trim() : '';
  return {
    ok: true,
    orderId: order.id,
    workspaceName: order.workspace.name,
    item: { name: line.name, quantity: line.quantity, unitPrice: line.unitPrice },
    bump: bump ? { name: bump.name, unitPrice: bump.unitPrice, selected } : null,
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
export async function startPublicCheckoutPayment(
  orderId: string,
  token: string | null | undefined,
  includeBumpOrNow: boolean | Date = false,
  nowArg = new Date(),
): Promise<StartPaymentResult> {
  const includeBump = typeof includeBumpOrNow === 'boolean' ? includeBumpOrNow : false;
  const now = includeBumpOrNow instanceof Date ? includeBumpOrNow : nowArg;
  const check = verifyCheckoutToken(orderId, token, now);
  if (!check.ok) return { ok: false, reason: check.reason === 'EXPIRED' ? 'EXPIRED' : 'NOT_FOUND' };

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`public_checkout:${orderId}`}, 0))`;

      let order = await loadOrder(orderId, tx);
      if (!order) return { ok: false, reason: 'NOT_FOUND' } as const;
      const state = stateOf(order);
      if (state === 'PAID') return { ok: false, reason: 'ALREADY_PAID' } as const;
      if (state === 'PENDING') return { ok: false, reason: 'PENDING' } as const;
      if (!state || !isSellable(order)) return { ok: false, reason: 'UNAVAILABLE' } as const;

      const main = mainLine(order);
      const bump = await resolveBump(order, tx);
      if (!main || (includeBump && !bump)) return { ok: false, reason: 'UNAVAILABLE' } as const;
      const existingBump = bump ? order.lines.find((line) => line.variantId === bump.variantId) : null;
      if (order.lines.some((line) => line.id !== main.id && line.id !== existingBump?.id)) {
        return { ok: false, reason: 'UNAVAILABLE' } as const;
      }

      if (bump && includeBump && !existingBump) {
        await tx.orderLine.create({
          data: { orderId: order.id, variantId: bump.variantId, name: bump.name, unitPrice: bump.unitPrice, quantity: 1, total: bump.unitPrice },
        });
      } else if (bump && includeBump && existingBump && (existingBump.unitPrice !== bump.unitPrice || existingBump.name !== bump.name)) {
        await tx.orderLine.update({
          where: { id: existingBump.id },
          data: { name: bump.name, unitPrice: bump.unitPrice, quantity: 1, total: bump.unitPrice },
        });
      } else if (bump && !includeBump && existingBump) {
        await tx.orderLine.delete({ where: { id: existingBump.id } });
      }

      const total = main.total + (includeBump && bump ? bump.unitPrice : 0);
      const previousMetadata = metadataOf(order);
      const selectionChanged = total !== order.total || Boolean(existingBump) !== includeBump;
      const nextMetadata: CheckoutMetadata = {
        ...previousMetadata,
        mainVariantId: main.variantId,
        bumpVariantId: bump?.variantId ?? null,
        bumpSelected: includeBump && Boolean(bump),
      };
      if (selectionChanged) {
        delete nextMetadata.checkoutUrl;
        delete nextMetadata.checkoutCreatedAt;
        delete nextMetadata.preferenceId;
        delete nextMetadata.preferenceTotal;
      }
      await tx.customerOrder.update({
        where: { id: order.id },
        data: { subtotal: total, total, metadata: nextMetadata as Prisma.InputJsonValue },
      });
      order = (await loadOrder(orderId, tx))!;

      const metadata = metadataOf(order);
      const createdAt = typeof metadata.checkoutCreatedAt === 'string' ? Date.parse(metadata.checkoutCreatedAt) : Number.NaN;
      const preferenceTotal = typeof metadata.preferenceTotal === 'number' ? metadata.preferenceTotal : order.total;
      if (
        order.status === OrderStatus.PENDING_PAYMENT &&
        typeof metadata.checkoutUrl === 'string' &&
        Number.isFinite(createdAt) &&
        preferenceTotal === order.total &&
        now.getTime() - createdAt < PREFERENCE_REUSE_MS &&
        isAllowedPaymentRedirect(metadata.checkoutUrl)
      ) {
        return { ok: true, redirectUrl: metadata.checkoutUrl, reused: true } as const;
      }

      try {
        const checkout = await createOrderProviderCheckout({ workspaceId: order.workspaceId, orderId: order.id }, tx);
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
