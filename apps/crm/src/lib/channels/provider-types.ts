import type { ChannelAccount } from '../../../generated/prisma/client';

export type ChannelSendResult = { ok: true; externalMessageId: string } | { ok: false; error: string };

export type ChannelSendInput = {
  channelAccount: ChannelAccount;
  externalUserId: string;
  text: string;
  delivery?: 'DM' | 'PUBLIC_REPLY' | 'PRIVATE_REPLY';
  commentId?: string;
  /** Fin de la ventana de mensajeria de 24h (Conversation.customerServiceWindowEndsAt). */
  windowOpenUntil?: Date | null;
};

/** Contrato comun que cada proveedor de canal implementa. */
export type ChannelProvider = {
  sendDirectMessage(input: ChannelSendInput): Promise<ChannelSendResult>;
};
