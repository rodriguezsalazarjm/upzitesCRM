import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * OAuth de Shopify.
 *
 * Tres controles que la spec exige y que hay que tener juntos:
 *
 *   1. `state` firmado con nonce y vencimiento — evita que alguien inicie el
 *      flujo por ti (CSRF).
 *   2. HMAC de la query del callback — verifica que la respuesta viene de
 *      Shopify y no fue manipulada.
 *   3. Validacion del dominio de la tienda — sin esto, un `shop` arbitrario
 *      haria que el servidor pida tokens a un host cualquiera (SSRF).
 */
const STATE_TTL_MS = 10 * 60_000;
const API_VERSION = '2025-01';

export type ShopifyOAuthConfig = {
  apiKey: string;
  apiSecret: string;
  scopes: string;
  appUrl: string;
};

export function getShopifyConfig(): ShopifyOAuthConfig | null {
  const apiKey = process.env.SHOPIFY_API_KEY?.trim();
  const apiSecret = process.env.SHOPIFY_API_SECRET?.trim();

  if (!apiKey || !apiSecret) return null;

  return {
    apiKey,
    apiSecret,
    // Scopes minimos (spec, seccion 14): productos, inventario, pedidos.
    scopes:
      process.env.SHOPIFY_SCOPES?.trim() ??
      'read_products,read_inventory,write_draft_orders,read_orders,read_fulfillments',
    appUrl: (process.env.SHOPIFY_APP_URL ?? process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(
      /\/+$/,
      '',
    ),
  };
}

export function shopifyApiVersion() {
  return process.env.SHOPIFY_API_VERSION ?? API_VERSION;
}

/**
 * Valida el dominio de la tienda.
 *
 * Solo `<nombre>.myshopify.com`. Es la defensa contra que el parametro `shop`
 * apunte el servidor a un host arbitrario.
 */
export function isValidShopDomain(shop: string) {
  return /^[a-z0-9][a-z0-9-]{0,59}\.myshopify\.com$/i.test(shop.trim());
}

function sign(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export type StatePayload = { workspaceId: string; shop: string; nonce: string; exp: number };

export function createState(input: { workspaceId: string; shop: string }, secret: string) {
  const payload: StatePayload = {
    workspaceId: input.workspaceId,
    shop: input.shop.toLowerCase(),
    nonce: randomBytes(16).toString('base64url'),
    exp: Date.now() + STATE_TTL_MS,
  };

  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { state: `${body}.${sign(body, secret)}`, nonce: payload.nonce };
}

export type StateVerification =
  | { valid: true; payload: StatePayload }
  | { valid: false; reason: string };

export function verifyState(state: string, secret: string): StateVerification {
  const [body, signature] = state.split('.');
  if (!body || !signature) return { valid: false, reason: 'formato de state invalido' };

  const expected = sign(body, secret);
  const received = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (received.length !== expectedBuffer.length || !timingSafeEqual(received, expectedBuffer)) {
    return { valid: false, reason: 'firma del state invalida' };
  }

  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'state ilegible' };
  }

  if (!payload.exp || payload.exp < Date.now()) {
    return { valid: false, reason: 'state vencido' };
  }

  return { valid: true, payload };
}

/**
 * Verifica el HMAC de la query del callback.
 *
 * Shopify firma todos los parametros MENOS `hmac`, ordenados alfabeticamente y
 * unidos con `&`. Un parametro de mas o de menos cambia la firma.
 */
export function verifyCallbackHmac(searchParams: URLSearchParams, secret: string) {
  const received = searchParams.get('hmac');
  if (!received) return { valid: false as const, reason: 'falta el hmac' };

  const message = [...searchParams.entries()]
    .filter(([key]) => key !== 'hmac' && key !== 'signature')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  const expected = createHmac('sha256', secret).update(message).digest('hex');
  const receivedBuffer = Buffer.from(received, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) {
    return { valid: false as const, reason: 'hmac invalido' };
  }

  return { valid: true as const };
}

/** URL de instalacion a la que se redirige al usuario. */
export function buildInstallUrl(input: { shop: string; state: string; config: ShopifyOAuthConfig }) {
  const params = new URLSearchParams({
    client_id: input.config.apiKey,
    scope: input.config.scopes,
    redirect_uri: `${input.config.appUrl}/api/integrations/shopify/callback`,
    state: input.state,
    // Token offline: no vence con la sesion del usuario (spec, seccion 14).
    'grant_options[]': '',
  });

  return `https://${input.shop}/admin/oauth/authorize?${params.toString()}`;
}

export type TokenExchange =
  | { ok: true; accessToken: string; scope: string }
  | { ok: false; error: string };

/** Canjea el `code` del callback por un token offline. */
export async function exchangeCodeForToken(input: {
  shop: string;
  code: string;
  config: ShopifyOAuthConfig;
  fetchImpl?: typeof fetch;
}): Promise<TokenExchange> {
  // El dominio se revalida aqui aunque ya se haya validado antes: esta funcion
  // hace una peticion saliente y no debe depender de que el llamador lo hiciera.
  if (!isValidShopDomain(input.shop)) {
    return { ok: false, error: 'dominio de tienda invalido' };
  }

  const doFetch = input.fetchImpl ?? fetch;

  try {
    const response = await doFetch(`https://${input.shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: input.config.apiKey,
        client_secret: input.config.apiSecret,
        code: input.code,
      }),
    });

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok || typeof body.access_token !== 'string') {
      return { ok: false, error: String(body.error_description ?? body.error ?? `HTTP ${response.status}`) };
    }

    return { ok: true, accessToken: body.access_token, scope: String(body.scope ?? '') };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'error de red' };
  }
}

/**
 * Verifica la firma de un webhook de Shopify.
 *
 * Va sobre el cuerpo CRUDO y en base64, no en hex como la de Meta. Es un
 * detalle facil de equivocar y hace que nada valide.
 */
export function verifyWebhookHmac(input: { rawBody: string; header: string | null; secret: string }) {
  if (!input.header) return { valid: false as const, reason: 'falta x-shopify-hmac-sha256' };

  const expected = createHmac('sha256', input.secret).update(input.rawBody, 'utf8').digest('base64');
  const received = Buffer.from(input.header, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  if (received.length !== expectedBuffer.length || !timingSafeEqual(received, expectedBuffer)) {
    return { valid: false as const, reason: 'hmac invalido' };
  }

  return { valid: true as const };
}
