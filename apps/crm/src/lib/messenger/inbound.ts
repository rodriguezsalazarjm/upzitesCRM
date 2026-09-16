import { ChannelEventType, JobType } from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { enqueue } from '../jobs/queue';
import { persistChannelEvent } from '../channels/ingest';

/**
 * Normaliza el webhook de Messenger (Graph API) a ChannelEvent.
 *
 * `messaging[].message` (DM), `messaging[].referral`/`postback.referral`
 * (m.me con `?ref=`) y `changes[].field === 'feed'` (comentario de pagina)
 * son formato estable y documentado — a diferencia de Instagram, aqui NO hay
 * capacidades "beta" que reconocer: Messenger no tiene stories ni follow.
 */
type RawPageEntry = {
  id: string;
  messaging?: Array<{
    sender?: { id?: string };
    message?: { text?: string };
    referral?: { ref?: string; source?: string };
    postback?: { referral?: { ref?: string } };
  }>;
  changes?: Array<{
    field?: string;
    value?: { item?: string; comment_id?: string; message?: string; post_id?: string; from?: { id?: string; name?: string } };
  }>;
};

async function resolveChannelAccount(externalAccountId: string) {
  return prisma.channelAccount.findUnique({
    where: { channel_externalAccountId: { channel: 'MESSENGER', externalAccountId } },
    select: { id: true, workspaceId: true, status: true },
  });
}

function hashOf(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return hash.toString(36);
}

export async function ingestMessengerWebhook(parsed: unknown): Promise<{ events: number }> {
  const body = parsed as { object?: string; entry?: RawPageEntry[] };
  if (body.object !== 'page' || !Array.isArray(body.entry)) return { events: 0 };

  let count = 0;
  for (const entry of body.entry) {
    const account = await resolveChannelAccount(entry.id);
    if (!account || account.status !== 'CONNECTED') continue;

    for (const item of entry.messaging ?? []) {
      const senderId = item.sender?.id;
      if (!senderId) continue;

      const ref = item.referral?.ref ?? item.postback?.referral?.ref;
      let type: ChannelEventType = 'DM_RECEIVED';
      let content: Record<string, unknown> = { text: item.message?.text ?? null };
      if (!item.message && ref) {
        type = 'REF_LINK';
        content = { ref };
      }

      const idempotencyKey = `messenger:${account.id}:${type}:${senderId}:${hashOf(JSON.stringify(item))}`;
      const result = await persistChannelEvent({
        workspaceId: account.workspaceId,
        channel: 'MESSENGER',
        channelAccountId: account.id,
        type,
        externalUserId: senderId,
        content,
        rawMetadata: item as never,
        idempotencyKey,
      });
      if (!result.duplicate) await enqueueProcessing(account.workspaceId, result.eventId);
      count += 1;
    }

    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (change.field !== 'feed' || value?.item !== 'comment' || !value.from?.id) continue;
      const idempotencyKey = `messenger:${account.id}:comment:${value.comment_id ?? hashOf(JSON.stringify(change))}`;
      const result = await persistChannelEvent({
        workspaceId: account.workspaceId,
        channel: 'MESSENGER',
        channelAccountId: account.id,
        type: 'COMMENT',
        externalUserId: value.from.id,
        content: { text: value.message ?? null, commentId: value.comment_id, postId: value.post_id, displayName: value.from.name },
        rawMetadata: change as never,
        idempotencyKey,
      });
      if (!result.duplicate) await enqueueProcessing(account.workspaceId, result.eventId);
      count += 1;
    }
  }
  return { events: count };
}

async function enqueueProcessing(workspaceId: string, eventId: string) {
  await enqueue({
    type: JobType.PROCESS_CHANNEL_EVENT,
    workspaceId,
    payload: { eventId },
    dedupeKey: `channel-event:${eventId}`,
    priority: 10,
  });
}
