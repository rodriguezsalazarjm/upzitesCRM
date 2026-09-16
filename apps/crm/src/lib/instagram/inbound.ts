import { ChannelEventType, JobType } from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { enqueue } from '../jobs/queue';
import { persistChannelEvent } from '../channels/ingest';

/**
 * Normaliza el webhook de Instagram (Graph API) a ChannelEvent.
 *
 * Confirmado contra documentacion vigente de Meta: `messaging` (DM) y
 * `changes[].field === 'comments'` son el formato real y estable. Story
 * reply/mention, follow y share NO tienen hoy un campo de webhook
 * documentado de forma estable para nuestra app — el parser los reconoce
 * SI llegan (misma forma que genera el proveedor fake, para poder probar el
 * motor de extremo a extremo), pero no hay garantia de que Meta los entregue
 * asi en produccion hasta confirmarlo con una app real. Ver capabilities.ts.
 */
type RawIgEntry = {
  id: string;
  messaging?: Array<{
    sender?: { id?: string; username?: string };
    message?: { text?: string; reply_to?: { story?: { id?: string } } };
    story_mention?: { id?: string };
    follow?: unknown;
    share?: { link?: string };
  }>;
  changes?: Array<{
    field?: string;
    value?: {
      id?: string;
      text?: string;
      from?: { id?: string; username?: string };
      media?: { id?: string };
      is_live?: boolean;
    };
  }>;
};

/**
 * Busca la cuenta conectada por el ID que la propia notificacion trae en
 * `entry.id` (la cuenta de Instagram que RECIBIO el evento) — nunca por un
 * dato que venga del cliente. Si no hay una ChannelAccount conectada para ese
 * external id, el evento se ignora: no hay a que workspace atribuirselo.
 */
async function resolveChannelAccount(externalAccountId: string) {
  return prisma.channelAccount.findUnique({
    where: { channel_externalAccountId: { channel: 'INSTAGRAM', externalAccountId } },
    select: { id: true, workspaceId: true, status: true },
  });
}

export async function ingestInstagramWebhook(parsed: unknown): Promise<{ events: number }> {
  const body = parsed as { object?: string; entry?: RawIgEntry[] };
  if (body.object !== 'instagram' || !Array.isArray(body.entry)) return { events: 0 };

  let count = 0;
  for (const entry of body.entry) {
    const account = await resolveChannelAccount(entry.id);
    if (!account || account.status !== 'CONNECTED') continue;

    for (const item of entry.messaging ?? []) {
      const senderId = item.sender?.id;
      if (!senderId) continue;

      let type: ChannelEventType = 'DM_RECEIVED';
      let content: Record<string, unknown> = { text: item.message?.text ?? null, displayName: item.sender?.username ?? null };
      if (item.message?.reply_to?.story) {
        type = 'STORY_REPLY';
        content = { text: item.message.text ?? null, storyId: item.message.reply_to.story.id, displayName: item.sender?.username };
      } else if (item.story_mention) {
        type = 'STORY_MENTION';
        content = { storyId: item.story_mention.id, displayName: item.sender?.username };
      } else if (item.follow) {
        type = 'FOLLOW';
        content = { displayName: item.sender?.username };
      } else if (item.share) {
        type = 'SHARE';
        content = { link: item.share.link, displayName: item.sender?.username };
      }

      const idempotencyKey = `instagram:${account.id}:${type}:${senderId}:${hashOf(JSON.stringify(item))}`;
      const result = await persistChannelEvent({
        workspaceId: account.workspaceId,
        channel: 'INSTAGRAM',
        channelAccountId: account.id,
        type,
        externalUserId: senderId,
        content,
        rawMetadata: item as never,
        idempotencyKey,
      });
      if (!result.duplicate) {
        await enqueueProcessing(account.workspaceId, result.eventId);
      }
      count += 1;
    }

    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.from?.id) continue;
      const type: ChannelEventType = value.is_live ? 'LIVE_COMMENT' : 'COMMENT';
      const idempotencyKey = `instagram:${account.id}:comment:${value.id ?? hashOf(JSON.stringify(change))}`;
      const result = await persistChannelEvent({
        workspaceId: account.workspaceId,
        channel: 'INSTAGRAM',
        channelAccountId: account.id,
        type,
        externalUserId: value.from.id,
        content: { text: value.text ?? null, commentId: value.id, postId: value.media?.id, displayName: value.from.username },
        rawMetadata: change as never,
        idempotencyKey,
      });
      if (!result.duplicate) {
        await enqueueProcessing(account.workspaceId, result.eventId);
      }
      count += 1;
    }
  }
  return { events: count };
}

function hashOf(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
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
