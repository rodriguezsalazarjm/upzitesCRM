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

  if (input.delivery === 'PRIVATE_REPLY') return sendInstagramPrivateReply({ accessToken, ...input });
  if (input.delivery === 'PUBLIC_REPLY') return sendInstagramPublicReply({ accessToken, ...input });

  try {
    const response = await fetch(`https://graph.instagram.com/v21.0/me/messages?access_token=${encodeURIComponent(accessToken)}`, {
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

/**
 * Private Reply a un comentario: Meta exige un endpoint distinto al DM
 * ordinario (`POST /{ig-comment-id}/private_replies`), no `/me/messages`.
 * Este es el mecanismo oficial del caso comercial prioritario
 * (comentario -> DM privado) — nunca se simula como un SEND_DM normal.
 */
async function sendInstagramPrivateReply(
  input: { accessToken: string } & Pick<ChannelSendInput, 'text' | 'commentId'>,
): Promise<ChannelSendResult> {
  if (!input.commentId) return { ok: false, error: 'Falta el ID del comentario para la respuesta privada.' };
  try {
    const response = await fetch(
      `https://graph.instagram.com/v21.0/${input.commentId}/private_replies?access_token=${encodeURIComponent(input.accessToken)}`,
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

/** Respuesta publica a un comentario (`POST /{ig-comment-id}/replies`). */
async function sendInstagramPublicReply(
  input: { accessToken: string } & Pick<ChannelSendInput, 'text' | 'commentId'>,
): Promise<ChannelSendResult> {
  if (!input.commentId) return { ok: false, error: 'Falta el ID del comentario para la respuesta pública.' };
  try {
    const response = await fetch(
      `https://graph.instagram.com/v21.0/${input.commentId}/replies?access_token=${encodeURIComponent(input.accessToken)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: input.text }) },
    );
    const body = (await response.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!response.ok || !body.id) return { ok: false, error: body.error?.message ?? `HTTP ${response.status}` };
    return { ok: true, externalMessageId: body.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'error de red' };
  }
}
