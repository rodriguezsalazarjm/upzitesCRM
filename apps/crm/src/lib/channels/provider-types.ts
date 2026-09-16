import type { ChannelAccount } from '../../../generated/prisma/client';

export type ChannelSendResult = { ok: true; externalMessageId: string } | { ok: false; error: string };

export type ChannelSendInput = {
  channelAccount: ChannelAccount;
  externalUserId: string;
  text: string;
};

/** Contrato comun que cada proveedor de canal implementa. */
export type ChannelProvider = {
  sendDirectMessage(input: ChannelSendInput): Promise<ChannelSendResult>;
};
