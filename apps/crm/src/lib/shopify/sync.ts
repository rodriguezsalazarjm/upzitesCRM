import {
  CommerceProvider,
  ProductStatus,
  ProductType,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { recordAudit } from '../domain/audit';
import { PRODUCTS_QUERY, VARIANT_QUERY, toIntAmount, type GraphQLFetcher } from './client';

/**
 * Sincronizacion de catalogo desde Shopify.
 *
 * Regla de la spec: **para Shopify, los datos externos mandan** en precio e
 * inventario. Lo que se guarda aqui es una copia para poder listar y buscar
 * rapido; antes de vender siempre se re-consulta (`fetchLiveVariant`).
 */
export type SyncResult = {
  products: number;
  variants: number;
  archived: number;
};

export async function syncShopifyCatalog(input: {
  workspaceId: string;
  connectionId: string;
  fetcher: GraphQLFetcher;
  actorId?: string | null;
}): Promise<SyncResult> {
  const result: SyncResult = { products: 0, variants: 0, archived: 0 };
  const seenExternalIds: string[] = [];

  let cursor: string | null = null;
  let hasNext = true;
  // Tope de seguridad: 20 paginas de 50 = 1000 productos por corrida.
  let page = 0;

  while (hasNext && page < 20) {
    page += 1;
    const data: Record<string, unknown> = await input.fetcher(PRODUCTS_QUERY, { cursor });
    const products = (data.products ?? {}) as Record<string, unknown>;
    const nodes = Array.isArray(products.nodes) ? products.nodes : [];

    for (const raw of nodes as Record<string, unknown>[]) {
      const externalId = String(raw.id ?? '');
      if (!externalId) continue;
      seenExternalIds.push(externalId);

      const product = await prisma.product.upsert({
        where: { connectionId_externalId: { connectionId: input.connectionId, externalId } },
        create: {
          workspaceId: input.workspaceId,
          connectionId: input.connectionId,
          externalId,
          name: String(raw.title ?? 'Sin nombre'),
          description: raw.description ? String(raw.description).slice(0, 2000) : null,
          // Shopify no distingue digital de fisico de forma fiable, y asumirlo
          // mal romperia la entrega. Se marca PHYSICAL y el cliente lo ajusta.
          type: ProductType.PHYSICAL,
          status: ProductStatus.ACTIVE,
        },
        update: {
          name: String(raw.title ?? 'Sin nombre'),
          description: raw.description ? String(raw.description).slice(0, 2000) : null,
          status: ProductStatus.ACTIVE,
        },
      });

      result.products += 1;

      const variants = ((raw.variants ?? {}) as Record<string, unknown>).nodes;
      const variantNodes = Array.isArray(variants) ? (variants as Record<string, unknown>[]) : [];

      for (const [index, variant] of variantNodes.entries()) {
        const variantExternalId = String(variant.id ?? '');
        if (!variantExternalId) continue;

        await prisma.productVariant.upsert({
          where: { productId_externalId: { productId: product.id, externalId: variantExternalId } },
          create: {
            productId: product.id,
            externalId: variantExternalId,
            name: String(variant.title ?? 'Estandar'),
            sku: variant.sku ? String(variant.sku) : null,
            priceClp: toIntAmount(variant.price),
            inventory: typeof variant.inventoryQuantity === 'number' ? variant.inventoryQuantity : null,
            isDefault: index === 0,
            isActive: variant.availableForSale !== false,
          },
          update: {
            name: String(variant.title ?? 'Estandar'),
            sku: variant.sku ? String(variant.sku) : null,
            priceClp: toIntAmount(variant.price),
            inventory: typeof variant.inventoryQuantity === 'number' ? variant.inventoryQuantity : null,
            isActive: variant.availableForSale !== false,
          },
        });

        result.variants += 1;
      }
    }

    const pageInfo = (products.pageInfo ?? {}) as Record<string, unknown>;
    hasNext = pageInfo.hasNextPage === true;
    cursor = hasNext ? String(pageInfo.endCursor ?? '') : null;
  }

  // Lo que ya no viene de Shopify se archiva, no se borra: puede estar
  // referenciado por pedidos historicos.
  if (seenExternalIds.length > 0) {
    const archived = await prisma.product.updateMany({
      where: {
        connectionId: input.connectionId,
        externalId: { notIn: seenExternalIds },
        status: ProductStatus.ACTIVE,
      },
      data: { status: ProductStatus.ARCHIVED },
    });
    result.archived = archived.count;
  }

  await prisma.commerceConnection.update({
    where: { id: input.connectionId },
    data: { lastSyncAt: new Date() },
  });

  await recordAudit({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: 'shopify.catalog_synced',
    entity: 'CommerceConnection',
    entityId: input.connectionId,
    metadata: result as never,
  });

  return result;
}

export type LiveVariant = {
  externalId: string;
  title: string;
  sku: string | null;
  priceClp: number;
  inventory: number | null;
  availableForSale: boolean;
  productTitle: string;
};

/**
 * Consulta viva de una variante.
 *
 * La spec lo exige antes de cada checkout: el precio y el stock de la copia
 * local pueden tener horas de antiguedad, y vender a un precio viejo es un
 * problema real, no teorico.
 */
export async function fetchLiveVariant(
  fetcher: GraphQLFetcher,
  externalVariantId: string,
): Promise<LiveVariant | null> {
  const data = await fetcher(VARIANT_QUERY, { id: externalVariantId });
  const variant = data.productVariant as Record<string, unknown> | null;

  if (!variant) return null;

  const product = (variant.product ?? {}) as Record<string, unknown>;

  return {
    externalId: String(variant.id),
    title: String(variant.title ?? 'Estandar'),
    sku: variant.sku ? String(variant.sku) : null,
    priceClp: toIntAmount(variant.price),
    inventory: typeof variant.inventoryQuantity === 'number' ? variant.inventoryQuantity : null,
    availableForSale: variant.availableForSale !== false && product.status === 'ACTIVE',
    productTitle: String(product.title ?? ''),
  };
}

/** Conexion Shopify activa del workspace, o null. */
export async function getShopifyConnection(workspaceId: string) {
  return prisma.commerceConnection.findFirst({
    where: { workspaceId, provider: CommerceProvider.SHOPIFY },
  });
}
