import { decryptSecret } from '../crypto';
import { whatsappGraphVersion } from './meta';

/**
 * Cliente minimo de WhatsApp Cloud API.
 *
 * Sin credenciales configuradas devuelve `configured: false` en vez de lanzar:
 * la integracion aparece inactiva y el resto del CRM sigue funcionando.
 */
export type SendResult =
  | { ok: true; externalMessageId: string }
  | { ok: false; retryable: boolean; errorCode?: string; errorMessage: string };

export type ChannelCredentials = {
  phoneNumberId: string;
  accessTokenEncrypted: string | null;
};

function resolveToken(channel: ChannelCredentials) {
  if (channel.accessTokenEncrypted) return decryptSecret(channel.accessTokenEncrypted);
  // Fallback para pilotos con onboarding manual: un token de sistema por env.
  return process.env.WHATSAPP_SYSTEM_ACCESS_TOKEN ?? null;
}

/**
 * Envia un mensaje de texto. Devuelve el id externo para poder correlacionar
 * despues los estados (sent/delivered/read/failed) que llegan por webhook.
 */
export async function sendTextMessage(input: {
  channel: ChannelCredentials;
  to: string;
  text: string;
}): Promise<SendResult> {
  const token = resolveToken(input.channel);

  if (!token) {
    return {
      ok: false,
      retryable: false,
      errorMessage: 'WhatsApp no esta configurado: falta el token de acceso del canal.',
    };
  }

  const url = `https://graph.facebook.com/${whatsappGraphVersion()}/${input.channel.phoneNumberId}/messages`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: input.to.replace(/^\+/, ''),
        type: 'text',
        text: { preview_url: false, body: input.text },
      }),
    });
  } catch {
    // Fallo de red: reintentable, el mensaje sigue en el outbox.
    return {
      ok: false,
      retryable: true,
      errorMessage: 'No se pudo contactar a WhatsApp. El envio se reintentara.',
    };
  }

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    const error = (body.error ?? {}) as Record<string, unknown>;
    const errorCode = error.code ? String(error.code) : String(response.status);
    const invalidCredentials =
      response.status === 401 || response.status === 403 || errorCode === '190';
    return {
      ok: false,
      // 4xx (salvo 429) es un problema del mensaje, no del momento: no reintentar.
      retryable: response.status === 429 || response.status >= 500,
      errorCode,
      // No propagamos el texto de Meta: puede contener detalles de la cuenta o
      // repetir partes de credenciales enviadas por el operador.
      errorMessage: invalidCredentials
        ? 'Las credenciales de WhatsApp son invalidas o vencieron.'
        : `WhatsApp rechazo el envio (codigo ${errorCode}).`,
    };
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const externalMessageId = (messages[0] as Record<string, unknown> | undefined)?.id;
  if (!externalMessageId) {
    return { ok: false, retryable: false, errorMessage: 'La API no devolvio un id de mensaje.' };
  }

  return { ok: true, externalMessageId: String(externalMessageId) };
}
