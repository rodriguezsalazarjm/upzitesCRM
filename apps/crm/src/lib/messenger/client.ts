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

  if (input.delivery === 'PRIVATE_REPLY') return sendMessengerPrivateReply({ accessToken, ...input });
  if (input.delivery === 'PUBLIC_REPLY') return sendMessengerPublicReply({ accessToken, ...input });

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

/**
 * Private Reply a un comentario de Page (`POST /{comment-id}/private_replies`).
 * Mismo endpoint conceptual que Instagram — Meta lo unifico para comentarios
 * de Page tambien — nunca se simula como un envio ordinario a `/me/messages`.
 */
async function sendMessengerPrivateReply(
  input: { accessToken: string } & Pick<ChannelSendInput, 'text' | 'commentId'>,
): Promise<ChannelSendResult> {
  if (!input.commentId) return { ok: false, error: 'Falta el ID del comentario para la respuesta privada.' };
  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${input.commentId}/private_replies?access_token=${encodeURIComponent(input.accessToken)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: input.text }) },
    );
    const body = (await response.json().catch(() => ({}))) as { message_id?: string; id?: string; error?: { message?: string } };
    const messageId = body.message_id ?? body.id;
    if (!response.ok || !messageId) return { ok: false, error: body.error?.message ?? `HTTP ${response.status}` };
    return { ok: true, externalMessageId: messageId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'error de red' };
  }
}

/** Respuesta publica a un comentario de Page (`POST /{comment-id}/comments`). */
async function sendMessengerPublicReply(
  input: { accessToken: string } & Pick<ChannelSendInput, 'text' | 'commentId'>,
): Promise<ChannelSendResult> {
  if (!input.commentId) return { ok: false, error: 'Falta el ID del comentario para la respuesta pública.' };
  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${input.commentId}/comments?access_token=${encodeURIComponent(input.accessToken)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: input.text }) },
    );
    const body = (await response.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!response.ok || !body.id) return { ok: false, error: body.error?.message ?? `HTTP ${response.status}` };
    return { ok: true, externalMessageId: body.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'error de red' };
  }
}
