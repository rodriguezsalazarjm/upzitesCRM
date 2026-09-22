import {
  MercadoPagoConfig,
  OAuth,
  Preference,
  Payment,
  User,
  WebhookSignatureValidator,
  InvalidWebhookSignatureError,
} from 'mercadopago';
import { UserRole } from '../../generated/prisma/client';
import type { WorkspaceMercadoPagoConnection } from './commerce/mercado-pago-connection';

/** Solo owner/admin conectan o desconectan la cuenta de pagos del workspace. */
export function canManageMercadoPago(role: UserRole) {
  return role === UserRole.OWNER || role === UserRole.ADMIN;
}

/**
 * Dos cuentas de Mercado Pago conviven en este archivo, a proposito:
 *
 *  - La PLATAFORMA (variables de entorno): Upzites cobrando la suscripcion
 *    mensual del CRM a cada workspace. Global, no cambia con esta fase.
 *  - Cada WORKSPACE (MercadoPagoConnection, tabla): el negocio del cliente
 *    cobrando SUS propios productos (CustomerOrder/Payment). Credenciales
 *    cifradas y aisladas por workspace, nunca compartidas entre tenants.
 *
 * No fusionar ambos caminos: mezclarlos haria que la venta de un infoproducto
 * de un workspace cobrara con la cuenta de Mercado Pago de otro, o con la de
 * Upzites.
 */

let platformConfig: MercadoPagoConfig | null = null;

function getPlatformConfig() {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) return null;
  if (!platformConfig) platformConfig = new MercadoPagoConfig({ accessToken });
  return platformConfig;
}

/** Cliente de preferencias de la cuenta de Upzites (suscripcion del CRM). */
export function getPreferenceClient() {
  const cfg = getPlatformConfig();
  return cfg ? new Preference(cfg) : null;
}

/**
 * URL de checkout de una preferencia. Mercado Pago devuelve SIEMPRE ambas
 * (`init_point` y `sandbox_init_point`), tambien con credenciales productivas:
 * elegir por presencia mandaria a los clientes reales al checkout de pruebas.
 * Solo un access token de prueba (`TEST-...`) usa el sandbox.
 */
export function preferenceCheckoutUrl(
  preference: { init_point?: string; sandbox_init_point?: string },
  accessToken: string | undefined,
) {
  return accessToken?.startsWith('TEST-')
    ? preference.sandbox_init_point ?? preference.init_point
    : preference.init_point;
}

/** Cliente de pagos de la cuenta de Upzites (suscripcion del CRM). */
export function getPaymentClient() {
  const cfg = getPlatformConfig();
  return cfg ? new Payment(cfg) : null;
}

export class MercadoPagoCredentialError extends Error {}

export type WebhookVerification = { valid: true } | { valid: false; reason: string };

function validateSignature(input: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secret: string;
}): WebhookVerification {
  try {
    WebhookSignatureValidator.validate({
      xSignature: input.xSignature,
      xRequestId: input.xRequestId,
      dataId: input.dataId,
      secret: input.secret,
      toleranceSeconds: 300,
    });
    return { valid: true };
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      return { valid: false, reason: error.reason };
    }
    throw error;
  }
}

/**
 * Valida la firma x-signature de una notificacion de la cuenta de Upzites
 * (suscripcion del CRM), usando el validador oficial del SDK (HMAC-SHA256,
 * comparacion en tiempo constante). toleranceSeconds mitiga repeticion (replay).
 */
export function verifyWebhookSignature(input: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
}): WebhookVerification {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret) return { valid: false, reason: 'MERCADO_PAGO_WEBHOOK_SECRET not configured' };
  return validateSignature({ ...input, secret });
}

// --- Por workspace: la cuenta de Mercado Pago del propio negocio ------------
//
// getWorkspaceMercadoPagoConnection vive en
// src/lib/commerce/mercado-pago-connection.ts (importa prisma; este archivo
// no lo hace, para que sus funciones puras se puedan probar sin DB).

/** Cliente de preferencias de la cuenta de Mercado Pago de UN workspace. */
export function getWorkspacePreferenceClient(connection: WorkspaceMercadoPagoConnection) {
  return new Preference(new MercadoPagoConfig({ accessToken: connection.accessToken }));
}

/** Cliente de pagos de la cuenta de Mercado Pago de UN workspace. */
export function getWorkspacePaymentClient(connection: WorkspaceMercadoPagoConnection) {
  return new Payment(new MercadoPagoConfig({ accessToken: connection.accessToken }));
}

/** Igual que verifyWebhookSignature, pero con el secreto propio del workspace. */
export function verifyWorkspaceWebhookSignature(input: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  webhookSecret: string;
}): WebhookVerification {
  return validateSignature({ ...input, secret: input.webhookSecret });
}

// --- OAuth (marketplace): la APLICACION de Mercado Pago de Upzites Flow -----
//
// Tercer contexto de credenciales, distinto de los dos de arriba: no es la
// cuenta de Upzites ni la de un workspace, es la app OAuth con la que cada
// vendedor autoriza a Upzites Flow a operar en su nombre. Vive en variables
// de entorno porque, igual que MERCADO_PAGO_ACCESS_TOKEN, es una credencial
// de plataforma unica, no algo que cada workspace configure.

export type MercadoPagoOAuthConfig = {
  clientId: string;
  clientSecret: string;
  /** Bearer de la propia cuenta de Upzites: MP exige autenticar asi las
   *  llamadas a /oauth/token, ademas del client_id/client_secret en el body. */
  platformAccessToken: string;
};

export function getPlatformOAuthConfig(): MercadoPagoOAuthConfig | null {
  const clientId = process.env.MERCADO_PAGO_CLIENT_ID?.trim();
  const clientSecret = process.env.MERCADO_PAGO_CLIENT_SECRET?.trim();
  const platformAccessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
  if (!clientId || !clientSecret || !platformAccessToken) return null;
  return { clientId, clientSecret, platformAccessToken };
}

function oauthClient(config: MercadoPagoOAuthConfig) {
  return new OAuth(new MercadoPagoConfig({ accessToken: config.platformAccessToken }));
}

/** URL a la que se redirige al vendedor para que autorice la aplicacion. */
export function buildMercadoPagoAuthorizationUrl(input: {
  config: MercadoPagoOAuthConfig;
  state: string;
  redirectUri: string;
}) {
  return oauthClient(input.config).getAuthorizationURL({
    options: { client_id: input.config.clientId, redirect_uri: input.redirectUri, state: input.state },
  });
}

export type MercadoPagoOAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number | null;
  mercadoPagoUserId: string;
  publicKey: string | null;
  liveMode: boolean;
  scope: string | null;
};

function tokensFromResponse(response: {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user_id?: number;
  public_key?: string;
  live_mode?: boolean;
  scope?: string;
}): MercadoPagoOAuthTokens {
  if (!response.access_token || response.user_id === undefined) {
    throw new MercadoPagoCredentialError('Respuesta de OAuth incompleta.');
  }
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? null,
    expiresInSeconds: response.expires_in ?? null,
    mercadoPagoUserId: String(response.user_id),
    publicKey: response.public_key ?? null,
    liveMode: response.live_mode ?? false,
    scope: response.scope ?? null,
  };
}

/** Canjea el `code` del callback por un access/refresh token del vendedor. */
export async function exchangeMercadoPagoOAuthCode(input: {
  config: MercadoPagoOAuthConfig;
  code: string;
  redirectUri: string;
}): Promise<MercadoPagoOAuthTokens> {
  try {
    const response = await oauthClient(input.config).create({
      body: {
        client_id: input.config.clientId,
        client_secret: input.config.clientSecret,
        code: input.code,
        redirect_uri: input.redirectUri,
      },
    });
    return tokensFromResponse(response);
  } catch (error) {
    if (error instanceof MercadoPagoCredentialError) throw error;
    throw new MercadoPagoCredentialError(
      error instanceof Error ? error.message : 'Mercado Pago rechazo el intercambio OAuth.',
    );
  }
}

/** Pide un access token nuevo con el refresh token guardado del vendedor. */
export async function refreshMercadoPagoOAuthToken(input: {
  config: MercadoPagoOAuthConfig;
  refreshToken: string;
}): Promise<MercadoPagoOAuthTokens> {
  try {
    const response = await oauthClient(input.config).refresh({
      body: {
        client_id: input.config.clientId,
        client_secret: input.config.clientSecret,
        refresh_token: input.refreshToken,
      },
    });
    return tokensFromResponse(response);
  } catch (error) {
    if (error instanceof MercadoPagoCredentialError) throw error;
    throw new MercadoPagoCredentialError(
      error instanceof Error ? error.message : 'Mercado Pago rechazo la renovacion del token.',
    );
  }
}

/**
 * Comprueba que un access token de Mercado Pago es valido, ANTES de guardarlo
 * cifrado. `GET /users/me` no cobra ni modifica nada; solo identifica la
 * cuenta duena del token, para mostrarla al operador y detectar un token mal
 * copiado o revocado antes de que falle en produccion.
 */
export async function verifyMercadoPagoAccessToken(accessToken: string) {
  const client = new User(new MercadoPagoConfig({ accessToken }));
  let profile;
  try {
    profile = await client.get();
  } catch (error) {
    throw new MercadoPagoCredentialError(
      error instanceof Error ? error.message : 'Mercado Pago rechazo el token.',
    );
  }
  return {
    accountId: profile.id ?? null,
    email: profile.email ?? null,
    siteId: profile.site_id ?? null,
  };
}
