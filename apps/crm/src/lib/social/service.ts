import { z } from 'zod';
import type { Prisma } from '../../../generated/prisma/client';
import { assertFeature } from '../entitlements';
import { prisma } from '../prisma';
import { planAssignments } from './feed';
import { assetPublicUrl } from './library-service';
import { appendHistory, composeCaption, publishSocialPost } from './publisher';

export class SocialPostError extends Error {}

/** Límites de Instagram: 2.200 caracteres de texto (con hashtags) y 30 hashtags. */
export const CAPTION_MAX = 2200;
export const HASHTAGS_MAX = 30;

export const socialPostInputSchema = z.object({
  channelAccountId: z.string().min(1),
  caption: z.string().max(CAPTION_MAX),
  hashtags: z.array(z.string().trim().regex(/^#?[\p{L}\p{N}_]{1,80}$/u, 'Hashtag inválido.')).max(HASHTAGS_MAX),
  mediaUrl: z.union([z.literal(''), z.string().url().max(2000).refine((url) => url.startsWith('https://'), 'La URL del archivo debe empezar con https://')]),
  mediaType: z.enum(['IMAGE', 'REEL']),
  /** P22: pieza de la biblioteca; si viene, manda sobre mediaUrl/mediaType. */
  contentAssetId: z.string().min(1).optional(),
  action: z.enum(['draft', 'schedule', 'publish_now']),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
});
export type SocialPostInput = z.infer<typeof socialPostInputSchema>;

/** Pura: valida lo que depende de la acción elegida. Devuelve el mensaje o null. */
export function validateForAction(input: SocialPostInput, now: Date): string | null {
  if (composeCaption(input.caption, input.hashtags).length > CAPTION_MAX) return `El texto con hashtags supera ${CAPTION_MAX} caracteres.`;
  if (input.action === 'draft') return null;
  if (!input.mediaUrl && !input.contentAssetId) return 'Instagram exige una imagen o un video para publicar.';
  if (input.action === 'schedule') {
    if (!input.scheduledAt) return 'Elige fecha y hora.';
    if (new Date(input.scheduledAt).getTime() < now.getTime() - 60_000) return 'La fecha ya pasó: usa "Publicar ahora" o elige otra.';
  }
  return null;
}

const EDITABLE = ['DRAFT', 'SCHEDULED', 'FAILED'] as const;

export async function saveSocialPost(workspaceId: string, userId: string, input: SocialPostInput, postId?: string) {
  const now = new Date();
  const problem = validateForAction(input, now);
  if (problem) throw new SocialPostError(problem);
  if (input.action !== 'draft') await assertFeature(workspaceId, 'channels.messaging');

  const account = await prisma.channelAccount.findFirst({ where: { id: input.channelAccountId, workspaceId, channel: 'INSTAGRAM' }, select: { id: true } });
  if (!account) throw new SocialPostError('La cuenta elegida no es una cuenta de Instagram de este negocio.');

  const asset = input.contentAssetId ? await prisma.contentAsset.findFirst({ where: { id: input.contentAssetId, workspaceId }, select: { id: true, kind: true } }) : null;
  if (input.contentAssetId && !asset) throw new SocialPostError('La pieza de la biblioteca no existe en este negocio.');

  const existing = postId ? await prisma.socialPost.findFirst({ where: { id: postId, workspaceId } }) : null;
  if (postId && !existing) throw new SocialPostError('Publicación no encontrada.');
  if (existing && !(EDITABLE as readonly string[]).includes(existing.status)) throw new SocialPostError('Ya se publicó o se está publicando: no se puede editar.');

  const status = input.action === 'draft' ? ('DRAFT' as const) : ('SCHEDULED' as const);
  const event = input.action === 'draft' ? 'draft_saved' : input.action === 'schedule' ? 'scheduled' : 'publish_requested';
  const data = {
    network: 'INSTAGRAM' as const,
    channelAccountId: account.id,
    caption: input.caption,
    hashtags: input.hashtags.map((tag) => tag.replace(/^#+/, '')),
    // Reutilizar = apuntar al MISMO archivo: no se sube otra vez.
    contentAssetId: asset?.id ?? null,
    mediaUrl: asset ? assetPublicUrl(asset.id) : input.mediaUrl || null,
    mediaType: asset ? (asset.kind === 'VIDEO' ? ('REEL' as const) : ('IMAGE' as const)) : input.mediaType,
    status,
    // P20: un borrador puede tener fecha planificada (aparece en el calendario, no se publica).
    scheduledAt: input.action === 'publish_now' ? now : input.scheduledAt ? new Date(input.scheduledAt) : null,
    // Un post editado empieza de cero: contenedor y reintentos eran del contenido anterior.
    attempts: 0,
    nextAttemptAt: null,
    containerId: null,
    lastError: null,
    history: appendHistory(existing?.history, event, input.action === 'schedule' ? input.scheduledAt : undefined, now) as Prisma.InputJsonValue,
  };
  let post;
  if (existing) {
    // Condicional: si el cron lo tomó entre la lectura y este update, no se pisa.
    const updated = await prisma.socialPost.updateMany({ where: { id: existing.id, workspaceId, status: { in: [...EDITABLE] } }, data });
    if (updated.count === 0) throw new SocialPostError('Se está publicando en este momento: no se puede editar.');
    post = await prisma.socialPost.findFirstOrThrow({ where: { id: existing.id, workspaceId } });
  } else {
    post = await prisma.socialPost.create({ data: { ...data, workspaceId, createdById: userId } });
  }

  return input.action === 'publish_now' ? ((await publishSocialPost(workspaceId, post.id, { now })) ?? post) : post;
}

/** Reintentar un FAILED (publica ya) o cancelar una programación (vuelve a borrador). */
export type CalendarAction = { action: 'retry' | 'unschedule' | 'duplicate' | 'publish_now' } | { action: 'reschedule'; scheduledAt: string };

export async function socialPostAction(workspaceId: string, postId: string, input: CalendarAction, userId?: string) {
  const { action } = input;
  const now = new Date();
  const post = await prisma.socialPost.findFirst({ where: { id: postId, workspaceId } });
  if (!post) throw new SocialPostError('Publicación no encontrada.');
  if (action === 'retry') {
    if (post.status !== 'FAILED') throw new SocialPostError('Solo se reintenta una publicación que falló.');
    await assertFeature(workspaceId, 'channels.messaging');
    await prisma.socialPost.updateMany({
      where: { id: post.id, workspaceId, status: 'FAILED' },
      data: { status: 'SCHEDULED', scheduledAt: now, attempts: 0, nextAttemptAt: null, history: appendHistory(post.history, 'retry_requested', undefined, now) as Prisma.InputJsonValue },
    });
    return (await publishSocialPost(workspaceId, post.id, { now })) ?? post;
  }
  if (action === 'duplicate') {
    // La copia nace borrador con la misma fecha planificada: se mueve y se programa aparte.
    return prisma.socialPost.create({
      data: {
        workspaceId, network: post.network, channelAccountId: post.channelAccountId, caption: post.caption, hashtags: post.hashtags,
        mediaUrl: post.mediaUrl, mediaType: post.mediaType, contentAssetId: post.contentAssetId, status: 'DRAFT', scheduledAt: post.scheduledAt, createdById: userId ?? null,
        history: appendHistory([], 'duplicated', undefined, now) as Prisma.InputJsonValue,
      },
    });
  }
  if (action === 'reschedule') {
    if (!('scheduledAt' in input)) throw new SocialPostError('Falta la fecha.');
    const when = new Date(input.scheduledAt);
    if (post.status !== 'DRAFT' && post.status !== 'SCHEDULED') throw new SocialPostError('Solo se mueve un borrador o una publicación programada.');
    if (post.status === 'SCHEDULED' && when.getTime() < now.getTime() - 60_000) throw new SocialPostError('Esa fecha ya pasó: elige otra o usa "Publicar ahora".');
    // Condicional: si el cron ya la tomó, no se mueve (se estaría publicando).
    const moved = await prisma.socialPost.updateMany({
      where: { id: post.id, workspaceId, status: post.status },
      data: { scheduledAt: when, nextAttemptAt: null, history: appendHistory(post.history, 'rescheduled', input.scheduledAt, now) as Prisma.InputJsonValue },
    });
    if (moved.count === 0) throw new SocialPostError('Se está publicando en este momento.');
    return prisma.socialPost.findFirstOrThrow({ where: { id: post.id, workspaceId } });
  }
  if (action === 'publish_now') {
    if (post.status !== 'DRAFT' && post.status !== 'SCHEDULED') throw new SocialPostError('Solo se publica un borrador o una publicación programada.');
    if (!post.mediaUrl) throw new SocialPostError('Instagram exige una imagen o un video para publicar.');
    await assertFeature(workspaceId, 'channels.messaging');
    const claimed = await prisma.socialPost.updateMany({
      where: { id: post.id, workspaceId, status: post.status },
      data: { status: 'SCHEDULED', scheduledAt: now, attempts: 0, nextAttemptAt: null, history: appendHistory(post.history, 'publish_requested', undefined, now) as Prisma.InputJsonValue },
    });
    if (claimed.count === 0) throw new SocialPostError('Se está publicando en este momento.');
    return (await publishSocialPost(workspaceId, post.id, { now })) ?? post;
  }
  if (post.status !== 'SCHEDULED') throw new SocialPostError('Solo se cancela una publicación programada.');
  const updated = await prisma.socialPost.updateMany({
    where: { id: post.id, workspaceId, status: 'SCHEDULED' },
    // Cancelar = vuelve a borrador y conserva su fecha planificada en el calendario.
    data: { status: 'DRAFT', nextAttemptAt: null, history: appendHistory(post.history, 'unscheduled', undefined, now) as Prisma.InputJsonValue },
  });
  if (updated.count === 0) throw new SocialPostError('Se está publicando en este momento.');
  return prisma.socialPost.findFirstOrThrow({ where: { id: post.id, workspaceId } });
}

export async function deleteSocialPost(workspaceId: string, postId: string) {
  // Borrar no toca lo ya publicado en Instagram: solo saca el registro de Upzites.
  const deleted = await prisma.socialPost.deleteMany({ where: { id: postId, workspaceId, status: { not: 'PUBLISHING' } } });
  if (deleted.count === 0) throw new SocialPostError('No se puede borrar (no existe o se está publicando).');
}

/**
 * P21: guarda el plan del Feed Planner. `order` = piezas futuras de la grilla,
 * de arriba a la izquierda hacia abajo. Solo borradores y programados de UNA
 * cuenta; lo publicado no se toca. Todo o nada.
 */
export async function applyFeedPlan(workspaceId: string, order: string[]) {
  const now = new Date();
  const posts = await prisma.socialPost.findMany({ where: { workspaceId, id: { in: order } } });
  if (posts.length !== order.length) throw new SocialPostError('Alguna pieza ya no existe en este negocio.');
  if (posts.some((p) => p.status !== 'DRAFT' && p.status !== 'SCHEDULED')) throw new SocialPostError('Lo publicado o en publicación no se reordena: Instagram no permite cambiar el feed histórico.');
  if (new Set(posts.map((p) => p.channelAccountId)).size > 1) throw new SocialPostError('El plan es por cuenta: elige una sola cuenta.');
  let plan;
  try {
    plan = planAssignments(order, posts);
  } catch (error) {
    throw new SocialPostError((error as Error).message);
  }
  const byId = new Map(posts.map((p) => [p.id, p]));
  if (plan.some((p) => byId.get(p.id)!.status === 'SCHEDULED' && p.scheduledAt.getTime() < now.getTime() - 60_000)) {
    throw new SocialPostError('El plan dejaría una publicación programada en una fecha pasada. Mueve primero los borradores con fecha vieja.');
  }
  await prisma.$transaction(async (tx) => {
    for (const { id, scheduledAt } of plan) {
      const post = byId.get(id)!;
      if (post.scheduledAt?.getTime() === scheduledAt.getTime()) continue;
      // Condicional: si el cron tomó alguna, se cancela todo el plan.
      const moved = await tx.socialPost.updateMany({
        where: { id, workspaceId, status: post.status },
        data: { scheduledAt, nextAttemptAt: null, history: appendHistory(post.history, 'feed_plan', scheduledAt.toISOString(), now) as Prisma.InputJsonValue },
      });
      if (moved.count === 0) throw new SocialPostError('Una pieza se está publicando en este momento: vuelve a intentarlo.');
    }
  });
  return plan;
}
