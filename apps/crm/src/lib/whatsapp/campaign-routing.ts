import { z } from 'zod';

/**
 * Punto 9 — Campaign Routing. Modulo puro (sin base de datos): lo usan el
 * webhook, la API y la pantalla.
 *
 * Meta entrega en `messages[].referral` el id del anuncio (`source_id` con
 * `source_type: "ad"`) cuando el contacto llega por Click-to-WhatsApp. No trae
 * conjunto ni campaña: esos niveles solo coinciden si la atribucion los trae.
 * Nunca se inventan identificadores.
 */

export type Attribution = {
  sourceType: string | null;
  sourceId: string | null;
  sourceUrl: string | null;
  headline: string | null;
  ctwaClid: string | null;
  adId: string | null;
  adSetId: string | null;
  campaignId: string | null;
};

const text = (value: unknown, max: number) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);

/** Lee el referral del mensaje crudo de Meta. Sin referral = null. */
export function parseReferral(message: Record<string, unknown>): Attribution | null {
  const raw = message.referral;
  if (!raw || typeof raw !== 'object') return null;
  const referral = raw as Record<string, unknown>;
  const sourceType = text(referral.source_type, 32);
  const sourceId = text(referral.source_id, 64);
  const attribution: Attribution = {
    sourceType,
    sourceId,
    sourceUrl: text(referral.source_url, 500),
    headline: text(referral.headline, 200),
    ctwaClid: text(referral.ctwa_clid, 200),
    adId: sourceType === 'ad' ? sourceId : null,
    adSetId: null,
    campaignId: null,
  };
  return attribution.sourceId || attribution.sourceUrl || attribution.ctwaClid ? attribution : null;
}

export type RouteLevel = 'AD' | 'ADSET' | 'CAMPAIGN';
export type RouteCandidate = { id: string; level: RouteLevel; externalId: string };

const PRIORITY: RouteLevel[] = ['AD', 'ADSET', 'CAMPAIGN'];

/** Anuncio → conjunto → campaña. Sin coincidencia = null (manda el numero). */
export function matchCampaignRoute<T extends RouteCandidate>(routes: T[], attribution: Pick<Attribution, 'adId' | 'adSetId' | 'campaignId'>): T | null {
  const ids: Record<RouteLevel, string | null> = { AD: attribution.adId, ADSET: attribution.adSetId, CAMPAIGN: attribution.campaignId };
  for (const level of PRIORITY) {
    const id = ids[level];
    if (!id) continue;
    const route = routes.find((candidate) => candidate.level === level && candidate.externalId === id);
    if (route) return route;
  }
  return null;
}

const optionalId = z.string().min(1).max(64).nullable();

export const campaignRouteSchema = z
  .object({
    name: z.string().trim().min(1, 'Ponle un nombre.').max(80),
    level: z.enum(['AD', 'ADSET', 'CAMPAIGN']),
    // Los ids de Meta son numericos; se exige eso para no guardar un nombre por error.
    externalId: z.string().trim().regex(/^\d{5,32}$/, 'El ID de Meta es solo números (cópialo de Ads Manager).'),
    productId: optionalId,
    agentId: optionalId,
    flowId: optionalId,
    isActive: z.boolean(),
  })
  .strict();

export type CampaignRouteInput = z.infer<typeof campaignRouteSchema>;

export const ROUTE_LEVEL_LABEL: Record<RouteLevel, string> = { AD: 'Anuncio', ADSET: 'Conjunto de anuncios', CAMPAIGN: 'Campaña' };
