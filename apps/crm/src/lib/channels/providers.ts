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
  if (input.delivery && input.delivery !== 'DM') return { ok: false, error: 'Las respuestas a comentarios solo están habilitadas en demo hasta validar el provider real.' };
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
