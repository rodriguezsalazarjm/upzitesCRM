import { MetaWhatsAppError, metaGraphRequest, whatsappGraphUrl, whatsappGraphVersion } from './meta';

/**
 * Punto 8 — Embedded Signup v4 de Meta (Tech Provider).
 *
 * El cliente autoriza en la ventana de Meta; el navegador recibe un `code` de
 * un solo uso (vence en ~30 s) y los ids de su WABA y numero. El servidor
 * cambia el code por un token de negocio con el secreto de la app, que nunca
 * sale del servidor. Los ids que manda el navegador NO se creen: se comprueban
 * contra Meta con ese token antes de guardar nada (verifyAndSubscribe).
 *
 * Exige que la app de Meta sea Tech Provider con la configuracion de Facebook
 * Login for Business creada; sin esas variables la UI ofrece solo la conexion
 * manual de pilotos.
 */

export type EmbeddedSignupConfig =
  | { enabled: true; appId: string; configId: string; graphVersion: string }
  | { enabled: false; missing: string[] };

export function embeddedSignupConfig(): EmbeddedSignupConfig {
  const appId = process.env.META_APP_ID;
  const configId = process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID;
  const missing = [
    !appId && 'META_APP_ID',
    !process.env.META_APP_SECRET && 'META_APP_SECRET',
    !configId && 'WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID',
  ].filter((value): value is string => Boolean(value));
  if (missing.length > 0 || !appId || !configId) return { enabled: false, missing };
  // appId y configId son publicos: los usa el SDK de Meta en el navegador.
  return { enabled: true, appId, configId, graphVersion: whatsappGraphVersion() };
}

/** Cambia el code de Embedded Signup por un token de negocio. Servidor a servidor. */
export async function exchangeEmbeddedSignupCode(code: string): Promise<string> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    throw new MetaWhatsAppError('La conexión con Meta no está configurada en el servidor.', 'META_UNAVAILABLE', 503);
  }
  const query = new URLSearchParams({ client_id: appId, client_secret: appSecret, code });
  let response: Response;
  try {
    response = await fetch(`${whatsappGraphUrl('oauth/access_token')}?${query}`, { cache: 'no-store' });
  } catch {
    throw new MetaWhatsAppError('No se pudo contactar a Meta. Intenta conectar de nuevo.', 'META_UNAVAILABLE', 502);
  }
  const body = (await response.json().catch(() => ({}))) as { access_token?: unknown };
  if (!response.ok || typeof body.access_token !== 'string' || body.access_token.length < 20) {
    // El code vence en segundos y es de un solo uso: la salida es repetir el
    // flujo, no reintentar el mismo code.
    throw new MetaWhatsAppError(
      'Meta no aceptó la autorización (puede haber vencido). Vuelve a conectar el número.',
      'INVALID_CREDENTIALS',
      400,
    );
  }
  return body.access_token;
}

/**
 * Registra el numero para Cloud API con el PIN de verificacion en dos pasos.
 * Un numero recien creado en Embedded Signup no envia ni recibe hasta esto.
 */
export async function registerPhoneNumber(input: { phoneNumberId: string; accessToken: string; pin: string }) {
  const body = await metaGraphRequest(
    whatsappGraphUrl(`${encodeURIComponent(input.phoneNumberId)}/register`),
    input.accessToken,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', pin: input.pin }) },
  );
  if (body.success !== true && body.success !== 'true') {
    throw new MetaWhatsAppError('Meta no confirmó el registro del número.', 'META_UNAVAILABLE', 502);
  }
}
