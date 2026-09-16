import type { Channel, ChannelEventType } from '../../../generated/prisma/client';
import { prisma } from '../prisma';

export type PersistChannelEventInput = {
  workspaceId: string;
  channel: Channel;
  channelAccountId: string;
  type: ChannelEventType;
  externalUserId: string;
  content?: unknown;
  rawMetadata?: unknown;
  idempotencyKey: string;
};

export type PersistChannelEventResult = { eventId: string; duplicate: boolean };

/**
 * Paso 1 del webhook, comun a Instagram/Messenger/TikTok: persistir el evento
 * YA NORMALIZADO de forma idempotente. El motor de automatizaciones nunca ve
 * el payload crudo del proveedor — solo esta forma.
 */
export async function persistChannelEvent(input: PersistChannelEventInput): Promise<PersistChannelEventResult> {
  const existing = await prisma.channelEvent.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true },
  });
  if (existing) return { eventId: existing.id, duplicate: true };

  try {
    const created = await prisma.channelEvent.create({
      data: {
        workspaceId: input.workspaceId,
        channel: input.channel,
        channelAccountId: input.channelAccountId,
        type: input.type,
        externalUserId: input.externalUserId,
        content: input.content as never,
        rawMetadata: input.rawMetadata as never,
        idempotencyKey: input.idempotencyKey,
      },
      select: { id: true },
    });
    return { eventId: created.id, duplicate: false };
  } catch (error) {
    // Carrera con otra entrega del mismo webhook: el unique ya gano en la otra.
    if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002') {
      const raced = await prisma.channelEvent.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey } });
      return { eventId: raced.id, duplicate: true };
    }
    throw error;
  }
}
