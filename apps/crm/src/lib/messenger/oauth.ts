/**
 * OAuth de Messenger: Facebook Login + seleccion de Facebook Page.
 *
 * A diferencia de Instagram Login, este flujo usa el App ID/Secret de nivel
 * app (META_APP_ID/META_APP_SECRET) contra `graph.facebook.com` — es el mismo
 * mecanismo que ya firma los webhooks. Principio de minimo privilegio (spec
 * Fase D1, seccion 2): solo los scopes que Upzites Flow usa hoy.
 * `pages_read_engagement` se agrega porque el caso comercial prioritario
 * (comentario -> DM privado) necesita leer comentarios de la Page via el
 * webhook `feed`, no solo mensajeria.
 */
export const MESSENGER_OAUTH_SCOPES = [
  'pages_show_list',
  'pages_manage_metadata',
  'pages_messaging',
  'pages_read_engagement',
] as const;

export const MESSENGER_OAUTH_NONCE_COOKIE = 'upzites_msgr_oauth_nonce';

export type MessengerOAuthConfig = { appId: string; appSecret: string; baseUrl: string };

export function getMessengerOAuthConfig(): MessengerOAuthConfig | null {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;
  return {
    appId,
    appSecret,
    baseUrl: (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, ''),
  };
}

export function messengerRedirectUri(config: Pick<MessengerOAuthConfig, 'baseUrl'>) {
  return `${config.baseUrl}/api/integrations/messenger/oauth/callback`;
}

/** URL de autorizacion de Facebook Login (dialogo OAuth estandar de Meta). */
export function buildFacebookLoginAuthorizationUrl(input: { config: MessengerOAuthConfig; state: string }) {
  const params = new URLSearchParams({
    client_id: input.config.appId,
    redirect_uri: messengerRedirectUri(input.config),
    response_type: 'code',
    scope: MESSENGER_OAUTH_SCOPES.join(','),
    state: input.state,
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
}

export class MessengerOAuthError extends Error {}

/** Canjea el `code` del callback por un token de usuario de corta duracion. */
export async function exchangeMessengerOAuthCode(input: {
  config: MessengerOAuthConfig;
  code: string;
  fetchImpl?: typeof fetch;
}): Promise<{ accessToken: string }> {
  const doFetch = input.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    client_id: input.config.appId,
    client_secret: input.config.appSecret,
    redirect_uri: messengerRedirectUri(input.config),
    code: input.code,
  });
  let response: Response;
  try {
    response = await doFetch(`https://graph.facebook.com/v21.0/oauth/access_token?${params.toString()}`);
  } catch (error) {
    throw new MessengerOAuthError(error instanceof Error ? error.message : 'error de red');
  }
  const payload = (await response.json().catch(() => ({}))) as { access_token?: string; error?: { message?: string } };
  if (!response.ok || !payload.access_token) {
    throw new MessengerOAuthError(payload.error?.message ?? `HTTP ${response.status}`);
  }
  return { accessToken: payload.access_token };
}

/** Convierte el token de usuario de corta duracion en uno de larga duracion (~60 dias). */
export async function exchangeForLongLivedUserToken(input: {
  config: MessengerOAuthConfig;
  shortLivedAccessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<{ accessToken: string }> {
  const doFetch = input.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: input.config.appId,
    client_secret: input.config.appSecret,
    fb_exchange_token: input.shortLivedAccessToken,
  });
  let response: Response;
  try {
    response = await doFetch(`https://graph.facebook.com/v21.0/oauth/access_token?${params.toString()}`);
  } catch (error) {
    throw new MessengerOAuthError(error instanceof Error ? error.message : 'error de red');
  }
  const payload = (await response.json().catch(() => ({}))) as { access_token?: string; error?: { message?: string } };
  if (!response.ok || !payload.access_token) {
    throw new MessengerOAuthError(payload.error?.message ?? `HTTP ${response.status}`);
  }
  return { accessToken: payload.access_token };
}

export type ManagedPage = { id: string; name: string; accessToken: string };

/**
 * Pages administradas/autorizadas por el usuario (`GET /me/accounts`). El
 * Page Access Token que trae cada elemento es de larga duracion cuando el
 * token de usuario usado para pedirlo tambien lo es (nuestro caso: siempre
 * pedimos esto con el token de usuario YA intercambiado por uno de larga
 * duracion) — no hace falta un intercambio adicional por Page.
 */
export async function fetchManagedPages(input: {
  userAccessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<ManagedPage[]> {
  const doFetch = input.fetchImpl ?? fetch;
  const params = new URLSearchParams({ fields: 'id,name,access_token', access_token: input.userAccessToken });
  let response: Response;
  try {
    response = await doFetch(`https://graph.facebook.com/v21.0/me/accounts?${params.toString()}`);
  } catch (error) {
    throw new MessengerOAuthError(error instanceof Error ? error.message : 'error de red');
  }
  const payload = (await response.json().catch(() => ({}))) as {
    data?: Array<{ id?: string; name?: string; access_token?: string }>;
    error?: { message?: string };
  };
  if (!response.ok || !payload.data) {
    throw new MessengerOAuthError(payload.error?.message ?? `HTTP ${response.status}`);
  }
  return payload.data
    .filter((page): page is { id: string; name: string; access_token: string } => Boolean(page.id && page.name && page.access_token))
    .map((page) => ({ id: page.id, name: page.name, accessToken: page.access_token }));
}
