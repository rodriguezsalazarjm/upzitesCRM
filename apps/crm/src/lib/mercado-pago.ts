import {
  MercadoPagoConfig,
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

/** Cliente de pagos de la cuenta de Upzites (suscripcion del CRM). */
export function getPaymentClient() {
  const cfg = getPlatformConfig();
  return cfg ? new Payment(cfg) : null;
}

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

export class MercadoPagoCredentialError extends Error {}

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
