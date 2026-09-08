import type { GraphQLFetcher } from '../../src/lib/shopify/client';

/**
 * Fixtures de la Admin API de Shopify.
 *
 * Reproducen la forma real de las respuestas GraphQL y de los webhooks para
 * poder probar el flujo completo sin credenciales ni una tienda de desarrollo.
 */
export type FakeVariant = {
  id: string;
  title: string;
  sku?: string;
  price: string;
  inventoryQuantity: number | null;
  availableForSale?: boolean;
};

export type FakeProduct = {
  id: string;
  title: string;
  description?: string;
  status?: string;
  variants: FakeVariant[];
};

/** Fetcher falso: responde a las tres consultas que usa el CRM. */
export function fakeShopifyFetcher(options: {
  products?: FakeProduct[];
  draftOrder?: { id: string; name: string; invoiceUrl: string };
  userErrors?: { field?: string[]; message: string }[];
  onCall?: (query: string, variables?: Record<string, unknown>) => void;
}): GraphQLFetcher & { calls: { query: string; variables?: Record<string, unknown> }[] } {
  const calls: { query: string; variables?: Record<string, unknown> }[] = [];

  const fetcher = (async (query: string, variables?: Record<string, unknown>) => {
    calls.push({ query, variables });
    options.onCall?.(query, variables);

    if (query.includes('query Products')) {
      return {
        products: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: (options.products ?? []).map((product) => ({
            id: product.id,
            title: product.title,
            description: product.description ?? '',
            status: product.status ?? 'ACTIVE',
            variants: {
              nodes: product.variants.map((variant) => ({
                id: variant.id,
                title: variant.title,
                sku: variant.sku ?? null,
                price: variant.price,
                inventoryQuantity: variant.inventoryQuantity,
                availableForSale: variant.availableForSale !== false,
              })),
            },
          })),
        },
      };
    }

    if (query.includes('query Variant')) {
      const wanted = String(variables?.id ?? '');
      for (const product of options.products ?? []) {
        const variant = product.variants.find((item) => item.id === wanted);
        if (variant) {
          return {
            productVariant: {
              id: variant.id,
              title: variant.title,
              sku: variant.sku ?? null,
              price: variant.price,
              inventoryQuantity: variant.inventoryQuantity,
              availableForSale: variant.availableForSale !== false,
              product: { id: product.id, title: product.title, status: product.status ?? 'ACTIVE' },
            },
          };
        }
      }
      return { productVariant: null };
    }

    if (query.includes('mutation DraftOrderCreate')) {
      if (options.userErrors && options.userErrors.length > 0) {
        return { draftOrderCreate: { draftOrder: null, userErrors: options.userErrors } };
      }
      return {
        draftOrderCreate: {
          draftOrder: options.draftOrder ?? {
            id: 'gid://shopify/DraftOrder/1',
            name: '#D1',
            invoiceUrl: 'https://tienda-demo.myshopify.com/invoices/abc123',
            totalPriceSet: { shopMoney: { amount: '19990.00', currencyCode: 'CLP' } },
          },
          userErrors: [],
        },
      };
    }

    return {};
  }) as GraphQLFetcher & { calls: typeof calls };

  fetcher.calls = calls;
  return fetcher;
}

/** Payload de `orders/create` u `orders/paid`. */
export function orderWebhookPayload(input: {
  id: number;
  gid?: string;
  totalPrice: string;
  financialStatus?: string;
  email?: string;
  name?: string;
}) {
  return {
    id: input.id,
    admin_graphql_api_id: input.gid ?? `gid://shopify/Order/${input.id}`,
    name: input.name ?? `#${input.id}`,
    email: input.email ?? 'cliente@ejemplo.test',
    currency: 'CLP',
    total_price: input.totalPrice,
    financial_status: input.financialStatus ?? 'pending',
    customer: { first_name: 'Cliente', last_name: 'Shopify' },
  };
}

export function fulfillmentWebhookPayload(input: { id: number; orderId: number; trackingUrl?: string }) {
  return {
    id: input.id,
    order_id: input.orderId,
    status: 'success',
    tracking_url: input.trackingUrl ?? null,
  };
}

export function uninstalledPayload(shop: string) {
  return { id: 1, domain: shop, myshopify_domain: shop };
}
