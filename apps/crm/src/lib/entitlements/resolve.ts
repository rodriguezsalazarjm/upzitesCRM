import { PlanCode } from '../../../generated/prisma/enums';
import type { PlanTerms } from '../billing/plans';
import type { SubscriptionSnapshot } from '../billing/subscription-state';
import {
  FEATURE_RULES,
  LIMIT_KEYS,
  NO_ENTITLEMENTS,
  PLAN_ENTITLEMENTS,
  PLAN_ORDER,
  type EntitlementValues,
  type FeatureKey,
  type LimitKey,
} from './config';

/**
 * Resolucion pura de entitlements: estado de la suscripcion (P0-B) + catalogo
 * (P0-C). Sin base de datos, para probarla sin conexion.
 *
 *  - SUSPENDED: todo en cero. No baja a FREE: bloquea (D5).
 *  - Plan del catalogo: sus valores (FREE si expiro; GRACE conserva el plan).
 *  - Plan LEGACY (monthly, beta-*): se derivan de sus capacidades y cupos
 *    hasta su clasificacion manual (P0-D). No se reconcilian.
 */

export type EntitlementSource = 'CATALOG' | 'LEGACY' | 'SUSPENDED';

export type ResolvedEntitlements = {
  source: EntitlementSource;
  /** Plan cuyos valores rigen. null = legacy o suspendido. */
  planCode: PlanCode | null;
  values: EntitlementValues;
};

/**
 * Valores de un plan legacy. Lo que la beta no limitaba (automatizaciones,
 * cantidad de agentes, canales que no son WhatsApp) toma el techo de SCALE:
 * nunca ilimitado, y ningun cliente legacy pierde lo que ya usa antes de su
 * clasificacion. El presupuesto real de IA de un legacy sigue siendo su
 * `ai_cost_clp` (ver ai-credits.ts).
 */
export function valuesFromLegacyTerms(terms: PlanTerms): EntitlementValues {
  const caps = new Set<string>(terms.capabilities);
  const a = terms.allowances;
  const ceiling = PLAN_ENTITLEMENTS[PlanCode.SCALE].limits;
  const ai = caps.has('AI_AGENTS');
  return {
    limits: {
      'users.max': a.users ?? 0,
      'contacts.max': a.contacts ?? 0,
      'channels.max': caps.has('WHATSAPP') ? ceiling['channels.max'] : 0,
      'automations.active.max': ceiling['automations.active.max'],
      'agents.max': ai ? ceiling['agents.max'] : 0,
      'ai.monthlyCredits': ai ? ceiling['ai.monthlyCredits'] : 0,
      'conversations.monthly': a.conversations ?? 0,
      'emails.monthly': a.emails ?? 0,
      'campaignContacts.monthly': a.campaign_contacts ?? 0,
    },
    features: {
      quotes: caps.has('QUOTES'),
      commerce: caps.has('PAYMENTS'),
      shopify: caps.has('SHOPIFY'),
      recovery: caps.has('PAYMENTS'),
      campaigns: caps.has('CAMPAIGNS') ? true : false,
      'analytics.advanced': false,
      'api.advanced': false,
    },
  };
}

export function resolveEntitlementValues(
  subscription: Pick<SubscriptionSnapshot, 'hasAccess' | 'effectivePlan'>,
  legacyTerms: PlanTerms | null,
): ResolvedEntitlements {
  if (!subscription.hasAccess) return { source: 'SUSPENDED', planCode: null, values: NO_ENTITLEMENTS };
  if (subscription.effectivePlan === 'LEGACY') {
    if (!legacyTerms) return { source: 'CATALOG', planCode: PlanCode.FREE, values: PLAN_ENTITLEMENTS[PlanCode.FREE] };
    return { source: 'LEGACY', planCode: null, values: valuesFromLegacyTerms(legacyTerms) };
  }
  return {
    source: 'CATALOG',
    planCode: subscription.effectivePlan,
    values: PLAN_ENTITLEMENTS[subscription.effectivePlan],
  };
}

export function canWith(values: EntitlementValues, key: FeatureKey) {
  return FEATURE_RULES[key](values);
}

/** Plan mas bajo del catalogo que incluye la funcion ("Disponible en PRO"). */
export function requiredPlanForFeature(key: FeatureKey): PlanCode | null {
  return PLAN_ORDER.find((code) => FEATURE_RULES[key](PLAN_ENTITLEMENTS[code])) ?? null;
}

/** Plan mas bajo cuyo limite admite `needed` unidades. */
export function requiredPlanForLimit(key: LimitKey, needed: number): PlanCode | null {
  return PLAN_ORDER.find((code) => PLAN_ENTITLEMENTS[code].limits[key] >= needed) ?? null;
}

// --- Compatibilidad con el sistema de capacidades/cupos (Fase 9) ----------------

/**
 * Terminos legacy (capabilities + allowances) de un plan del catalogo,
 * DERIVADOS de PLAN_ENTITLEMENTS. `hasCapability` y `checkAllowance` siguen
 * funcionando como fachadas sin que exista una segunda tabla de numeros.
 *
 * `ai_cost_clp` ya no es un cupo de los planes del catalogo: la IA se mide en
 * creditos (`ai_credits`). `whatsapp_numbers` se reemplaza por `channels.max`
 * (agnostico de proveedor).
 */
export function legacyTermsFromValues(values: EntitlementValues): Pick<PlanTerms, 'capabilities' | 'allowances' | 'overages'> {
  const capabilities: PlanTerms['capabilities'] = [];
  if (canWith(values, 'channels.messaging')) capabilities.push('WHATSAPP');
  if (canWith(values, 'ai')) capabilities.push('AI_AGENTS');
  if (canWith(values, 'quotes')) capabilities.push('QUOTES');
  if (canWith(values, 'integrations.shopify')) capabilities.push('SHOPIFY');
  if (canWith(values, 'commerce.orders')) capabilities.push('PAYMENTS');
  if (canWith(values, 'email.promotional')) capabilities.push('EMAIL');
  if (canWith(values, 'campaigns.bulk')) capabilities.push('CAMPAIGNS');
  const l = values.limits;
  return {
    capabilities,
    allowances: {
      users: l['users.max'],
      contacts: l['contacts.max'],
      whatsapp_numbers: l['channels.max'],
      conversations: l['conversations.monthly'],
      ai_credits: l['ai.monthlyCredits'],
      emails: l['emails.monthly'],
      campaign_contacts: l['campaignContacts.monthly'],
    },
    // D3: no hay cobro de excedentes. Llegar al limite bloquea.
    overages: {},
  };
}

export { LIMIT_KEYS };
