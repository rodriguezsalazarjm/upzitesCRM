import { decryptSecret } from '../crypto';

/**
 * P19: Content Publishing de Instagram (API with Instagram Login). Dos pasos
 * documentados por Meta: crear un contenedor (/media) y publicarlo
 * (/media_publish). Un reel se procesa en segundos o minutos: si no termina,
 * se devuelve el contenedor para que el reintento lo reutilice en vez de
 * subir el video otra vez.
 *
 * Igual que la mensajeria (lib/instagram/client.ts), nunca se ejercito contra
 * la API real: requiere `instagram_business_content_publish` aprobado en App Review.
 */
export const INSTAGRAM_PUBLISH_SCOPE = 'instagram_business_content_publish';
const GRAPH = 'https://graph.instagram.com/v21.0';

export type PublishInput = {
  account: { externalAccountId: string; accessTokenEncrypted: string | null; scopes: string | null };
  caption: string;
  mediaUrl: string;
  mediaType: 'IMAGE' | 'REEL';
  containerId: string | null;
};

export type PublishResult =
  | { ok: true; externalPostId: string; permalink: string | null }
  /** `retryable` = vale la pena reintentar (red, proceso del reel, limite de Meta). */
  | { ok: false; error: string; retryable: boolean; containerId?: string | null };

async function graph(path: string, token: string, init?: { method?: 'POST'; params?: Record<string, string> }) {
  const params = new URLSearchParams({ ...(init?.params ?? {}), access_token: token });
  const response = await fetch(`${GRAPH}/${path}${init?.method === 'POST' ? '' : `?${params}`}`, {
    method: init?.method ?? 'GET',
    ...(init?.method === 'POST' ? { body: params, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } } : {}),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string; code?: number } };
  return { ok: response.ok && !body.error, status: response.status, body };
}

function metaError(body: { error?: { message?: string } }, fallback: string) {
  return body.error?.message ? `Instagram: ${body.error.message}` : fallback;
}

export async function publishToInstagram(input: PublishInput, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<PublishResult> {
  if (!input.account.accessTokenEncrypted) return { ok: false, error: 'La cuenta de Instagram no tiene un token guardado. Reconéctala.', retryable: false };
  if (!input.account.scopes?.split(',').includes(INSTAGRAM_PUBLISH_SCOPE)) {
    return { ok: false, error: 'La cuenta no dio permiso para publicar. Reconecta Instagram y acepta "publicar contenido".', retryable: false };
  }
  const token = decryptSecret(input.account.accessTokenEncrypted);
  const igUser = input.account.externalAccountId;

  let containerId = input.containerId;
  try {
    if (!containerId) {
      const created = await graph(`${igUser}/media`, token, {
        method: 'POST',
        params: input.mediaType === 'REEL'
          ? { media_type: 'REELS', video_url: input.mediaUrl, caption: input.caption }
          : { image_url: input.mediaUrl, caption: input.caption },
      });
      if (!created.ok || typeof created.body.id !== 'string') {
        return { ok: false, error: metaError(created.body, 'Instagram no aceptó el contenido.'), retryable: created.status >= 500 || created.status === 429 };
      }
      containerId = created.body.id;
    }

    // El contenedor debe estar FINISHED antes de publicar (las imagenes suelen estarlo ya).
    for (let check = 0; check < 5; check += 1) {
      const status = await graph(containerId, token, { params: { fields: 'status_code' } });
      const code = status.body.status_code;
      if (code === 'FINISHED' || code === 'PUBLISHED') break;
      if (code === 'ERROR' || code === 'EXPIRED') return { ok: false, error: `Instagram no pudo procesar el archivo (${code}). Revisa el formato y vuelve a intentar.`, retryable: false, containerId: null };
      if (check === 4) return { ok: false, error: 'Instagram sigue procesando el archivo; se reintenta solo.', retryable: true, containerId };
      await sleep(4000);
    }

    const published = await graph(`${igUser}/media_publish`, token, { method: 'POST', params: { creation_id: containerId } });
    if (!published.ok || typeof published.body.id !== 'string') {
      return { ok: false, error: metaError(published.body, 'Instagram no publicó el contenido.'), retryable: published.status >= 500 || published.status === 429, containerId };
    }
    const media = await graph(published.body.id, token, { params: { fields: 'permalink' } }).catch(() => null);
    return { ok: true, externalPostId: published.body.id, permalink: typeof media?.body.permalink === 'string' ? media.body.permalink : null };
  } catch {
    return { ok: false, error: 'No se pudo contactar a Instagram.', retryable: true, containerId };
  }
}
