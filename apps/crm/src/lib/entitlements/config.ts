import { PlanCode } from '../../../generated/prisma/enums';

/**
 * Catalogo de entitlements de Upzites Flow (P0-C): la UNICA fuente de numeros
 * y funciones por plan. Nada fuera de este archivo sabe que "PRO incluye
 * pedidos": el codigo pregunta `can('commerce.orders')` y la respuesta sale
 * de aqui.
 *
 * Reglas:
 *  - Nunca ilimitado: todo limite es un numero.
 *  - Sin overage: llegar al limite bloquea lo que aumenta el uso (D3).
 *  - Una asignacion legacy que genera coste y no esta aprobada vale 0
 *    (emails, contactos de campana). Las locales se mapean desde la beta.
 */

/** Limites numericos. `*.max` son existencias; `*.monthly*` son del mes. */
export const LIMIT_KEYS = [
  'users.max',
  'contacts.max',
  'channels.max',
  'automations.active.max',
  'agents.max',
  'ai.monthlyCredits',
  'conversations.monthly',
  'emails.monthly',
  'campaignContacts.monthly',
] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

/** `campaigns` tiene un nivel intermedio: 'basic' (ver FEATURE_RULES). */
export type CampaignsLevel = false | 'basic' | true;

export type PlanFeatures = {
  quotes: boolean;
  commerce: boolean;
  shopify: boolean;
  recovery: boolean;
  campaigns: CampaignsLevel;
  'analytics.advanced': boolean;
  'api.advanced': boolean;
};

export type EntitlementValues = {
  limits: Record<LimitKey, number>;
  features: PlanFeatures;
};

export const PLAN_ENTITLEMENTS: Record<PlanCode, EntitlementValues> = {
  [PlanCode.FREE]: {
    limits: {
      'users.max': 1,
      'contacts.max': 300,
      'channels.max': 0,
      'automations.active.max': 3,
      'agents.max': 0,
      'ai.monthlyCredits': 0,
      'conversations.monthly': 0,
      'emails.monthly': 0,
      'campaignContacts.monthly': 0,
    },
    features: {
      quotes: false,
      commerce: false,
      shopify: false,
      recovery: false,
      campaigns: false,
      'analytics.advanced': false,
      'api.advanced': false,
    },
  },
  [PlanCode.START]: {
    limits: {
      'users.max': 2,
      'contacts.max': 2500,
      'channels.max': 2,
      'automations.active.max': 10,
      'agents.max': 1,
      'ai.monthlyCredits': 200,
      // Beta Inicial. Se mide y no se aplica: la conversacion de WhatsApp la
      // factura Meta a la WABA del propio cliente, no a Upzites.
      'conversations.monthly': 500,
      // Coste de Upzites (proveedor de email) sin aprobar: 0.
      'emails.monthly': 0,
      'campaignContacts.monthly': 0,
    },
    features: {
      quotes: true,
      commerce: false,
      shopify: false,
      recovery: false,
      campaigns: 'basic',
      'analytics.advanced': false,
      'api.advanced': false,
    },
  },
  [PlanCode.PRO]: {
    limits: {
      'users.max': 5,
      'contacts.max': 10000,
      'channels.max': 4,
      'automations.active.max': 50,
      'agents.max': 5,
      'ai.monthlyCredits': 1000,
      'conversations.monthly': 2000,
      'emails.monthly': 0,
      'campaignContacts.monthly': 0,
    },
    features: {
      quotes: true,
      commerce: true,
      shopify: true,
      recovery: true,
      campaigns: true,
      'analytics.advanced': true,
      'api.advanced': false,
    },
  },
  [PlanCode.SCALE]: {
    limits: {
      'users.max': 15,
      'contacts.max': 50000,
      'channels.max': 10,
      'automations.active.max': 200,
      'agents.max': 20,
      'ai.monthlyCredits': 4000,
      'conversations.monthly': 8000,
      'emails.monthly': 0,
      'campaignContacts.monthly': 0,
    },
    features: {
      quotes: true,
      commerce: true,
      shopify: true,
      recovery: true,
      campaigns: true,
      'analytics.advanced': true,
      'api.advanced': true,
    },
  },
};

/** Todo en cero: SUSPENDED y cualquier estado desconocido. */
export const NO_ENTITLEMENTS: EntitlementValues = {
  limits: Object.fromEntries(LIMIT_KEYS.map((key) => [key, 0])) as Record<LimitKey, number>,
  features: {
    quotes: false,
    commerce: false,
    shopify: false,
    recovery: false,
    campaigns: false,
    'analytics.advanced': false,
    'api.advanced': false,
  },
};

// --- Creditos de IA ------------------------------------------------------------

/**
 * 1 credito = 1000 tokens ponderados; ponderados = input + output * 4.
 *
 * Los multiplicadores por proveedor/modelo quedan preparados (1 por defecto)
 * para cuando haya mas de un modelo auditado. No es un motor de precios: es un
 * factor por el que se multiplica el total ponderado.
 */
export const AI_CREDITS = {
  tokensPerCredit: 1000,
  outputWeight: 4,
  providerMultiplier: {} as Record<string, number>,
  modelMultiplier: {} as Record<string, number>,
} as const;

// --- Funciones consultables con can() -----------------------------------------

/**
 * Cada clave de `can()` es una regla sobre los valores del plan. Las paginas y
 * los endpoints usan estas claves; nunca el nombre del plan.
 *
 * `campaigns: 'basic'` = journeys (secuencias automaticas por canal y tareas);
 * `campaigns: true` = ademas envios masivos y email promocional.
 */
export const FEATURE_RULES = {
  quotes: (v: EntitlementValues) => v.features.quotes,
  'commerce.orders': (v: EntitlementValues) => v.features.commerce,
  'commerce.products': (v: EntitlementValues) => v.features.commerce,
  'commerce.checkout': (v: EntitlementValues) => v.features.commerce,
  'integrations.mercadoPago': (v: EntitlementValues) => v.features.commerce,
  'integrations.shopify': (v: EntitlementValues) => v.features.shopify,
  recovery: (v: EntitlementValues) => v.features.recovery,
  'campaigns.journeys': (v: EntitlementValues) => v.features.campaigns !== false,
  'campaigns.bulk': (v: EntitlementValues) => v.features.campaigns === true,
  'email.promotional': (v: EntitlementValues) => v.features.campaigns === true,
  'analytics.advanced': (v: EntitlementValues) => v.features['analytics.advanced'],
  'api.advanced': (v: EntitlementValues) => v.features['api.advanced'],
  ai: (v: EntitlementValues) => v.limits['ai.monthlyCredits'] > 0,
  agents: (v: EntitlementValues) => v.limits['agents.max'] > 0 && v.limits['ai.monthlyCredits'] > 0,
  'channels.messaging': (v: EntitlementValues) => v.limits['channels.max'] > 0,
} as const;

export type FeatureKey = keyof typeof FEATURE_RULES;
export const FEATURE_KEYS = Object.keys(FEATURE_RULES) as FeatureKey[];

export const FEATURE_LABEL: Record<FeatureKey, string> = {
  quotes: 'Cotizador',
  'commerce.orders': 'Pedidos',
  'commerce.products': 'Productos',
  'commerce.checkout': 'Cobros de pedidos',
  'integrations.mercadoPago': 'Mercado Pago para tus ventas',
  'integrations.shopify': 'Shopify',
  recovery: 'Recuperación de ventas',
  'campaigns.journeys': 'Seguimientos automáticos',
  'campaigns.bulk': 'Campañas',
  'email.promotional': 'Email promocional',
  'analytics.advanced': 'Analítica avanzada',
  'api.advanced': 'API avanzada',
  ai: 'Inteligencia artificial',
  agents: 'Agentes IA',
  'channels.messaging': 'Canales de mensajería',
};

/** Que se cuenta para cada limite. */
export const USAGE_METRICS = [
  'users',
  'contacts',
  'channels',
  'automations.active',
  'agents',
  'ai.credits',
  'conversations',
  'emails',
  'campaignContacts',
] as const;
export type UsageMetric = (typeof USAGE_METRICS)[number];

export const LIMIT_METRIC: Record<LimitKey, UsageMetric> = {
  'users.max': 'users',
  'contacts.max': 'contacts',
  'channels.max': 'channels',
  'automations.active.max': 'automations.active',
  'agents.max': 'agents',
  'ai.monthlyCredits': 'ai.credits',
  'conversations.monthly': 'conversations',
  'emails.monthly': 'emails',
  'campaignContacts.monthly': 'campaignContacts',
};

export const LIMIT_LABEL: Record<LimitKey, string> = {
  'users.max': 'Usuarios',
  'contacts.max': 'Contactos',
  'channels.max': 'Canales conectados',
  'automations.active.max': 'Automatizaciones activas',
  'agents.max': 'Agentes IA',
  'ai.monthlyCredits': 'Créditos de IA del mes',
  'conversations.monthly': 'Conversaciones del mes',
  'emails.monthly': 'Emails del mes',
  'campaignContacts.monthly': 'Contactos de campaña del mes',
};

/** Orden de los planes a la venta, para "Disponible en X". */
export const PLAN_ORDER = [PlanCode.FREE, PlanCode.START, PlanCode.PRO, PlanCode.SCALE] as const;
