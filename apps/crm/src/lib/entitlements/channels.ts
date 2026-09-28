import { ChannelAccountStatus, WhatsAppChannelStatus, type Channel } from '../../../generated/prisma/enums';
import { prisma } from '../prisma';
import { assertCanGrow } from './index';

/**
 * Gate de `channels.max` (P0-C): cuenta canales CONECTADOS de cualquier
 * proveedor. Solo frena lo que aumenta el uso: reconectar o actualizar el
 * token de un canal que ya esta conectado en este workspace no suma.
 *
 * Se llama ANTES de hablar con el proveedor (verificar token, OAuth): mandar a
 * alguien a autorizar un canal que su plan no admite es peor que decirlo aqui.
 */
export async function assertChannelConnectAllowed(
  workspaceId: string,
  target: { channel: 'WHATSAPP'; phoneNumberId: string } | { channel: Exclude<Channel, 'WHATSAPP'>; externalAccountId: string },
) {
  const existing =
    target.channel === 'WHATSAPP'
      ? await prisma.whatsAppChannel.findUnique({
          where: { phoneNumberId: target.phoneNumberId },
          select: { workspaceId: true, status: true },
        })
      : await prisma.channelAccount.findUnique({
          where: { channel_externalAccountId: { channel: target.channel, externalAccountId: target.externalAccountId } },
          select: { workspaceId: true, status: true },
        });

  // Ambos enums llaman DISCONNECTED a "no cuenta como canal".
  const disconnected: string[] = [WhatsAppChannelStatus.DISCONNECTED, ChannelAccountStatus.DISCONNECTED];
  const alreadyCounted = existing?.workspaceId === workspaceId && !disconnected.includes(existing.status);

  if (!alreadyCounted) await assertCanGrow(workspaceId, 'channels.max');
}
