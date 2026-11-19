import { ChannelAccountStatus } from '../../../generated/prisma/client';
import { decryptSecret, encryptSecret } from '../crypto';
import { prisma } from '../prisma';

/**
 * P29: Login Kit de TikTok (OAuth v2) para el Content Posting API. Es una
 * cuenta de CREADOR (open_id), distinta de la mensajeria de negocio de
 * client.ts, que sigue sin aprobacion. Nunca se ejercito contra la API real:
 * requiere una app de TikTok con Login Kit + Content Posting API.
 *
 * Tokens: access ~24 h, refresh ~365 dias. Refrescar puede devolver un
 * refresh_token NUEVO: siempre se guarda el que llega.
 */
export const TIKTOK_OAUTH_SCOPES = ['user.info.basic', 'user.info.stats', 'video.publish', 'video.list'] as const;
export const TIKTOK_OAUTH_NONCE_COOKIE = 'upzites_tt_oauth_nonce';
const API = 'https://open.tiktokapis.com/v2';
/** Refrescar con 10 min de margen: el access token dura solo ~24 h. */
const REFRESH_MARGIN_MS = 10 * 60_000;

export type TikTokOAuthConfig = { clientKey: string; clientSecret: string; baseUrl: string };

export function getTikTokOAuthConfig(): TikTokOAuthConfig | null {
  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();
  if (!clientKey || !clientSecret) return null;
  return { clientKey, clientSecret, baseUrl: (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '') };
}

export const tiktokRedirectUri = (config: Pick<TikTokOAuthConfig, 'baseUrl'>) => `${config.baseUrl}/api/integrations/tiktok/oauth/callback`;

export function buildTikTokAuthorizationUrl(input: { config: TikTokOAuthConfig; state: string }) {
  const params = new URLSearchParams({
    client_key: input.config.clientKey,
    scope: TIKTOK_OAUTH_SCOPES.join(','),
    response_type: 'code',
    redirect_uri: tiktokRedirectUri(input.config),
    state: input.state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
}

export class TikTokOAuthError extends Error {}

export type TikTokTokens = {
  accessToken: string;
  expiresInSeconds: number;
  refreshToken: string;
  refreshExpiresInSeconds: number;
  openId: string;
  grantedScopes: string[];
};

async function tokenRequest(params: Record<string, string>, fetchImpl: typeof fetch): Promise<TikTokTokens> {
  let response: Response;
  try {
    response = await fetchImpl(`${API}/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
  } catch (error) {
    throw new TikTokOAuthError(error instanceof Error ? error.message : 'error de red');
  }
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string; expires_in?: number; refresh_token?: string; refresh_expires_in?: number;
    open_id?: string; scope?: string; error?: string; error_description?: string;
  };
  if (!response.ok || !body.access_token || !body.refresh_token || !body.open_id) {
    throw new TikTokOAuthError(body.error_description || body.error || `HTTP ${response.status}`);
  }
  return {
    accessToken: body.access_token,
    expiresInSeconds: body.expires_in ?? 86_400,
    refreshToken: body.refresh_token,
    refreshExpiresInSeconds: body.refresh_expires_in ?? 31_536_000,
    openId: body.open_id,
    grantedScopes: (body.scope ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  };
}

export function exchangeTikTokOAuthCode(input: { config: TikTokOAuthConfig; code: string; fetchImpl?: typeof fetch }) {
  return tokenRequest(
    { client_key: input.config.clientKey, client_secret: input.config.clientSecret, code: input.code, grant_type: 'authorization_code', redirect_uri: tiktokRedirectUri(input.config) },
    input.fetchImpl ?? fetch,
  );
}

export function refreshTikTokToken(input: { config: TikTokOAuthConfig; refreshToken: string; fetchImpl?: typeof fetch }) {
  return tokenRequest(
    { client_key: input.config.clientKey, client_secret: input.config.clientSecret, grant_type: 'refresh_token', refresh_token: input.refreshToken },
    input.fetchImpl ?? fetch,
  );
}

/** Respuesta comun del API v2: `error.code === 'ok'` es exito aunque venga el objeto error. */
export async function tiktokApi<T>(path: string, accessToken: string, init: { body?: unknown; fetchImpl?: typeof fetch } = {}) {
  const response = await (init.fetchImpl ?? fetch)(`${API}${path}`, {
    method: init.body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.body === undefined ? {} : { 'Content-Type': 'application/json; charset=UTF-8' }) },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const body = (await response.json().catch(() => ({}))) as { data?: T; error?: { code?: string; message?: string } };
  const code = body.error?.code ?? (response.ok ? 'ok' : `http_${response.status}`);
  return { ok: response.ok && code === 'ok', status: response.status, code, message: body.error?.message ?? '', data: body.data };
}

export type TikTokProfile = { openId: string; displayName: string | null };

export async function fetchTikTokProfile(accessToken: string, fetchImpl?: typeof fetch): Promise<TikTokProfile> {
  const result = await tiktokApi<{ user?: { open_id?: string; display_name?: string } }>('/user/info/?fields=open_id,display_name', accessToken, { fetchImpl });
  if (!result.ok || !result.data?.user?.open_id) throw new TikTokOAuthError(result.message || result.code);
  return { openId: result.data.user.open_id, displayName: result.data.user.display_name ?? null };
}

export function missingTikTokScopes(stored: string | null | undefined) {
  const granted = new Set((stored ?? '').split(',').map((s) => s.trim()));
  return TIKTOK_OAUTH_SCOPES.filter((scope) => !granted.has(scope));
}

/** Datos de token para guardar en ChannelAccount (cifrados). */
export function tokenColumns(tokens: TikTokTokens, now = Date.now()) {
  return {
    accessTokenEncrypted: encryptSecret(tokens.accessToken),
    accessTokenExpiresAt: new Date(now + tokens.expiresInSeconds * 1000),
    refreshTokenEncrypted: encryptSecret(tokens.refreshToken),
    // Un refresh sin `scope` no debe borrar los permisos guardados.
    ...(tokens.grantedScopes.length ? { scopes: tokens.grantedScopes.join(',') } : {}),
  };
}

/**
 * Access token utilizable, refrescado si vence pronto. Si el refresh falla
 * (revocado, vencido el de 365 dias), la cuenta queda REAUTH_REQUIRED: nada
 * debe seguir intentando publicar con un token muerto.
 */
export async function getValidTikTokAccessToken(channelAccountId: string, fetchImpl?: typeof fetch): Promise<{ ok: true; accessToken: string } | { ok: false; reason: string }> {
  const account = await prisma.channelAccount.findUnique({
    where: { id: channelAccountId },
    select: { id: true, channel: true, accessTokenEncrypted: true, accessTokenExpiresAt: true, refreshTokenEncrypted: true },
  });
  if (!account || account.channel !== 'TIKTOK') return { ok: false, reason: 'cuenta de TikTok no encontrada' };
  if (!account.accessTokenEncrypted) return { ok: false, reason: 'sin token guardado: reconecta TikTok' };
  if (account.accessTokenExpiresAt && account.accessTokenExpiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) {
    return { ok: true, accessToken: decryptSecret(account.accessTokenEncrypted) };
  }
  const config = getTikTokOAuthConfig();
  if (!config || !account.refreshTokenEncrypted) return { ok: false, reason: 'el token venció y no se puede refrescar: reconecta TikTok' };
  try {
    const tokens = await refreshTikTokToken({ config, refreshToken: decryptSecret(account.refreshTokenEncrypted), fetchImpl });
    await prisma.channelAccount.update({ where: { id: account.id }, data: { ...tokenColumns(tokens), lastVerifiedAt: new Date(), lastErrorCode: null, lastError: null } });
    return { ok: true, accessToken: tokens.accessToken };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'error desconocido';
    await prisma.channelAccount.update({ where: { id: account.id }, data: { status: ChannelAccountStatus.REAUTH_REQUIRED, lastErrorCode: 'TOKEN_REFRESH_FAILED', lastError: reason } });
    return { ok: false, reason };
  }
}
