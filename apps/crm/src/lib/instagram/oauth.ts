/**
 * OAuth de Instagram API with Instagram Login (Business Login for Instagram).
 *
 * No requiere Pagina de Facebook: la cuenta autoriza directamente como cuenta
 * profesional (Business o Creator) y el intercambio de codigo ocurre contra
 * `api.instagram.com`, no `graph.facebook.com` — son hosts distintos a
 * proposito, documentados por Meta para este producto especifico.
 *
 * Principio de minimo privilegio (spec Fase D1, seccion 2): solo se piden los
 * tres scopes que Upzites Flow usa hoy. NO se pide
 * `instagram_business_content_publish` porque no publicamos posts.
 */
export const INSTAGRAM_OAUTH_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
] as const;

export const INSTAGRAM_OAUTH_NONCE_COOKIE = 'upzites_ig_oauth_nonce';

export type InstagramOAuthConfig = { appId: string; appSecret: string; baseUrl: string };

export function getInstagramOAuthConfig(): InstagramOAuthConfig | null {
  const appId = process.env.META_INSTAGRAM_APP_ID?.trim();
  const appSecret = process.env.META_INSTAGRAM_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;
  return {
    appId,
    appSecret,
    baseUrl: (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, ''),
  };
}

export function instagramRedirectUri(config: Pick<InstagramOAuthConfig, 'baseUrl'>) {
  return `${config.baseUrl}/api/integrations/instagram/oauth/callback`;
}

/** URL de autorizacion oficial de Business Login for Instagram. */
export function buildInstagramAuthorizationUrl(input: { config: InstagramOAuthConfig; state: string }) {
  const params = new URLSearchParams({
    client_id: input.config.appId,
    redirect_uri: instagramRedirectUri(input.config),
    response_type: 'code',
    scope: INSTAGRAM_OAUTH_SCOPES.join(','),
    state: input.state,
  });
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

export class InstagramOAuthError extends Error {}

export type InstagramShortLivedToken = { accessToken: string; userId: string };

/** Canjea el `code` del callback por un token de corta duracion (~1h). */
export async function exchangeInstagramOAuthCode(input: {
  config: InstagramOAuthConfig;
  code: string;
  fetchImpl?: typeof fetch;
}): Promise<InstagramShortLivedToken> {
  const doFetch = input.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    client_id: input.config.appId,
    client_secret: input.config.appSecret,
    grant_type: 'authorization_code',
    redirect_uri: instagramRedirectUri(input.config),
    code: input.code,
  });

  let response: Response;
  try {
    response = await doFetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body });
  } catch (error) {
    throw new InstagramOAuthError(error instanceof Error ? error.message : 'error de red');
  }
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    user_id?: string | number;
    error_message?: string;
  };
  if (!response.ok || !payload.access_token || payload.user_id === undefined) {
    throw new InstagramOAuthError(payload.error_message ?? `HTTP ${response.status}`);
  }
  return { accessToken: payload.access_token, userId: String(payload.user_id) };
}

export type InstagramLongLivedToken = { accessToken: string; expiresInSeconds: number };

/**
 * Convierte el token de corta duracion en uno de larga duracion (~60 dias).
 * Instagram Login NO entrega refresh_token: el ciclo de vida oficial es
 * "extender" el token vigente antes de que venza (ver token-lifecycle.ts).
 */
export async function exchangeForLongLivedInstagramToken(input: {
  shortLivedAccessToken: string;
  appSecret: string;
  fetchImpl?: typeof fetch;
}): Promise<InstagramLongLivedToken> {
  const doFetch = input.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: input.appSecret,
    access_token: input.shortLivedAccessToken,
  });
  let response: Response;
  try {
    response = await doFetch(`https://graph.instagram.com/access_token?${params.toString()}`);
  } catch (error) {
    throw new InstagramOAuthError(error instanceof Error ? error.message : 'error de red');
  }
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_message?: string;
  };
  if (!response.ok || !payload.access_token || !payload.expires_in) {
    throw new InstagramOAuthError(payload.error_message ?? `HTTP ${response.status}`);
  }
  return { accessToken: payload.access_token, expiresInSeconds: payload.expires_in };
}

export type InstagramProfile = { id: string; username: string | null };

/** Identidad de la cuenta profesional autorizada. */
export async function fetchInstagramProfile(input: {
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<InstagramProfile> {
  const doFetch = input.fetchImpl ?? fetch;
  const params = new URLSearchParams({ fields: 'user_id,username', access_token: input.accessToken });
  let response: Response;
  try {
    response = await doFetch(`https://graph.instagram.com/v21.0/me?${params.toString()}`);
  } catch (error) {
    throw new InstagramOAuthError(error instanceof Error ? error.message : 'error de red');
  }
  const payload = (await response.json().catch(() => ({}))) as {
    user_id?: string;
    username?: string;
    error?: { message?: string };
  };
  if (!response.ok || !payload.user_id) {
    throw new InstagramOAuthError(payload.error?.message ?? `HTTP ${response.status}`);
  }
  return { id: payload.user_id, username: payload.username ?? null };
}
