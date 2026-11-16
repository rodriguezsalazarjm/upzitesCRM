import type { Prisma } from '../../../generated/prisma/client';
import { canWorkspaceConsume } from '../billing/subscription-access';
import { crossTenantPrisma, prisma } from '../prisma';
import { publishToInstagram, type PublishInput, type PublishResult } from './instagram-publish';

/**
 * P19 Social Publisher. Estados: DRAFT → SCHEDULED → PUBLISHING → PUBLISHED | FAILED.
 * El paso a PUBLISHING es un update condicional: dos ticks del cron (o el
 * cron y "Publicar ahora") nunca publican el mismo post dos veces.
 */
export const MAX_ATTEMPTS = 3;
const BACKOFF_MINUTES = [1, 5];
/** Un PUBLISHING más viejo que esto = worker caído a mitad de camino. */
const STALE_MS = 15 * 60_000;

export type HistoryEntry = { at: string; event: string; detail?: string };

export function appendHistory(history: unknown, event: string, detail: string | undefined, now: Date): HistoryEntry[] {
  const list = Array.isArray(history) ? (history as HistoryEntry[]) : [];
  return [...list, { at: now.toISOString(), event, ...(detail ? { detail } : {}) }].slice(-30);
}

/** Pura: qué pasa con el post tras un intento fallido. */
export function failureTransition(attemptsBefore: number, retryable: boolean, now: Date) {
  const attempts = attemptsBefore + 1;
  if (retryable && attempts < MAX_ATTEMPTS) {
    const minutes = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
    return { status: 'SCHEDULED' as const, attempts, nextAttemptAt: new Date(now.getTime() + minutes * 60_000) };
  }
  return { status: 'FAILED' as const, attempts, nextAttemptAt: null };
}

export function composeCaption(caption: string, hashtags: string[]) {
  const tags = hashtags.map((tag) => `#${tag.replace(/^#+/, '')}`).join(' ');
  return [caption.trim(), tags].filter(Boolean).join('\n\n');
}

type Publisher = (input: PublishInput) => Promise<PublishResult>;

export async function publishSocialPost(workspaceId: string, postId: string, options: { now?: Date; publish?: Publisher } = {}) {
  const now = options.now ?? new Date();
  const claimed = await prisma.socialPost.updateMany({
    where: { id: postId, workspaceId, status: 'SCHEDULED' },
    data: { status: 'PUBLISHING' },
  });
  if (claimed.count === 0) return null;

  const post = await prisma.socialPost.findFirstOrThrow({ where: { id: postId, workspaceId }, include: { channelAccount: true } });
  const account = post.channelAccount;

  let result: PublishResult;
  if (!(await canWorkspaceConsume(workspaceId))) result = { ok: false, error: 'La suscripción del workspace no está vigente: no se publica.', retryable: false };
  else if (post.network !== 'INSTAGRAM') result = { ok: false, error: 'Esta red todavía no se puede conectar en Upzites Flow.', retryable: false };
  else if (!account || account.status !== 'CONNECTED') result = { ok: false, error: 'La cuenta de Instagram no está conectada.', retryable: false };
  else if (account.planLimitedAt) result = { ok: false, error: 'Esta cuenta está limitada por tu plan: no se publica.', retryable: false };
  else if (!post.mediaUrl) result = { ok: false, error: 'Instagram exige una imagen o un video.', retryable: false };
  else {
    result = await (options.publish ?? publishToInstagram)({
      account,
      caption: composeCaption(post.caption, post.hashtags),
      mediaUrl: post.mediaUrl,
      mediaType: post.mediaType,
      containerId: post.containerId,
    });
  }

  const data: Prisma.SocialPostUpdateInput = result.ok
    ? {
        status: 'PUBLISHED', publishedAt: now, externalPostId: result.externalPostId, permalink: result.permalink,
        lastError: null, nextAttemptAt: null, containerId: null, attempts: post.attempts + 1,
        history: appendHistory(post.history, 'published', result.permalink ?? undefined, now),
      }
    : {
        ...failureTransition(post.attempts, result.retryable, now),
        lastError: result.error,
        containerId: result.containerId === undefined ? post.containerId : result.containerId,
        history: appendHistory(post.history, 'failed', result.error, now),
      };
  return prisma.socialPost.update({ where: { id: post.id, workspaceId }, data });
}

/** Tick del cron: cierra los atascados y publica lo que ya venció. */
export async function publishDueSocialPosts(options: { now?: Date; publish?: Publisher; workspaceId?: string } = {}) {
  const now = options.now ?? new Date();
  const scope = options.workspaceId ? { workspaceId: options.workspaceId } : {};

  // Atascado en PUBLISHING: no se sabe si Meta lo publicó. Reintentar solo podría duplicarlo.
  const stale = await crossTenantPrisma.socialPost.findMany({
    where: { ...scope, status: 'PUBLISHING', updatedAt: { lt: new Date(now.getTime() - STALE_MS) } },
    select: { id: true, history: true },
    take: 50,
  });
  for (const post of stale) {
    const detail = 'Se cortó a mitad de la publicación. Revisa Instagram antes de reintentar para no duplicarla.';
    await crossTenantPrisma.socialPost.updateMany({
      where: { id: post.id, status: 'PUBLISHING' },
      data: { status: 'FAILED', lastError: detail, history: appendHistory(post.history, 'failed', detail, now) as Prisma.InputJsonValue },
    });
  }

  const due = await crossTenantPrisma.socialPost.findMany({
    where: { ...scope, status: 'SCHEDULED', scheduledAt: { lte: now }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
    orderBy: { scheduledAt: 'asc' },
    select: { id: true, workspaceId: true },
    take: 20,
  });
  let published = 0;
  let notPublished = 0;
  for (const post of due) {
    const updated = await publishSocialPost(post.workspaceId, post.id, { now, publish: options.publish });
    if (updated?.status === 'PUBLISHED') published += 1;
    else if (updated) notPublished += 1;
  }
  return { stale: stale.length, due: due.length, published, notPublished };
}
