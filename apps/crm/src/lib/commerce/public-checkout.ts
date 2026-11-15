import { OfferKind, OrderOfferStatus, OrderStatus, PaymentStatus, ProductStatus, Prisma } from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { recordAudit } from '../domain/audit';
import { assertFeature, isEntitlementError } from '../entitlements';
import { createOrderProviderCheckout } from './checkout';
import { currentDeliveryToken } from './delivery';
import { clearOtherBumpDecisions, recordOfferDecision, recordOfferShown, resolveOffer, type ResolvedOffer } from './offers/service';
import type { UpsellDecision } from './offers/rules';
import { isAllowedPaymentRedirect, maskEmail, publicCheckoutUrl, signCheckoutToken, verifyCheckoutToken } from './public-checkout-link';

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
 *    no envia montos: solo el token y la decision de sumar el bump.
 *  - El estado mostrado sale de la base (pedido + pagos). Lo que Mercado Pago
 *    agrega a la URL de retorno solo elige el texto mientras llega el webhook.
 *  - Se cobra con la conexion de Mercado Pago DEL WORKSPACE del pedido
 *    (createOrderProviderCheckout), nunca con la cuenta SaaS de Upzites.
 *  - Sin descuentos: lo que cobra la preferencia es exactamente el total del
 *    pedido (producto principal + bump si se eligio).
 *
 * Punto 6: el bump sale de `ProductOffer` (prioridad, copy, precio especial) y,
 * con el pedido pagado, se ofrece el upsell postcompra. Aceptarlo crea un
 * pedido ADICIONAL (`metadata.source = 'upsell'`) con su propio pago: Checkout
 * Pro no permite volver a cobrar sin que el comprador autorice de nuevo.
 */

/** Una preferencia ya creada se reutiliza durante este tiempo (doble clic, volver atras). */
export const PREFERENCE_REUSE_MS = 24 * 3_600_000;

export type PublicCheckoutState = 'PAYABLE' | 'PENDING' | 'PAID';
export type PublicCheckoutUnavailable = 'NOT_FOUND' | 'EXPIRED' | 'UNAVAILABLE';

export type PublicBump = { offerId: string; name: string; headline: string; description: string | null; imageUrl: string | null; unitPrice: number; selected: boolean };

export type PublicUpsell =
  | { status: 'OPEN'; headline: string; description: string | null; imageUrl: string | null; name: string; unitPrice: number }
  | { status: 'ACCEPTED'; name: string; unitPrice: number; checkoutPath: string }
  | { status: 'PAID'; name: string; unitPrice: number; checkoutPath: string }
  | { status: 'DECLINED' };

export type PublicCheckoutView =
  | { ok: false; reason: PublicCheckoutUnavailable }
  | {
      ok: true;
      orderId: string;
      workspaceName: string;
      item: { name: string; quantity: number; unitPrice: number };
      bump: PublicBump | null;
      total: number;
      currency: string;
      buyer: { name: string | null; email: string | null };
      state: PublicCheckoutState;
      /** Pedido adicional creado al aceptar un upsell. */
      isUpsell: boolean;
      /** Solo con el pedido pagado (y si no es ya un upsell). */
      upsell: PublicUpsell | null;
      /**
       * Solo con el pedido pagado: enlace a la entrega digital (ruta relativa con
       * su token), o el motivo por el que no lo hay. null si no aplica.
       */
      delivery: { kind: 'READY'; path: string } | { kind: 'REVOKED' } | { kind: 'PENDING' } | null;
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
      lines: { include: { variant: { select: { id: true, productId: true, priceMinor: true, isActive: true, product: { select: { workspaceId: true, status: true, currency: true, metadata: true } } } } } },
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
  source?: unknown;
  mainVariantId?: unknown;
  bumpVariantId?: unknown;
  bumpOfferId?: unknown;
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

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Pedido adicional nacido de un upsell: no ofrece bump ni otro upsell (sin cadenas). */
function isUpsellOrder(order: { metadata: unknown }) {
  return metadataOf(order).source === 'upsell';
}

function mainLine(order: LoadedOrder) {
  const configured = metadataOf(order).mainVariantId;
  if (typeof configured === 'string') return order.lines.find((line) => line.variantId === configured) ?? null;
  return order.lines.length === 1 ? order.lines[0] : null;
}

async function resolveBump(order: LoadedOrder, db: DbClient = prisma) {
  if (isUpsellOrder(order)) return null;
  const main = mainLine(order);
  if (!main?.variant) return null;
  return resolveOffer(db, {
    workspaceId: order.workspaceId,
    productId: main.variant.productId,
    currency: order.currency,
    kind: OfferKind.ORDER_BUMP,
    preferOfferId: stringOrNull(metadataOf(order).bumpOfferId),
  });
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
  const bump = state === 'PAID' ? null : await resolveBump(order);
  // Medicion: el bump cuenta como mostrado solo cuando el comprador puede elegirlo.
  if (bump && state === 'PAYABLE') await recordOfferShown(prisma, { workspaceId: order.workspaceId, orderId: order.id, offer: bump });
  const selected = bump ? order.lines.some((item) => item.variantId === bump.variantId) : false;
  const contactName = order.contact ? `${order.contact.firstName} ${order.contact.lastName ?? ''}`.trim() : '';
  return {
    ok: true,
    orderId: order.id,
    workspaceName: order.workspace.name,
    item: { name: line.name, quantity: line.quantity, unitPrice: line.unitPrice },
    bump: bump ? { offerId: bump.offerId, name: bump.name, headline: bump.headline, description: bump.description, imageUrl: bump.imageUrl, unitPrice: bump.unitPrice, selected } : null,
    total: order.total,
    currency: order.currency,
    buyer: { name: contactName || order.customerName || null, email: maskEmail(order.contact?.email ?? order.customerEmail) },
    state,
    isUpsell: isUpsellOrder(order),
    upsell: state === 'PAID' ? await upsellFor(order, now) : null,
    delivery: state === 'PAID' ? await buyerDelivery(order.id) : null,
  };
}

/**
 * Acceso a la entrega desde la pagina post-compra (quien tiene el enlace
 * firmado del checkout es el comprador). Sin entrega todavia: PENDING, y la
 * pagina no promete nada que no exista.
 */
async function buyerDelivery(orderId: string): Promise<NonNullable<Extract<PublicCheckoutView, { ok: true }>['delivery']>> {
  const deliveries = await prisma.digitalDelivery.findMany({ where: { orderId }, select: { id: true, tokenVersion: true, status: true }, orderBy: { createdAt: 'desc' } });
  const current = deliveries.find((delivery) => delivery.tokenVersion > 0 && delivery.status !== 'REVOKED');
  if (current) {
    const token = currentDeliveryToken(current);
    if (token) return { kind: 'READY', path: `/d/${token}` };
  }
  if (deliveries.length > 0 && deliveries.every((delivery) => delivery.status === 'REVOKED')) return { kind: 'REVOKED' };
  return { kind: 'PENDING' };
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
      const previousMetadata = metadataOf(order);
      const extraLines = order.lines.filter((line) => line.id !== main.id);
      const existingBump = bump ? extraLines.find((line) => line.variantId === bump.variantId) ?? null : null;
      // Un bump de un intento anterior que ya no es el vigente (se pauso o cambio
      // la prioridad) se quita. Cualquier otra linea extra es un pedido ajeno a
      // este checkout y no se toca.
      const previousBumpVariantId = stringOrNull(previousMetadata.bumpVariantId);
      const staleBumps = extraLines.filter((line) => line.id !== existingBump?.id && line.variantId !== null && line.variantId === previousBumpVariantId);
      if (extraLines.some((line) => line.id !== existingBump?.id && !staleBumps.includes(line))) {
        return { ok: false, reason: 'UNAVAILABLE' } as const;
      }
      for (const line of staleBumps) await tx.orderLine.delete({ where: { id: line.id } });

      if (bump && includeBump && !existingBump) {
        await tx.orderLine.create({
          data: { orderId: order.id, variantId: bump.variantId, name: bump.name, sku: bump.sku, unitPrice: bump.unitPrice, quantity: 1, total: bump.unitPrice },
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
      const selectionChanged = total !== order.total || Boolean(existingBump) !== includeBump || staleBumps.length > 0;
      const nextMetadata: CheckoutMetadata = {
        ...previousMetadata,
        mainVariantId: main.variantId,
        bumpVariantId: bump?.variantId ?? null,
        bumpOfferId: bump?.offerId ?? null,
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
      // Medicion: la decision queda en la oferta del pedido (y solo una cuenta como aceptada).
      if (bump) await recordOfferDecision(tx, { workspaceId: order.workspaceId, orderId: order.id, offer: bump, status: includeBump ? 'ACCEPTED' : 'DECLINED' });
      await clearOtherBumpDecisions(tx, { workspaceId: order.workspaceId, orderId: order.id, keepOfferId: bump?.offerId ?? null });
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

// --- Upsell postcompra ---------------------------------------------------------------------

async function latestUpsellRecord(db: DbClient, order: { id: string; workspaceId: string }) {
  return db.orderOffer.findFirst({
    where: { workspaceId: order.workspaceId, orderId: order.id, kind: OfferKind.UPSELL },
    orderBy: [{ updatedAt: 'desc' }],
    include: { resultOrder: { select: { id: true, status: true, lines: { select: { name: true }, take: 1 } } } },
  });
}

async function resolveUpsell(db: DbClient, order: LoadedOrder, preferOfferId: string | null) {
  const main = mainLine(order);
  if (!main?.variant) return null;
  return resolveOffer(db, { workspaceId: order.workspaceId, productId: main.variant.productId, currency: order.currency, kind: OfferKind.UPSELL, preferOfferId });
}

/** Lo que la pagina de un pedido PAGADO muestra del upsell. Registra la impresion. */
async function upsellFor(order: LoadedOrder, now: Date): Promise<PublicUpsell | null> {
  if (isUpsellOrder(order)) return null;
  const record = await latestUpsellRecord(prisma, order);
  if (record?.status === OrderOfferStatus.ACCEPTED && record.resultOrder) {
    const child = record.resultOrder;
    return {
      status: PAID_STATUSES.includes(child.status) ? 'PAID' : 'ACCEPTED',
      name: child.lines[0]?.name ?? 'Oferta adicional',
      unitPrice: record.priceMinor,
      checkoutPath: publicCheckoutUrl(child.id, { absolute: false, now }),
    };
  }
  if (record?.status === OrderOfferStatus.DECLINED) return { status: 'DECLINED' };
  const offer = await resolveUpsell(prisma, order, record?.offerId ?? null);
  if (!offer) return null;
  await recordOfferShown(prisma, { workspaceId: order.workspaceId, orderId: order.id, offer });
  return { status: 'OPEN', headline: offer.headline, description: offer.description, imageUrl: offer.imageUrl, name: offer.name, unitPrice: offer.unitPrice };
}

export type UpsellDecisionResult = { ok: true; redirectUrl: string } | { ok: false; reason: PublicCheckoutUnavailable };

/**
 * Aceptar o rechazar el upsell de un pedido pagado.
 *
 * El navegador solo envia el token y la decision: que oferta, a que precio y
 * en que moneda se resuelve aqui, desde la base. Bajo un lock por pedido y con
 * una sola fila `OrderOffer` por pedido y oferta, aceptar dos veces (doble
 * clic, volver atras) reutiliza el MISMO pedido adicional; nunca crea dos.
 *
 * Aceptar crea un pedido adicional y lo lleva directo al pago de Mercado Pago
 * de ese pedido (su propia preferencia, su propio webhook y su propia entrega).
 */
export async function decideUpsell(orderId: string, token: string | null | undefined, decision: UpsellDecision, now = new Date()): Promise<UpsellDecisionResult> {
  const check = verifyCheckoutToken(orderId, token, now);
  if (!check.ok) return { ok: false, reason: check.reason === 'EXPIRED' ? 'EXPIRED' : 'NOT_FOUND' };
  const back = publicCheckoutUrl(orderId, { absolute: false, now });

  let outcome: { kind: 'declined' } | { kind: 'child'; childId: string } | { kind: 'unavailable' } | { kind: 'not_found' };
  try {
    outcome = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`public_checkout_upsell:${orderId}`}, 0))`;
        const order = await loadOrder(orderId, tx);
        if (!order) return { kind: 'not_found' } as const;
        if (stateOf(order) !== 'PAID' || isUpsellOrder(order)) return { kind: 'unavailable' } as const;

        const record = await latestUpsellRecord(tx, order);
        // Ya aceptado: aceptar de nuevo lleva al MISMO pedido adicional; rechazar
        // tarde no lo deshace (vuelve a la pagina, que muestra su estado).
        if (record?.status === OrderOfferStatus.ACCEPTED && record.resultOrderId) {
          return decision === 'accept' ? ({ kind: 'child', childId: record.resultOrderId } as const) : ({ kind: 'declined' } as const);
        }

        const offer: ResolvedOffer | null = await resolveUpsell(tx, order, record?.offerId ?? null);
        if (decision === 'decline') {
          if (offer) await recordOfferDecision(tx, { workspaceId: order.workspaceId, orderId: order.id, offer, status: 'DECLINED' });
          else if (record) await tx.orderOffer.update({ where: { id: record.id }, data: { status: OrderOfferStatus.DECLINED, decidedAt: now } });
          await recordAudit({ workspaceId: order.workspaceId, action: 'order.upsell_declined', entity: 'CustomerOrder', entityId: order.id, metadata: { offerId: offer?.offerId ?? record?.offerId ?? null } }, tx);
          return { kind: 'declined' } as const;
        }

        if (!offer) return { kind: 'unavailable' } as const;
        await assertFeature(order.workspaceId, 'commerce.orders');
        const child = await tx.customerOrder.create({
          data: {
            workspaceId: order.workspaceId,
            contactId: order.contactId,
            conversationId: order.conversationId,
            campaignRouteId: order.campaignRouteId,
            attribution: order.attribution ?? Prisma.DbNull,
            customerEmail: order.customerEmail,
            customerName: order.customerName,
            status: OrderStatus.DRAFT,
            currency: order.currency,
            subtotal: offer.unitPrice,
            total: offer.unitPrice,
            metadata: { source: 'upsell', parentOrderId: order.id, offerId: offer.offerId, productId: offer.productId, mainVariantId: offer.variantId } as Prisma.InputJsonValue,
            lines: { create: [{ variantId: offer.variantId, name: offer.name, sku: offer.sku, unitPrice: offer.unitPrice, quantity: 1, total: offer.unitPrice }] },
          },
          select: { id: true },
        });
        await recordOfferDecision(tx, { workspaceId: order.workspaceId, orderId: order.id, offer, status: 'ACCEPTED', resultOrderId: child.id });
        await recordAudit(
          { workspaceId: order.workspaceId, action: 'order.upsell_accepted', entity: 'CustomerOrder', entityId: child.id, metadata: { parentOrderId: order.id, offerId: offer.offerId, total: offer.unitPrice } },
          tx,
        );
        return { kind: 'child', childId: child.id } as const;
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  } catch (error) {
    // Plan sin pedidos: al comprador solo se le dice que la oferta no esta disponible.
    if (!isEntitlementError(error)) throw error;
    console.error('public_upsell_unavailable', { orderId, error: error.message });
    outcome = { kind: 'unavailable' };
  }

  if (outcome.kind === 'not_found') return { ok: false, reason: 'NOT_FOUND' };
  if (outcome.kind === 'unavailable') return { ok: false, reason: 'UNAVAILABLE' };
  if (outcome.kind === 'declined') return { ok: true, redirectUrl: back };

  const childPath = publicCheckoutUrl(outcome.childId, { absolute: false, now });
  const payment = await startPublicCheckoutPayment(outcome.childId, signCheckoutToken(outcome.childId, now), false, now);
  if (payment.ok) return { ok: true, redirectUrl: payment.redirectUrl };
  // Ya pagado o en proceso: la pagina del pedido adicional muestra su estado real.
  if (payment.reason === 'ALREADY_PAID' || payment.reason === 'PENDING') return { ok: true, redirectUrl: childPath };
  return { ok: true, redirectUrl: `${childPath}&e=${encodeURIComponent(payment.reason)}` };
}
