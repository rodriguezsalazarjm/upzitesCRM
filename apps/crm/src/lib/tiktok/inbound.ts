import { ChannelEventType, JobType } from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { enqueue } from '../jobs/queue';
import { persistChannelEvent } from '../channels/ingest';

/**
 * Normaliza el webhook de TikTok Business Messaging a ChannelEvent.
 *
 * CONTRATO, no implementacion confirmada: la firma (TikTok-Signature) SI esta
 * verificada contra documentacion vigente (ver tiktok/signature.ts), pero el
 * cuerpo exacto de un evento de mensaje entrante no se pudo confirmar sin una
 * app aprobada por TikTok (Business Messaging API exige Advanced Access o
 * cuenta verificada — ver informe: "ACCION MANUAL TIKTOK REQUERIDA"). Esta
 * forma es la mejor lectura disponible de la documentacion publica y DEBE
 * reverificarse en cuanto exista acceso real antes de confiar en produccion.
 */
type RawTikTokEvent = {
  event?: string;
  business_id?: string;
  content?: { conversation_id?: string; sender_id?: string; text?: string; ref?: string };
  create_time?: number;
};

async function resolveChannelAccount(externalAccountId: string) {
  return prisma.channelAccount.findUnique({
    where: { channel_externalAccountId: { channel: 'TIKTOK', externalAccountId } },
    select: { id: true, workspaceId: true, status: true },
  });
}

function hashOf(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return hash.toString(36);
}

export async function ingestTikTokWebhook(parsed: unknown): Promise<{ events: number }> {
  const body = parsed as { data?: RawTikTokEvent[] } | RawTikTokEvent;
  const items = Array.isArray((body as { data?: RawTikTokEvent[] }).data)
    ? (body as { data: RawTikTokEvent[] }).data
    : [body as RawTikTokEvent];

  let count = 0;
  for (const item of items) {
    const businessId = item.business_id;
    const senderId = item.content?.sender_id;
    if (!businessId || !senderId) continue;

    const account = await resolveChannelAccount(businessId);
    if (!account || account.status !== 'CONNECTED') continue;

    const type: ChannelEventType = item.content?.ref ? 'REF_LINK' : 'DM_RECEIVED';
    const idempotencyKey = `tiktok:${account.id}:${type}:${senderId}:${hashOf(JSON.stringify(item))}`;
    const result = await persistChannelEvent({
      workspaceId: account.workspaceId,
      channel: 'TIKTOK',
      channelAccountId: account.id,
      type,
      externalUserId: senderId,
      content: { text: item.content?.text ?? null, ref: item.content?.ref ?? null },
      rawMetadata: item as never,
      idempotencyKey,
    });
    if (!result.duplicate) {
      await enqueue({
        type: JobType.PROCESS_CHANNEL_EVENT,
        workspaceId: account.workspaceId,
        payload: { eventId: result.eventId },
        dedupeKey: `channel-event:${result.eventId}`,
        priority: 10,
      });
    }
    count += 1;
  }
  return { events: count };
}
