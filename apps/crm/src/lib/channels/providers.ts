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
