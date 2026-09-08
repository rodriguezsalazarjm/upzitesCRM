import { decryptSecret } from '../crypto';
import { isValidShopDomain, shopifyApiVersion } from './oauth';

/**
 * Cliente de la Admin GraphQL API de Shopify.
 *
 * Se usa GraphQL y no REST porque la spec pide no depender de APIs obsoletas:
 * Shopify viene retirando endpoints REST de productos y pedidos.
 */
export class ShopifyApiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ShopifyApiError';
  }
}

export type ShopifyConnection = {
  shopDomain: string | null;
  accessTokenEncrypted: string | null;
};

export type GraphQLFetcher = (query: string, variables?: Record<string, unknown>) => Promise<Record<string, unknown>>;

/**
 * Devuelve una funcion para consultar la tienda.
 *
 * Recibir la conexion y devolver un fetcher permite inyectar uno falso en las
 * pruebas sin tocar la logica de sincronizacion ni la de pedidos.
 */
export function createShopifyClient(connection: ShopifyConnection): GraphQLFetcher {
  const shop = connection.shopDomain;

  if (!shop || !isValidShopDomain(shop)) {
    throw new ShopifyApiError('La conexion no tiene un dominio de tienda valido.', false);
  }
  if (!connection.accessTokenEncrypted) {
    throw new ShopifyApiError('La conexion no tiene token: hay que reconectar la tienda.', false);
  }

  const token = decryptSecret(connection.accessTokenEncrypted);
  const endpoint = `https://${shop}/admin/api/${shopifyApiVersion()}/graphql.json`;

  return async (query, variables) => {
    let response: Response;

    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (error) {
      throw new ShopifyApiError(error instanceof Error ? error.message : 'error de red', true);
    }

    if (response.status === 401 || response.status === 403) {
      // El token dejo de servir: hay que reconectar, reintentar no sirve.
      throw new ShopifyApiError('Shopify rechazo el token. Reconecta la tienda.', false, response.status);
    }

    if (response.status === 429 || response.status >= 500) {
      throw new ShopifyApiError(`Shopify respondio ${response.status}.`, true, response.status);
    }

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    // GraphQL devuelve 200 con errores en el cuerpo: hay que mirarlos.
    if (Array.isArray(body.errors) && body.errors.length > 0) {
      const first = body.errors[0] as Record<string, unknown>;
      throw new ShopifyApiError(String(first.message ?? 'error de GraphQL'), false, response.status);
    }

    return (body.data ?? {}) as Record<string, unknown>;
  };
}

// --- Consultas ---------------------------------------------------------------

export const PRODUCTS_QUERY = `
  query Products($cursor: String) {
    products(first: 50, after: $cursor, query: "status:active") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        description
        status
        variants(first: 50) {
          nodes {
            id
            title
            sku
            price
            inventoryQuantity
            availableForSale
          }
        }
      }
    }
  }
`;

/** Precio e inventario VIVOS de una variante, justo antes de vender. */
export const VARIANT_QUERY = `
  query Variant($id: ID!) {
    productVariant(id: $id) {
      id
      title
      sku
      price
      inventoryQuantity
      availableForSale
      product { id title status }
    }
  }
`;

export const DRAFT_ORDER_MUTATION = `
  mutation DraftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder { id name invoiceUrl totalPriceSet { shopMoney { amount currencyCode } } }
      userErrors { field message }
    }
  }
`;

/** Convierte "19990.00" a 19990. Shopify devuelve el precio como texto decimal. */
export function toIntAmount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}
