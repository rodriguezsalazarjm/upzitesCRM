import { decryptSecret } from '../crypto';
import type { ChannelSendInput, ChannelSendResult } from '../channels/provider-types';

/**
 * Cliente real de Instagram Messaging API (Graph). Comparte el endpoint de
 * envio con Messenger — Meta unifico el Send API bajo `/me/messages` para
 * ambos productos, distinguido por el access token de la cuenta que envia.
 *
 * No hay una app de Meta real conectada todavia (ver informe: "ACCION MANUAL
 * META REQUERIDA"), asi que esta funcion nunca se ejercito contra la API real
 * — el contrato sigue la documentacion vigente de Meta for Developers, pero
 * debe reverificarse en cuanto exista una app real para probarla.
 */
export async function sendInstagramDirectMessage(input: ChannelSendInput): Promise<ChannelSendResult> {
  if (!input.channelAccount.accessTokenEncrypted) {
    return { ok: false, error: 'La cuenta de Instagram no tiene un token guardado.' };
  }
  const accessToken = decryptSecret(input.channelAccount.accessTokenEncrypted);

  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(accessToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: input.externalUserId },
        message: { text: input.text },
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
