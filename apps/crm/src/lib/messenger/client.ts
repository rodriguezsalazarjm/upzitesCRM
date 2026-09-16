import { decryptSecret } from '../crypto';
import type { ChannelSendInput, ChannelSendResult } from '../channels/provider-types';

/**
 * Cliente real del Messenger Platform Send API. Mismo endpoint que Instagram
 * (`/me/messages`), pero con el access token de la PAGINA de Facebook — nunca
 * se reutiliza el token de una cuenta de Instagram aqui ni viceversa.
 *
 * No hay una app de Meta real conectada todavia (ver informe: "ACCION MANUAL
 * META REQUERIDA"); el contrato sigue la documentacion vigente de Meta for
 * Developers, pendiente de reverificar contra una app real.
 */
export async function sendMessengerDirectMessage(input: ChannelSendInput): Promise<ChannelSendResult> {
  if (!input.channelAccount.accessTokenEncrypted) {
    return { ok: false, error: 'La página de Facebook no tiene un token guardado.' };
  }
  const accessToken = decryptSecret(input.channelAccount.accessTokenEncrypted);

  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(accessToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: input.externalUserId },
        message: { text: input.text },
        messaging_type: 'RESPONSE',
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { message_id?: string; error?: { message?: string } };
    if (!response.ok || !body.message_id) {
      return { ok: false, error: body.error?.message ?? `HTTP ${response.status}` };
    }
    return { ok: true, externalMessageId: body.message_id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'error de red' };
  }
}
