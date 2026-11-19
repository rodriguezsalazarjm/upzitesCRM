import { getValidTikTokAccessToken, tiktokApi } from '../tiktok/oauth';
import type { PublishInput, PublishResult } from './instagram-publish';

/**
 * P29: Content Posting API de TikTok (Direct Post, PULL_FROM_URL). Asincrono:
 * `video/init` devuelve un publish_id y TikTok descarga y procesa el video;
 * `status/fetch` dice cuando termino. El publish_id se guarda en
 * `containerId` para que el reintento consulte el mismo envio en vez de
 * subir el video otra vez (mismo criterio que el reel de Instagram).
 *
 * Restricciones reales de TikTok:
 *  - sin auditoria de la app, TODO post sale privado (SELF_ONLY): por eso la
 *    visibilidad publica solo se pide con TIKTOK_APP_AUDITED=true;
 *  - PULL_FROM_URL exige que el dominio del video este verificado en el
 *    portal de desarrolladores de TikTok (aqui: el del CRM, que sirve la biblioteca).
 */
export const TIKTOK_PUBLISH_SCOPE = 'video.publish';

const ERRORS: Record<string, { text: string; retryable?: boolean; reauth?: boolean }> = {
  access_token_invalid: { text: 'La sesión de TikTok venció o se revocó. Reconecta TikTok.', reauth: true },
  scope_not_authorized: { text: 'La cuenta no dio permiso para publicar. Reconecta TikTok y acepta todos los permisos.', reauth: true },
  rate_limit_exceeded: { text: 'TikTok limitó las publicaciones por ahora; se reintenta solo.', retryable: true },
  spam_risk_too_many_posts: { text: 'TikTok bloqueó la publicación: la cuenta alcanzó el máximo de posts del día.' },
  spam_risk_too_many_pending_share: { text: 'La cuenta tiene demasiadas publicaciones pendientes en TikTok. Espera a que terminen.' },
  spam_risk_user_banned_from_posting: { text: 'TikTok no permite publicar desde esta cuenta por ahora.' },
  reached_active_user_cap: { text: 'La app alcanzó el límite diario de cuentas que publican en TikTok; se reintenta solo.', retryable: true },
  unaudited_client_can_only_post_to_private_accounts: { text: 'La app de TikTok aún no está auditada: solo puede publicar en privado (TIKTOK_APP_AUDITED no debe estar en true).' },
  url_ownership_unverified: { text: 'TikTok no reconoce el dominio del video: verifica el dominio del CRM en el portal de desarrolladores de TikTok.' },
  privacy_level_option_mismatch: { text: 'La visibilidad elegida no está disponible para esta cuenta de TikTok.' },
};

/** Pura: texto claro y si conviene reintentar, para un código de error de TikTok. */
export function tiktokError(code: string, message: string, status = 400) {
  const known = ERRORS[code];
  if (known) return { error: known.text, retryable: Boolean(known.retryable), reauth: Boolean(known.reauth) };
  return { error: `TikTok: ${message || code}`, retryable: status >= 500 || status === 429, reauth: false };
}

/** Pura: visibilidad a pedir. Sin auditoria solo SELF_ONLY funciona. */
export function choosePrivacy(options: string[], audited: boolean) {
  if (audited && options.includes('PUBLIC_TO_EVERYONE')) return 'PUBLIC_TO_EVERYONE';
  if (options.includes('SELF_ONLY')) return 'SELF_ONLY';
  return options[0] ?? 'SELF_ONLY';
}

type StatusData = { status?: string; fail_reason?: string; publicaly_available_post_id?: Array<string | number> };

/** Pura: traduce el estado de `status/fetch` a resultado (o null = sigue procesando). */
export function interpretPublishStatus(data: StatusData | undefined, publishId: string): PublishResult | null {
  const status = data?.status;
  if (status === 'PUBLISH_COMPLETE') {
    const publicId = data?.publicaly_available_post_id?.[0];
    // Privado (SELF_ONLY) no tiene id publico: queda el publish_id como referencia.
    return { ok: true, externalPostId: publicId ? String(publicId) : `publish:${publishId}`, permalink: null };
  }
  if (status === 'FAILED') return { ok: false, error: `TikTok no pudo publicar el video (${data?.fail_reason ?? 'sin motivo'}). Revisa el archivo y vuelve a intentar.`, retryable: false, containerId: null };
  if (status === 'SEND_TO_USER_INBOX') return { ok: false, error: 'TikTok dejó el video en la bandeja del creador para terminarlo en la app.', retryable: false, containerId: null };
  return null;
}

type Deps = { sleep?: (ms: number) => Promise<void>; fetchImpl?: typeof fetch; audited?: boolean };

export async function publishToTikTok(input: PublishInput & { account: { id: string } }, deps: Deps = {}): Promise<PublishResult> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  if (input.mediaType !== 'REEL') return { ok: false, error: 'TikTok publica videos: elige un video (MP4).', retryable: false };
  if (!input.account.scopes?.split(',').includes(TIKTOK_PUBLISH_SCOPE)) {
    return { ok: false, error: 'La cuenta no dio permiso para publicar. Reconecta TikTok y acepta "publicar videos".', retryable: false };
  }
  const token = await getValidTikTokAccessToken(input.account.id, deps.fetchImpl);
  if (!token.ok) return { ok: false, error: `TikTok: ${token.reason}`, retryable: false };
  const call = <T,>(path: string, body: unknown) => tiktokApi<T>(path, token.accessToken, { body, fetchImpl: deps.fetchImpl });

  let publishId = input.containerId;
  try {
    if (!publishId) {
      const creator = await call<{ privacy_level_options?: string[] }>('/post/publish/creator_info/query/', {});
      if (!creator.ok) return { ok: false, ...tiktokError(creator.code, creator.message, creator.status) };
      const init = await call<{ publish_id?: string }>('/post/publish/video/init/', {
        post_info: {
          title: input.caption,
          privacy_level: choosePrivacy(creator.data?.privacy_level_options ?? [], deps.audited ?? process.env.TIKTOK_APP_AUDITED === 'true'),
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: { source: 'PULL_FROM_URL', video_url: input.mediaUrl },
      });
      if (!init.ok || !init.data?.publish_id) return { ok: false, ...tiktokError(init.code, init.message, init.status) };
      publishId = init.data.publish_id;
    }

    for (let check = 0; check < 5; check += 1) {
      const status = await call<StatusData>('/post/publish/status/fetch/', { publish_id: publishId });
      if (!status.ok) return { ok: false, ...tiktokError(status.code, status.message, status.status), containerId: publishId };
      const result = interpretPublishStatus(status.data, publishId);
      if (result) return result.ok ? { ...result, permalink: await shareUrl(result.externalPostId, token.accessToken, deps.fetchImpl) } : result;
      if (check === 4) return { ok: false, error: 'TikTok sigue procesando el video; se consulta de nuevo solo.', retryable: true, containerId: publishId };
      await sleep(4000);
    }
  } catch {
    return { ok: false, error: 'No se pudo contactar a TikTok.', retryable: true, containerId: publishId };
  }
  return { ok: false, error: 'TikTok no confirmó la publicación.', retryable: true, containerId: publishId };
}

async function shareUrl(videoId: string, accessToken: string, fetchImpl?: typeof fetch) {
  if (videoId.startsWith('publish:')) return null;
  const metrics = await tiktokApi<{ videos?: Array<{ share_url?: string }> }>('/video/query/?fields=id,share_url', accessToken, { body: { filters: { video_ids: [videoId] } }, fetchImpl }).catch(() => null);
  return metrics?.data?.videos?.[0]?.share_url ?? null;
}

export type TikTokMetrics = { views: number; likes: number; comments: number; shares: number; followers: number | null };

/**
 * Analytics disponibles hoy en la API publica: contadores por video
 * (video.list) y seguidores de la cuenta (user.info.stats). Se consultan en
 * vivo, no se guardan. Un post privado (sin id publico) no tiene metricas.
 */
export async function fetchTikTokMetrics(input: { channelAccountId: string; externalPostId: string; fetchImpl?: typeof fetch }): Promise<{ ok: true; metrics: TikTokMetrics } | { ok: false; error: string }> {
  if (input.externalPostId.startsWith('publish:')) return { ok: false, error: 'El video se publicó en privado: TikTok no entrega métricas de posts privados.' };
  const token = await getValidTikTokAccessToken(input.channelAccountId, input.fetchImpl);
  if (!token.ok) return { ok: false, error: `TikTok: ${token.reason}` };
  const [video, user] = await Promise.all([
    tiktokApi<{ videos?: Array<{ view_count?: number; like_count?: number; comment_count?: number; share_count?: number }> }>(
      '/video/query/?fields=id,view_count,like_count,comment_count,share_count', token.accessToken, { body: { filters: { video_ids: [input.externalPostId] } }, fetchImpl: input.fetchImpl },
    ),
    // Los seguidores son un extra: si fallan, igual se muestran las métricas del video.
    tiktokApi<{ user?: { follower_count?: number } }>('/user/info/?fields=follower_count', token.accessToken, { fetchImpl: input.fetchImpl }).catch(() => null),
  ]).catch(() => [null, null] as const);
  if (!video) return { ok: false, error: 'No se pudo contactar a TikTok.' };
  const v = video.data?.videos?.[0];
  if (!video.ok || !v) return { ok: false, error: video.ok ? 'TikTok no encontró el video.' : tiktokError(video.code, video.message, video.status).error };
  return { ok: true, metrics: { views: v.view_count ?? 0, likes: v.like_count ?? 0, comments: v.comment_count ?? 0, shares: v.share_count ?? 0, followers: user?.data?.user?.follower_count ?? null } };
}
