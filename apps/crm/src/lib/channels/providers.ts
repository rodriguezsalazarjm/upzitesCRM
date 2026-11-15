import { randomUUID } from 'node:crypto';
import { isLocalDemo } from '../testing/local-mode';
import { prisma } from '../prisma';
import { sendInstagramDirectMessage } from '../instagram/client';
import { sendMessengerDirectMessage } from '../messenger/client';
import { sendTikTokDirectMessage } from '../tiktok/client';
import type { ChannelSendInput, ChannelSendResult } from './provider-types';

/**
 * Registro por canal. WhatsApp NO esta aqui: sigue su propio pipeline
 * (src/lib/whatsapp/outbound.ts) con outbox/reintentos, invocado directo
 * desde src/lib/channels/outbound.ts sin pasar por este registro.
 */
export async function sendChannelDirectMessage(input: ChannelSendInput): Promise<ChannelSendResult> {
  const metadata = input.channelAccount.metadata as { fake?: boolean } | null;
  if (metadata?.fake) {
    if (!isLocalDemo()) return { ok: false, error: 'Cuenta demo fuera del runtime local protegido.' };
    if (input.delivery && input.delivery !== 'DM' && !input.commentId) return { ok: false, error: 'Falta el ID del comentario.' };
    const externalMessageId = `fake-${randomUUID()}`;
    await prisma.auditLog.create({ data: { workspaceId: input.channelAccount.workspaceId, action: 'channel.fake_send', entity: 'ChannelAccount', entityId: input.channelAccount.id, metadata: { delivery: input.delivery ?? 'DM', commentId: input.commentId ?? null, text: input.text, externalMessageId } } });
    return { ok: true, externalMessageId };
  }
  // Respuestas a comentario (publica/privada) tienen su propio endpoint oficial
  // en el provider real (ver instagram/client.ts, messenger/client.ts) y no
  // estan sujetas a la ventana de 24h de mensajeria ordinaria — TikTok no
  // soporta comentarios (capabilities.ts), asi que sigue restringido a demo.
  if (input.delivery && input.delivery !== 'DM') {
    if (!input.commentId) return { ok: false, error: 'Falta el ID del comentario.' };
    if (input.channelAccount.channel === 'INSTAGRAM') return sendInstagramDirectMessage(input);
    if (input.channelAccount.channel === 'MESSENGER') return sendMessengerDirectMessage(input);
    return { ok: false, error: 'Las respuestas a comentarios solo están habilitadas en demo para este canal.' };
  }

  // Un DM ordinario nunca sale a un usuario sin una conversacion vigente:
  // Meta exige que la ventana de mensajeria (24h desde el ultimo mensaje del
  // usuario) siga abierta, o que se use un endpoint especifico permitido
  // (respuesta a comentario, arriba). No hay forma de saltarse esta regla
  // conociendo solo el ID del usuario.
  if (['INSTAGRAM', 'MESSENGER'].includes(input.channelAccount.channel)) {
    const open = input.windowOpenUntil && input.windowOpenUntil.getTime() > Date.now();
    if (!open) return { ok: false, error: 'Ventana de mensajería cerrada: no se puede enviar un mensaje directo fuera de una conversación iniciada por el usuario.' };
  }

  switch (input.channelAccount.channel) {
    case 'INSTAGRAM':
      return sendInstagramDirectMessage(input);
    case 'MESSENGER':
      return sendMessengerDirectMessage(input);
    case 'TIKTOK':
      return sendTikTokDirectMessage(input);
    default:
      return { ok: false, error: `Canal ${input.channelAccount.channel} no tiene proveedor de envío.` };
  }
}
