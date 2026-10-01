import { OrderStatus, ProductStatus, type Prisma, type WorkspaceRole } from '../../../../generated/prisma/client';
import { prisma } from '../../prisma';
import { recordAudit } from '../../domain/audit';
import { assertFeature } from '../../entitlements';
import { canManageWorkspaceSettings } from '../../workspace-roles';
import { SOLD_ORDER_STATUSES } from '../../dashboard/widgets/loaders/commerce';
import { productCheckoutUrl } from '../product-link';
import { copyCover, coverBelongsTo, readCover, removeCoverObject, storeCover, type CoverRef } from './cover';
import {
  BUMP_ISSUE_TEXT,
  bumpProblem,
  copyName,
  isBlockingBumpIssue,
  offerLabel,
  priceFrom,
  productInputSchema,
  publishBlockers,
  sellableVariants,
  type BumpCandidate,
  type BumpIssue,
  type ProductInput,
  type StatusAction,
  type StudioProductStatus,
} from './rules';

/**
 * Product Sales Studio — servicio de dominio.
 *
 * Extiende los modelos existentes (Product / ProductVariant), no crea otros:
 *  - precio base = variante por defecto (`isDefault`); con variantes, la por
 *    defecto queda inactiva y el comprador elige una de las activas;
 *  - el producto adicional (order bump) se guarda donde lo lee el motor del
 *    Punto 1: `Product.metadata.orderBump.variantId`. El Studio solo lo
 *    escribe validado; nadie edita metadata a mano;
 *  - la portada vive en `Product.metadata.cover` (ver cover.ts).
 *
 * Toda funcion recibe el actor ya resuelto por la sesion (workspace ACTIVO y
 * rol en ese workspace) y acota cada consulta por `workspaceId`: un id de otro
 * negocio no resuelve y responde NOT_FOUND, igual que uno inexistente.
 */

export type StudioActor = { userId: string; workspaceId: string; role: WorkspaceRole };

export type StudioErrorCode = 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID' | 'CONFLICT' | 'READ_ONLY';

export class ProductStudioError extends Error {
  constructor(
    readonly code: StudioErrorCode,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'ProductStudioError';
  }
}

type Db = typeof prisma | Prisma.TransactionClient;

function assertCanManage(actor: StudioActor) {
  if (!canManageWorkspaceSettings(actor.role)) {
    throw new ProductStudioError('FORBIDDEN', 'Solo el propietario o un administrador del negocio pueden modificar productos.');
  }
}

function metaOf(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...(metadata as Record<string, unknown>) } : {};
}

export function bumpVariantIdOf(metadata: unknown) {
  const bump = metaOf(metadata).orderBump;
  if (!bump || typeof bump !== 'object' || Array.isArray(bump)) return null;
  const variantId = (bump as { variantId?: unknown }).variantId;
  return typeof variantId === 'string' && variantId.length > 0 ? variantId : null;
}

async function lockWorkspaceCatalog(tx: Prisma.TransactionClient, workspaceId: string) {
  // Serializa las escrituras del catalogo de un workspace: unicidad de SKU y
  // relaciones de producto adicional se validan sin carreras.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`product-studio:${workspaceId}`}, 0))`;
}

async function loadOwned(db: Db, workspaceId: string, productId: string) {
  const product = await db.product.findFirst({
    where: { id: productId, workspaceId },
    include: { variants: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }] } },
  });
  if (!product) throw new ProductStudioError('NOT_FOUND', 'Producto no encontrado.');
  return product;
}

type OwnedProduct = Awaited<ReturnType<typeof loadOwned>>;

function assertEditable(product: OwnedProduct) {
  if (product.connectionId) {
    throw new ProductStudioError('READ_ONLY', 'Este producto se sincroniza desde Shopify: edítalo en Shopify.');
  }
  if (product.status === ProductStatus.ARCHIVED) {
    throw new ProductStudioError('READ_ONLY', 'El producto está archivado. Restáuralo para editarlo.');
  }
}

/** Variante candidata a producto adicional, SIEMPRE acotada al workspace. */
async function loadBumpCandidate(db: Db, workspaceId: string, variantId: string) {
  const variant = await db.productVariant.findFirst({
    where: { id: variantId, product: { workspaceId } },
    include: { product: { select: { id: true, workspaceId: true, status: true, currency: true, name: true } } },
  });
  if (!variant) return null;
  const candidate: BumpCandidate = {
    productId: variant.product.id,
    workspaceId: variant.product.workspaceId,
    status: variant.product.status,
    currency: variant.product.currency,
    variantActive: variant.isActive,
    price: variant.priceClp,
  };
  return { candidate, label: offerLabel(variant.product.name, variant), price: variant.priceClp, currency: variant.product.currency, productId: variant.product.id };
}

function parseInput(raw: unknown): ProductInput {
  const parsed = productInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ProductStudioError('INVALID', issue?.message ?? 'Datos inválidos.', issue?.path.join('.') || undefined);
  }
  return parsed.data;
}

async function assertSkusFree(tx: Prisma.TransactionClient, workspaceId: string, productId: string | null, input: ProductInput) {
  const skus = [input.sku, ...input.variants.map((variant) => variant.sku)].filter((sku): sku is string => Boolean(sku));
  if (skus.length === 0) return;
  const clash = await tx.productVariant.findFirst({
    where: {
      product: { workspaceId },
      ...(productId ? { productId: { not: productId } } : {}),
      OR: skus.map((sku) => ({ sku: { equals: sku, mode: 'insensitive' as const } })),
    },
    select: { sku: true, product: { select: { name: true } } },
  });
  if (clash) {
    throw new ProductStudioError('CONFLICT', `El SKU ${clash.sku?.toUpperCase()} ya lo usa "${clash.product.name}". El SKU debe ser único en tu catálogo.`, 'sku');
  }
}

async function validateBump(tx: Prisma.TransactionClient, workspaceId: string, productId: string | null, input: ProductInput) {
  if (!input.orderBump.enabled || !input.orderBump.variantId) return null;
  const loaded = await loadBumpCandidate(tx, workspaceId, input.orderBump.variantId);
  const issue = bumpProblem({ mainProductId: productId, workspaceId, currency: input.currency, candidate: loaded?.candidate ?? null });
  if (isBlockingBumpIssue(issue)) throw new ProductStudioError('INVALID', BUMP_ISSUE_TEXT[issue!], 'orderBump.variantId');
  return input.orderBump.variantId;
}

function readinessVariants(variants: { isDefault: boolean; isActive: boolean; priceClp: number; id: string }[]) {
  return variants.map((variant) => ({ id: variant.id, isDefault: variant.isDefault, isActive: variant.isActive, price: variant.priceClp }));
}

// --- Crear / guardar ----------------------------------------------------------

export async function createStudioProduct(actor: StudioActor, raw: unknown) {
  assertCanManage(actor);
  const input = parseInput(raw);
  await assertFeature(actor.workspaceId, 'commerce.products');

  return prisma.$transaction(async (tx) => {
    await lockWorkspaceCatalog(tx, actor.workspaceId);
    await assertSkusFree(tx, actor.workspaceId, null, input);
    const bumpVariantId = await validateBump(tx, actor.workspaceId, null, input);
    const hasOptions = input.variants.length > 0;
    const product = await tx.product.create({
      data: {
        workspaceId: actor.workspaceId,
        name: input.name,
        description: input.description || null,
        type: input.type,
        currency: input.currency,
        status: ProductStatus.DRAFT,
        ...(bumpVariantId ? { metadata: { orderBump: { variantId: bumpVariantId } } } : {}),
        variants: {
          create: [
            { name: 'Estándar', sku: input.sku, priceClp: input.basePrice, isDefault: true, isActive: !hasOptions, inventory: null },
            ...input.variants.map((variant) => ({ name: variant.name, sku: variant.sku, priceClp: variant.price, isActive: variant.isActive, isDefault: false, inventory: null })),
          ],
        },
      },
      select: { id: true, name: true, type: true },
    });
    await recordAudit(
      { workspaceId: actor.workspaceId, actorId: actor.userId, action: 'product.created', entity: 'Product', entityId: product.id, metadata: { name: product.name, type: product.type, via: 'studio', variants: input.variants.length, orderBump: Boolean(bumpVariantId) } },
      tx,
    );
    return { id: product.id };
  });
}

export async function saveStudioProduct(actor: StudioActor, productId: string, raw: unknown) {
  assertCanManage(actor);
  const input = parseInput(raw);
  await assertFeature(actor.workspaceId, 'commerce.products');

  return prisma.$transaction(async (tx) => {
    await lockWorkspaceCatalog(tx, actor.workspaceId);
    const product = await loadOwned(tx, actor.workspaceId, productId);
    assertEditable(product);

    // Los ids de variante del cliente solo valen si son variantes de ESTE producto.
    const options = product.variants.filter((variant) => !variant.isDefault);
    const ownIds = new Set(options.map((variant) => variant.id));
    input.variants.forEach((variant, index) => {
      if (variant.id && !ownIds.has(variant.id)) {
        throw new ProductStudioError('INVALID', 'Una de las variantes no pertenece a este producto. Recarga la página.', `variants.${index}`);
      }
    });

    await assertSkusFree(tx, actor.workspaceId, product.id, input);
    const bumpVariantId = await validateBump(tx, actor.workspaceId, product.id, input);
    const hasOptions = input.variants.length > 0;

    const metadata = metaOf(product.metadata);
    if (bumpVariantId) metadata.orderBump = { variantId: bumpVariantId };
    else delete metadata.orderBump;

    await tx.product.update({
      where: { id: product.id },
      data: {
        name: input.name,
        description: input.description || null,
        type: input.type,
        currency: input.currency,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });

    const base = product.variants.find((variant) => variant.isDefault);
    if (base) {
      await tx.productVariant.update({ where: { id: base.id }, data: { priceClp: input.basePrice, sku: input.sku, isActive: !hasOptions } });
    } else {
      await tx.productVariant.create({ data: { productId: product.id, name: 'Estándar', sku: input.sku, priceClp: input.basePrice, isDefault: true, isActive: !hasOptions, inventory: null } });
    }

    const keptIds = new Set(input.variants.map((variant) => variant.id).filter(Boolean));
    const deactivated: string[] = [];
    for (const variant of options.filter((candidate) => !keptIds.has(candidate.id))) {
      // Una variante con pedidos no se borra: el historial la referencia.
      const lines = await tx.orderLine.count({ where: { variantId: variant.id } });
      if (lines > 0) {
        await tx.productVariant.update({ where: { id: variant.id }, data: { isActive: false } });
        deactivated.push(variant.name);
      } else {
        await tx.productVariant.delete({ where: { id: variant.id } });
      }
    }
    for (const variant of input.variants) {
      const data = { name: variant.name, sku: variant.sku, priceClp: variant.price, isActive: variant.isActive };
      if (variant.id) await tx.productVariant.update({ where: { id: variant.id }, data });
      else await tx.productVariant.create({ data: { ...data, productId: product.id, isDefault: false, inventory: null } });
    }

    if (product.status === ProductStatus.ACTIVE) {
      const after = await tx.productVariant.findMany({ where: { productId: product.id } });
      const blockers = publishBlockers({ name: input.name, currency: input.currency, variants: readinessVariants(after) });
      if (blockers.length > 0) {
        throw new ProductStudioError('INVALID', `El producto está publicado y quedaría sin poder venderse: ${blockers[0]} Corrígelo o despublícalo primero.`);
      }
    }

    await recordAudit(
      { workspaceId: actor.workspaceId, actorId: actor.userId, action: 'product.updated', entity: 'Product', entityId: product.id, metadata: { via: 'studio', variants: input.variants.length, orderBump: bumpVariantId, deactivatedVariants: deactivated } },
      tx,
    );
    return { id: product.id, deactivatedVariants: deactivated };
  });
}

// --- Estado ---------------------------------------------------------------------

/** Productos del workspace que ofrecen alguna variante de `productId` como adicional. */
async function productsUsingAsBump(db: Db, workspaceId: string, productId: string, variantIds: string[]) {
  if (variantIds.length === 0) return [];
  return db.product.findMany({
    where: {
      workspaceId,
      id: { not: productId },
      OR: variantIds.map((variantId) => ({ metadata: { path: ['orderBump', 'variantId'], equals: variantId } })),
    },
    select: { id: true, name: true, status: true, metadata: true },
    orderBy: { name: 'asc' },
  });
}

export async function changeStudioProductStatus(actor: StudioActor, productId: string, action: StatusAction) {
  assertCanManage(actor);
  if (action === 'publish' || action === 'restore') await assertFeature(actor.workspaceId, 'commerce.products');

  return prisma.$transaction(async (tx) => {
    await lockWorkspaceCatalog(tx, actor.workspaceId);
    const product = await loadOwned(tx, actor.workspaceId, productId);
    const from = product.status;
    let to: ProductStatus = from;
    let detachedFrom: string[] = [];

    if (action === 'publish') {
      if (from === ProductStatus.ARCHIVED) throw new ProductStudioError('INVALID', 'Restaura el producto antes de publicarlo.');
      const blockers = publishBlockers({ name: product.name, currency: product.currency, variants: readinessVariants(product.variants) });
      if (blockers.length > 0) throw new ProductStudioError('INVALID', `Aún no se puede publicar: ${blockers.join(' ')}`);
      to = ProductStatus.ACTIVE;
    } else if (action === 'unpublish') {
      if (from === ProductStatus.ARCHIVED) throw new ProductStudioError('INVALID', 'El producto está archivado.');
      to = ProductStatus.DRAFT;
    } else if (action === 'archive') {
      to = ProductStatus.ARCHIVED;
      if (from !== ProductStatus.ARCHIVED) {
        // Un archivado no puede quedar como adicional de nadie: se quita la
        // relacion de los productos que lo ofrecian (quedan auditados).
        const users = await productsUsingAsBump(tx, actor.workspaceId, product.id, product.variants.map((variant) => variant.id));
        for (const user of users) {
          const metadata = metaOf(user.metadata);
          delete metadata.orderBump;
          await tx.product.update({ where: { id: user.id }, data: { metadata: metadata as Prisma.InputJsonValue } });
        }
        detachedFrom = users.map((user) => user.name);
      }
    } else {
      if (from !== ProductStatus.ARCHIVED) throw new ProductStudioError('INVALID', 'Solo se restaura un producto archivado.');
      to = ProductStatus.DRAFT;
    }

    if (to !== from) {
      await tx.product.update({ where: { id: product.id }, data: { status: to } });
      await recordAudit(
        { workspaceId: actor.workspaceId, actorId: actor.userId, action: `product.${action === 'publish' ? 'published' : action === 'unpublish' ? 'unpublished' : action === 'archive' ? 'archived' : 'restored'}`, entity: 'Product', entityId: product.id, metadata: { from, to, detachedOrderBumpFrom: detachedFrom } },
        tx,
      );
    }
    return { id: product.id, status: to as StudioProductStatus, detachedFrom };
  });
}

// --- Duplicar --------------------------------------------------------------------

/**
 * Copia como BORRADOR del mismo workspace: datos comerciales, variantes (ids
 * nuevos, sin SKU porque el SKU es unico en el catalogo) y la configuracion
 * del producto adicional. No copia pedidos, pagos, metricas ni entregables.
 */
export async function duplicateStudioProduct(actor: StudioActor, productId: string) {
  assertCanManage(actor);
  await assertFeature(actor.workspaceId, 'commerce.products');

  const created = await prisma.$transaction(async (tx) => {
    await lockWorkspaceCatalog(tx, actor.workspaceId);
    const source = await loadOwned(tx, actor.workspaceId, productId);
    const bumpVariantId = bumpVariantIdOf(source.metadata);
    const copy = await tx.product.create({
      data: {
        workspaceId: actor.workspaceId,
        name: copyName(source.name),
        description: source.description,
        type: source.type,
        currency: source.currency,
        status: ProductStatus.DRAFT,
        ...(bumpVariantId ? { metadata: { orderBump: { variantId: bumpVariantId } } } : {}),
        variants: {
          create: source.variants.map((variant) => ({
            name: variant.name,
            sku: null,
            priceClp: variant.priceClp,
            inventory: variant.inventory,
            isDefault: variant.isDefault,
            isActive: variant.isActive,
          })),
        },
      },
      select: { id: true, name: true },
    });
    await recordAudit(
      { workspaceId: actor.workspaceId, actorId: actor.userId, action: 'product.duplicated', entity: 'Product', entityId: copy.id, metadata: { sourceId: source.id } },
      tx,
    );
    return { id: copy.id, cover: readCover(source.metadata), sourceId: source.id };
  });

  // La portada se copia fuera de la transaccion (es almacenamiento, no base).
  let coverCopied = false;
  if (created.cover && coverBelongsTo(created.cover, actor.workspaceId, created.sourceId)) {
    try {
      const cover = await copyCover(created.cover, actor.workspaceId, created.id);
      if (cover) {
        await setCoverMetadata(actor.workspaceId, created.id, cover);
        coverCopied = true;
      }
    } catch (error) {
      console.error('product_duplicate_cover_failed', { productId: created.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { id: created.id, coverCopied };
}

// --- Portada ------------------------------------------------------------------------

async function setCoverMetadata(workspaceId: string, productId: string, cover: CoverRef | null) {
  return prisma.$transaction(async (tx) => {
    await lockWorkspaceCatalog(tx, workspaceId);
    const product = await loadOwned(tx, workspaceId, productId);
    const metadata = metaOf(product.metadata);
    const previous = readCover(metadata);
    if (cover) metadata.cover = cover;
    else delete metadata.cover;
    await tx.product.update({ where: { id: product.id }, data: { metadata: metadata as Prisma.InputJsonValue } });
    return previous;
  });
}

export async function uploadStudioCover(actor: StudioActor, productId: string, bytes: Uint8Array) {
  assertCanManage(actor);
  await assertFeature(actor.workspaceId, 'commerce.products');
  const product = await loadOwned(prisma, actor.workspaceId, productId);
  assertEditable(product);
  const cover = await storeCover(actor.workspaceId, product.id, bytes);
  const previous = await setCoverMetadata(actor.workspaceId, product.id, cover);
  if (previous && previous.key !== cover.key && coverBelongsTo(previous, actor.workspaceId, product.id)) await removeCoverObject(previous.key);
  await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.userId, action: 'product.cover_updated', entity: 'Product', entityId: product.id, metadata: { mimeType: cover.mimeType, size: cover.size } });
  return cover;
}

export async function removeStudioCover(actor: StudioActor, productId: string) {
  assertCanManage(actor);
  const product = await loadOwned(prisma, actor.workspaceId, productId);
  assertEditable(product);
  const previous = await setCoverMetadata(actor.workspaceId, product.id, null);
  if (previous && coverBelongsTo(previous, actor.workspaceId, product.id)) await removeCoverObject(previous.key);
  await recordAudit({ workspaceId: actor.workspaceId, actorId: actor.userId, action: 'product.cover_removed', entity: 'Product', entityId: product.id });
  return { removed: Boolean(previous) };
}

// --- Lecturas -----------------------------------------------------------------------

export type StudioFilter = 'all' | 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export async function listStudioProducts(workspaceId: string, filter: StudioFilter = 'all') {
  const [products, counts, sold] = await Promise.all([
    prisma.product.findMany({
      where: { workspaceId, ...(filter === 'all' ? {} : { status: filter }) },
      include: { variants: { select: { id: true, isDefault: true, isActive: true, priceClp: true } } },
      orderBy: [{ updatedAt: 'desc' }],
    }),
    prisma.product.groupBy({ by: ['status'], where: { workspaceId }, _count: { _all: true } }),
    prisma.orderLine.groupBy({
      by: ['variantId'],
      where: { order: { workspaceId, status: { in: SOLD_ORDER_STATUSES } }, variant: { product: { workspaceId } } },
      _sum: { quantity: true },
    }),
  ]);

  const unitsByVariant = new Map(sold.map((row) => [row.variantId, row._sum.quantity ?? 0]));
  const countBy = Object.fromEntries(counts.map((row) => [row.status, row._count._all])) as Partial<Record<ProductStatus, number>>;
  return {
    counts: {
      all: (countBy.DRAFT ?? 0) + (countBy.ACTIVE ?? 0) + (countBy.ARCHIVED ?? 0),
      DRAFT: countBy.DRAFT ?? 0,
      ACTIVE: countBy.ACTIVE ?? 0,
      ARCHIVED: countBy.ARCHIVED ?? 0,
    },
    products: products.map((product) => {
      const variants = product.variants.map((variant) => ({ id: variant.id, isDefault: variant.isDefault, isActive: variant.isActive, price: variant.priceClp }));
      const cover = readCover(product.metadata);
      return {
        id: product.id,
        name: product.name,
        type: product.type,
        status: product.status as StudioProductStatus,
        currency: product.currency,
        priceFrom: priceFrom(variants),
        optionCount: sellableVariants(variants).needsChoice ? sellableVariants(variants).variants.length : 0,
        unitsSold: product.variants.reduce((sum, variant) => sum + (unitsByVariant.get(variant.id) ?? 0), 0),
        canPublish: publishBlockers({ name: product.name, currency: product.currency, variants }).length === 0,
        updatedAt: product.updatedAt,
        coverVersion: cover ? cover.uploadedAt || cover.key : null,
        syncedFromShopify: Boolean(product.connectionId),
      };
    }),
  };
}

/** Opciones que pueden ofrecerse como producto adicional de `excludeProductId`. */
export async function listBumpOptions(workspaceId: string, excludeProductId: string | null) {
  const products = await prisma.product.findMany({
    where: { workspaceId, status: { not: ProductStatus.ARCHIVED }, ...(excludeProductId ? { id: { not: excludeProductId } } : {}) },
    include: { variants: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }] } },
    orderBy: { name: 'asc' },
  });
  return products.flatMap((product) => {
    const variants = product.variants.map((variant) => ({ ...variant, price: variant.priceClp }));
    return sellableVariants(variants).variants.map((variant) => ({
      variantId: variant.id,
      productId: product.id,
      label: offerLabel(product.name, variant),
      price: variant.priceClp,
      currency: product.currency,
      published: product.status === ProductStatus.ACTIVE,
    }));
  });
}

export type ProductMetrics = {
  ordersStarted: number;
  salesConfirmed: number;
  unitsSold: number;
  revenue: { currency: string; amount: number }[];
  simulatedSales: number;
};

/**
 * Metricas basicas de un producto con datos reales de Commerce. Venta = pedido
 * pagado o en curso (SOLD_ORDER_STATUSES, la misma definicion del dashboard):
 * borradores, cancelados, reembolsados y pagos con monto/moneda que no
 * coinciden (el pedido no se confirma) quedan fuera del ingreso.
 */
export async function productMetrics(workspaceId: string, productId: string): Promise<ProductMetrics> {
  const hasProduct = { lines: { some: { variant: { productId } } } };
  const [ordersStarted, salesConfirmed, soldLines, simulatedSales] = await Promise.all([
    prisma.customerOrder.count({ where: { workspaceId, status: { not: OrderStatus.CANCELLED }, ...hasProduct } }),
    prisma.customerOrder.count({ where: { workspaceId, status: { in: SOLD_ORDER_STATUSES }, ...hasProduct } }),
    prisma.orderLine.findMany({
      where: { variant: { productId }, order: { workspaceId, status: { in: SOLD_ORDER_STATUSES } } },
      select: { quantity: true, total: true, order: { select: { currency: true } } },
    }),
    prisma.customerOrder.count({ where: { workspaceId, status: { in: SOLD_ORDER_STATUSES }, ...hasProduct, metadata: { path: ['fake'], equals: true } } }),
  ]);
  const revenue = new Map<string, number>();
  for (const line of soldLines) revenue.set(line.order.currency, (revenue.get(line.order.currency) ?? 0) + line.total);
  return {
    ordersStarted,
    salesConfirmed,
    unitsSold: soldLines.reduce((sum, line) => sum + line.quantity, 0),
    revenue: [...revenue.entries()].map(([currency, amount]) => ({ currency, amount })),
    simulatedSales,
  };
}

export type BumpView = { variantId: string; label: string; price: number; currency: string; issue: BumpIssue | null } | null;

/** Salud de la relacion guardada: lo que el checkout mostrara (o por que no). */
export async function describeBump(workspaceId: string, product: { id: string; currency: string; metadata: unknown }): Promise<BumpView> {
  const variantId = bumpVariantIdOf(product.metadata);
  if (!variantId) return null;
  const loaded = await loadBumpCandidate(prisma, workspaceId, variantId);
  const issue = bumpProblem({ mainProductId: product.id, workspaceId, currency: product.currency, candidate: loaded?.candidate ?? null });
  return { variantId, label: loaded?.label ?? 'Producto adicional', price: loaded?.price ?? 0, currency: loaded?.currency ?? product.currency, issue };
}

export async function getStudioProduct(workspaceId: string, productId: string) {
  const product = await loadOwned(prisma, workspaceId, productId);
  const [bump, metrics, usedBy] = await Promise.all([
    describeBump(workspaceId, product),
    productMetrics(workspaceId, product.id),
    productsUsingAsBump(prisma, workspaceId, product.id, product.variants.map((variant) => variant.id)),
  ]);
  const cover = readCover(product.metadata);
  const variants = product.variants.map((variant) => ({ id: variant.id, isDefault: variant.isDefault, isActive: variant.isActive, price: variant.priceClp }));
  const base = product.variants.find((variant) => variant.isDefault) ?? null;
  return {
    id: product.id,
    name: product.name,
    description: product.description ?? '',
    type: product.type,
    status: product.status as StudioProductStatus,
    currency: product.currency,
    basePrice: base?.priceClp ?? 0,
    sku: base?.sku ?? null,
    options: product.variants
      .filter((variant) => !variant.isDefault)
      .map((variant) => ({ id: variant.id, name: variant.name, sku: variant.sku, price: variant.priceClp, isActive: variant.isActive })),
    bump,
    usedAsBumpBy: usedBy.map((item) => ({ id: item.id, name: item.name })),
    metrics,
    cover: cover ? { version: cover.uploadedAt || cover.key } : null,
    priceFrom: priceFrom(variants),
    publishBlockers: publishBlockers({ name: product.name, currency: product.currency, variants }),
    checkoutUrl: product.status === ProductStatus.ACTIVE ? productCheckoutUrl(product.id) : null,
    syncedFromShopify: Boolean(product.connectionId),
    updatedAt: product.updatedAt,
    createdAt: product.createdAt,
  };
}

export type StudioProductView = Awaited<ReturnType<typeof getStudioProduct>>;
