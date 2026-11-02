import { OfferKind, OrderOfferStatus, ProductStatus, type OrderStatus, type Prisma } from '../../../../generated/prisma/client';
import { prisma } from '../../prisma';
import { recordAudit } from '../../domain/audit';
import { assertFeature } from '../../entitlements';
import { SOLD_ORDER_STATUSES } from '../../dashboard/widgets/loaders/commerce';
import { publicCoverUrl } from '../product-link';
import { readCover } from '../product-studio/cover';
import { BUMP_ISSUE_TEXT, isBlockingBumpIssue, offerLabel, type BumpCandidate, type BumpIssue } from '../product-studio/rules';
import {
  ProductStudioError,
  assertCanManage,
  assertEditable,
  loadBumpCandidate,
  loadOwned,
  lockWorkspaceCatalog,
  type StudioActor,
} from '../product-studio/service';
import {
  MAX_OFFERS_PER_KIND,
  effectiveOfferPrice,
  offerCreateSchema,
  offerIssue,
  offerReorderSchema,
  offerUpdateSchema,
  pickOffer,
  summarizeOfferStats,
  type OfferStatRow,
  type OfferStats,
} from './rules';

/**
 * Ofertas de producto (Punto 6) — servicio. Ver rules.ts.
 *
 * Administracion: OWNER/ADMIN del workspace activo, siempre acotado por
 * `workspaceId`, con el mismo lock del catalogo que el Studio (las relaciones
 * entre productos se validan sin carreras). Un id de otro negocio responde
 * NOT_FOUND, igual que uno inexistente.
 *
 * Checkout: `resolveOffer` elige lo que ve el comprador, siempre desde la base
 * (nunca desde el navegador), y `recordOffer*` deja la medicion por pedido.
 */

type Db = typeof prisma | Prisma.TransactionClient;

const SOLD: OrderStatus[] = SOLD_ORDER_STATUSES;

function parse<T>(schema: { safeParse: (raw: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string; path: (string | number)[] }[] } } }, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ProductStudioError('INVALID', issue?.message ?? 'Datos inválidos.', issue?.path.join('.') || undefined);
  }
  return parsed.data;
}

const offerInclude = {
  offerVariant: { include: { product: { select: { id: true, workspaceId: true, status: true, currency: true, name: true, metadata: true } } } },
} satisfies Prisma.ProductOfferInclude;

type LoadedOffer = Prisma.ProductOfferGetPayload<{ include: typeof offerInclude }>;

function candidateOf(offer: LoadedOffer): BumpCandidate {
  return {
    productId: offer.offerVariant.product.id,
    workspaceId: offer.offerVariant.product.workspaceId,
    status: offer.offerVariant.product.status,
    currency: offer.offerVariant.product.currency,
    variantActive: offer.offerVariant.isActive,
    price: effectiveOfferPrice(offer.priceMinor, offer.offerVariant.priceMinor),
  };
}

function imageOf(offer: LoadedOffer, mode: 'public' | 'admin') {
  if (!offer.showImage) return null;
  const cover = readCover(offer.offerVariant.product.metadata);
  if (!cover) return null;
  const version = cover.uploadedAt || cover.key;
  const productId = offer.offerVariant.product.id;
  return mode === 'public' ? publicCoverUrl(productId, version) : `/api/products/${encodeURIComponent(productId)}/cover?v=${encodeURIComponent(version)}`;
}

async function validateVariant(db: Db, workspaceId: string, product: { id: string; currency: string }, variantId: string) {
  const loaded = await loadBumpCandidate(db, workspaceId, variantId);
  const issue = offerIssue({ mainProductId: product.id, workspaceId, currency: product.currency, candidate: loaded?.candidate ?? null });
  if (isBlockingBumpIssue(issue)) throw new ProductStudioError('INVALID', BUMP_ISSUE_TEXT[issue!], 'variantId');
  return loaded!;
}

// --- Administracion ---------------------------------------------------------------

export async function createProductOffer(actor: StudioActor, productId: string, raw: unknown) {
  assertCanManage(actor);
  const input = parse(offerCreateSchema, raw);
  await assertFeature(actor.workspaceId, 'commerce.products');

  return prisma.$transaction(async (tx) => {
    await lockWorkspaceCatalog(tx, actor.workspaceId);
    const product = await loadOwned(tx, actor.workspaceId, productId);
    assertEditable(product);
    await validateVariant(tx, actor.workspaceId, product, input.variantId);

    const siblings = await tx.productOffer.findMany({
      where: { workspaceId: actor.workspaceId, productId: product.id, kind: input.kind, archivedAt: null },
      select: { offerVariantId: true, priority: true },
    });
    if (siblings.length >= MAX_OFFERS_PER_KIND) throw new ProductStudioError('INVALID', `Máximo ${MAX_OFFERS_PER_KIND} ofertas de este tipo por producto.`);
    if (siblings.some((item) => item.offerVariantId === input.variantId)) throw new ProductStudioError('CONFLICT', 'Ese producto ya está configurado como oferta de este tipo.', 'variantId');

    const offer = await tx.productOffer.create({
      data: {
        workspaceId: actor.workspaceId,
        productId: product.id,
        kind: input.kind,
        offerVariantId: input.variantId,
        headline: input.headline,
        description: input.description,
        priceMinor: input.price,
        showImage: input.showImage,
        isActive: input.isActive,
        // Al final de la lista: la prioridad la decide el orden explicito.
        priority: siblings.reduce((max, item) => Math.max(max, item.priority + 1), 0),
      },
      select: { id: true },
    });
    await recordAudit(
      { workspaceId: actor.workspaceId, actorId: actor.userId, action: 'product.offer_created', entity: 'ProductOffer', entityId: offer.id, metadata: { productId: product.id, kind: input.kind, variantId: input.variantId, price: input.price } },
      tx,
    );
    return offer;
  });
}

async function loadOwnedOffer(db: Db, workspaceId: string, productId: string, offerId: string) {
  const offer = await db.productOffer.findFirst({ where: { id: offerId, workspaceId, productId, archivedAt: null } });
  if (!offer) throw new ProductStudioError('NOT_FOUND', 'Oferta no encontrada.');
  return offer;
}

export async function updateProductOffer(actor: StudioActor, productId: string, offerId: string, raw: unknown) {
  assertCanManage(actor);
  const input = parse(offerUpdateSchema, raw);
  await assertFeature(actor.workspaceId, 'commerce.products');

  return prisma.$transaction(async (tx) => {
    await lockWorkspaceCatalog(tx, actor.workspaceId);
    const product = await loadOwned(tx, actor.workspaceId, productId);
    assertEditable(product);
    const offer = await loadOwnedOffer(tx, actor.workspaceId, product.id, offerId);
    if (input.variantId !== offer.offerVariantId) {
      await validateVariant(tx, actor.workspaceId, product, input.variantId);
      const clash = await tx.productOffer.findFirst({
        where: { workspaceId: actor.workspaceId, productId: product.id, kind: offer.kind, archivedAt: null, offerVariantId: input.variantId, id: { not: offer.id } },
        select: { id: true },
      });
      if (clash) throw new ProductStudioError('CONFLICT', 'Ese producto ya está configurado como oferta de este tipo.', 'variantId');
    }
    await tx.productOffer.update({
      where: { id: offer.id },
      data: { offerVariantId: input.variantId, headline: input.headline, description: input.description, priceMinor: input.price, showImage: input.showImage, isActive: input.isActive },
    });
    await recordAudit(
      { workspaceId: actor.workspaceId, actorId: actor.userId, action: 'product.offer_updated', entity: 'ProductOffer', entityId: offer.id, metadata: { productId: product.id, kind: offer.kind, variantId: input.variantId, price: input.price, isActive: input.isActive } },
      tx,
    );
    return { id: offer.id };
  });
}

/**
 * Elimina una oferta. Si ya se mostro en algun pedido se ARCHIVA: deja de
 * ofrecerse y su medicion se conserva (los pedidos la referencian).
 */
export async function deleteProductOffer(actor: StudioActor, productId: string, offerId: string) {
  assertCanManage(actor);
  return prisma.$transaction(async (tx) => {
    await lockWorkspaceCatalog(tx, actor.workspaceId);
    const product = await loadOwned(tx, actor.workspaceId, productId);
    assertEditable(product);
    const offer = await loadOwnedOffer(tx, actor.workspaceId, product.id, offerId);
    const history = await tx.orderOffer.count({ where: { workspaceId: actor.workspaceId, offerId: offer.id } });
    if (history > 0) await tx.productOffer.update({ where: { id: offer.id }, data: { archivedAt: new Date(), isActive: false } });
    else await tx.productOffer.delete({ where: { id: offer.id } });
    await recordAudit(
      { workspaceId: actor.workspaceId, actorId: actor.userId, action: history > 0 ? 'product.offer_archived' : 'product.offer_deleted', entity: 'ProductOffer', entityId: offer.id, metadata: { productId: product.id, kind: offer.kind, history } },
      tx,
    );
    return { id: offer.id, archived: history > 0 };
  });
}

/** Nuevo orden de prioridad de las ofertas de un tipo. Debe nombrar a TODAS. */
export async function reorderProductOffers(actor: StudioActor, productId: string, raw: unknown) {
  assertCanManage(actor);
  const input = parse(offerReorderSchema, raw);
  return prisma.$transaction(async (tx) => {
    await lockWorkspaceCatalog(tx, actor.workspaceId);
    const product = await loadOwned(tx, actor.workspaceId, productId);
    assertEditable(product);
    const current = await tx.productOffer.findMany({ where: { workspaceId: actor.workspaceId, productId: product.id, kind: input.kind, archivedAt: null }, select: { id: true } });
    const known = new Set(current.map((item) => item.id));
    if (current.length !== input.ids.length || input.ids.some((id) => !known.has(id))) {
      throw new ProductStudioError('CONFLICT', 'Las ofertas cambiaron mientras ordenabas. Recarga la página.');
    }
    for (const [priority, id] of input.ids.entries()) await tx.productOffer.update({ where: { id }, data: { priority } });
    await recordAudit(
      { workspaceId: actor.workspaceId, actorId: actor.userId, action: 'product.offers_reordered', entity: 'Product', entityId: product.id, metadata: { kind: input.kind, ids: input.ids } },
      tx,
    );
    return { ids: input.ids };
  });
}

// --- Lecturas de administracion ----------------------------------------------------

export type AdminOffer = {
  id: string;
  kind: OfferKind;
  variantId: string;
  productId: string;
  label: string;
  headline: string;
  description: string | null;
  price: number | null;
  variantPrice: number;
  effectivePrice: number;
  currency: string;
  showImage: boolean;
  imageUrl: string | null;
  isActive: boolean;
  priority: number;
  /** Por que hoy no se mostraria (null = se muestra si le toca). */
  issue: BumpIssue | null;
  stats: OfferStats;
};

async function statsFor(workspaceId: string, offers: { id: string; kind: OfferKind }[]) {
  if (offers.length === 0) return new Map<string, OfferStats>();
  const rows = await prisma.orderOffer.findMany({
    where: { workspaceId, offerId: { in: offers.map((offer) => offer.id) } },
    select: {
      offerId: true,
      status: true,
      priceMinor: true,
      order: { select: { status: true, metadata: true } },
      resultOrder: { select: { status: true, metadata: true } },
    },
  });
  const fake = (metadata: unknown) => Boolean(metadata && typeof metadata === 'object' && (metadata as { fake?: unknown }).fake === true);
  const byOffer = new Map<string, OfferStatRow[]>();
  const kindOf = new Map(offers.map((offer) => [offer.id, offer.kind]));
  for (const row of rows) {
    const kind = kindOf.get(row.offerId);
    const charged = kind === OfferKind.UPSELL ? row.resultOrder : row.order;
    const list = byOffer.get(row.offerId) ?? [];
    list.push({
      status: row.status,
      priceMinor: row.priceMinor,
      paid: Boolean(charged && SOLD.includes(charged.status)),
      basePaid: SOLD.includes(row.order.status),
      simulated: Boolean(charged && fake(charged.metadata)),
    });
    byOffer.set(row.offerId, list);
  }
  return new Map(offers.map((offer) => [offer.id, summarizeOfferStats(offer.kind, byOffer.get(offer.id) ?? [])]));
}

export async function listProductOffers(workspaceId: string, productId: string) {
  const product = await loadOwned(prisma, workspaceId, productId);
  const offers = await prisma.productOffer.findMany({
    where: { workspaceId, productId: product.id },
    include: offerInclude,
    orderBy: [{ kind: 'asc' }, { priority: 'asc' }, { createdAt: 'asc' }],
  });
  const stats = await statsFor(workspaceId, offers);
  const context = { mainProductId: product.id, workspaceId, currency: product.currency };
  const view = (offer: LoadedOffer): AdminOffer => ({
    id: offer.id,
    kind: offer.kind,
    variantId: offer.offerVariantId,
    productId: offer.offerVariant.product.id,
    label: offerLabel(offer.offerVariant.product.name, offer.offerVariant),
    headline: offer.headline,
    description: offer.description,
    price: offer.priceMinor,
    variantPrice: offer.offerVariant.priceMinor,
    effectivePrice: effectiveOfferPrice(offer.priceMinor, offer.offerVariant.priceMinor),
    currency: offer.offerVariant.product.currency,
    showImage: offer.showImage,
    imageUrl: imageOf(offer, 'admin'),
    isActive: offer.isActive,
    priority: offer.priority,
    issue: offerIssue({ ...context, candidate: candidateOf(offer) }),
    stats: stats.get(offer.id)!,
  });
  const live = offers.filter((offer) => !offer.archivedAt);
  return {
    product: { id: product.id, name: product.name, status: product.status, currency: product.currency, connectionId: product.connectionId },
    offers: live.map(view),
    archived: offers.filter((offer) => offer.archivedAt).map((offer) => ({ id: offer.id, kind: offer.kind, headline: offer.headline, currency: offer.offerVariant.product.currency, stats: stats.get(offer.id)! })),
    /** Lo que vera el comprador hoy, por tipo (null = nada). */
    winner: {
      ORDER_BUMP: pickOffer(live.filter((offer) => offer.kind === OfferKind.ORDER_BUMP).map((offer) => ({ offer, candidate: candidateOf(offer) })), context)?.offer.id ?? null,
      UPSELL: pickOffer(live.filter((offer) => offer.kind === OfferKind.UPSELL).map((offer) => ({ offer, candidate: candidateOf(offer) })), context)?.offer.id ?? null,
    },
  };
}

export type ProductOffersView = Awaited<ReturnType<typeof listProductOffers>>;

/** Resumen para la ficha del producto. */
export async function offerSummary(workspaceId: string, productId: string) {
  const rows = await prisma.productOffer.groupBy({
    by: ['kind', 'isActive'],
    where: { workspaceId, productId, archivedAt: null },
    _count: { _all: true },
  });
  const count = (kind: OfferKind, active: boolean) => rows.find((row) => row.kind === kind && row.isActive === active)?._count._all ?? 0;
  return {
    bumps: { active: count(OfferKind.ORDER_BUMP, true), paused: count(OfferKind.ORDER_BUMP, false) },
    upsells: { active: count(OfferKind.UPSELL, true), paused: count(OfferKind.UPSELL, false) },
  };
}

// --- Checkout ---------------------------------------------------------------------------

export type ResolvedOffer = {
  offerId: string;
  kind: OfferKind;
  variantId: string;
  productId: string;
  /** Nombre de la linea del pedido (snapshot), igual que createOrder. */
  name: string;
  sku: string | null;
  headline: string;
  description: string | null;
  unitPrice: number;
  imageUrl: string | null;
};

/**
 * La oferta de `kind` que se le muestra al comprador de `productId`, o null.
 * Solo productos PUBLICADOS del mismo workspace, en la misma moneda, con
 * variante activa y precio: lo mismo que exige createOrder para venderlos.
 */
export async function resolveOffer(
  db: Db,
  input: { workspaceId: string; productId: string; currency: string; kind: OfferKind; image?: 'public' | 'admin'; preferOfferId?: string | null },
): Promise<ResolvedOffer | null> {
  const offers = await db.productOffer.findMany({
    where: { workspaceId: input.workspaceId, productId: input.productId, kind: input.kind, isActive: true, archivedAt: null },
    include: offerInclude,
  });
  const context = { mainProductId: input.productId, workspaceId: input.workspaceId, currency: input.currency };
  // Sin stock (inventory null = sin control) no se ofrece: createOrder tampoco lo venderia.
  const candidates = offers
    .filter((offer) => offer.offerVariant.inventory === null || offer.offerVariant.inventory >= 1)
    .map((offer) => ({ offer, candidate: candidateOf(offer) }));
  // La oferta ya mostrada en este pedido se mantiene mientras siga disponible:
  // reordenar en el Studio no cambia lo que el comprador ya esta viendo.
  const preferred = input.preferOfferId ? candidates.filter((item) => item.offer.id === input.preferOfferId) : [];
  const picked = pickOffer(preferred, context) ?? pickOffer(candidates, context);
  if (!picked || picked.offer.offerVariant.product.status !== ProductStatus.ACTIVE) return null;
  const offer = picked.offer;
  return {
    offerId: offer.id,
    kind: offer.kind,
    variantId: offer.offerVariantId,
    productId: offer.offerVariant.product.id,
    name: offerLabel(offer.offerVariant.product.name, offer.offerVariant),
    sku: offer.offerVariant.sku,
    headline: offer.headline,
    description: offer.description,
    unitPrice: effectiveOfferPrice(offer.priceMinor, offer.offerVariant.priceMinor),
    imageUrl: imageOf(offer, input.image ?? 'public'),
  };
}

/** Registra que la oferta se mostro en el pedido. Idempotente (una fila por pedido y oferta). */
export async function recordOfferShown(db: Db, input: { workspaceId: string; orderId: string; offer: ResolvedOffer }) {
  await db.orderOffer.createMany({
    data: [{ workspaceId: input.workspaceId, orderId: input.orderId, offerId: input.offer.offerId, kind: input.offer.kind, offerVariantId: input.offer.variantId, priceMinor: input.offer.unitPrice }],
    skipDuplicates: true,
  });
}

/**
 * Decision del comprador sobre una oferta del pedido. Un upsell ya aceptado
 * (con su pedido adicional) no vuelve atras.
 */
export async function recordOfferDecision(
  db: Db,
  input: { workspaceId: string; orderId: string; offer: ResolvedOffer; status: 'ACCEPTED' | 'DECLINED'; resultOrderId?: string | null },
) {
  const now = new Date();
  await db.orderOffer.upsert({
    where: { orderId_offerId: { orderId: input.orderId, offerId: input.offer.offerId } },
    create: {
      workspaceId: input.workspaceId,
      orderId: input.orderId,
      offerId: input.offer.offerId,
      kind: input.offer.kind,
      offerVariantId: input.offer.variantId,
      priceMinor: input.offer.unitPrice,
      status: input.status,
      resultOrderId: input.resultOrderId ?? null,
      decidedAt: now,
    },
    update: {
      offerVariantId: input.offer.variantId,
      priceMinor: input.offer.unitPrice,
      status: input.status,
      decidedAt: now,
      ...(input.resultOrderId ? { resultOrderId: input.resultOrderId } : {}),
    },
  });
}

/** El checkout cambio de bump (otra prioridad): la oferta anterior deja de contar como aceptada. */
export async function clearOtherBumpDecisions(db: Db, input: { workspaceId: string; orderId: string; keepOfferId: string | null }) {
  await db.orderOffer.updateMany({
    where: { workspaceId: input.workspaceId, orderId: input.orderId, kind: OfferKind.ORDER_BUMP, status: OrderOfferStatus.ACCEPTED, ...(input.keepOfferId ? { offerId: { not: input.keepOfferId } } : {}) },
    data: { status: OrderOfferStatus.DECLINED, decidedAt: new Date() },
  });
}
