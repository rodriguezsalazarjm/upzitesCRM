import { z } from 'zod';
import type { SubscriptionPlan } from '../../../generated/prisma/client';

/**
 * Planes: que puede hacer un cliente y cuanto puede consumir.
 *
 * Dos reglas de la spec ordenan este archivo:
 *
 *  1. **Nunca ilimitado.** Toda metrica tiene un numero. Una metrica que el
 *     plan no declara no queda "sin limite": queda prohibida. Es la diferencia
 *     entre olvidarse de poner un tope y decidir que no hay tope, y solo una de
 *     las dos es una decision.
 *  2. **Capacidades, no condicionales por rubro.** Un plan habilita cotizador,
 *     Shopify o campanas; el codigo pregunta por la capacidad, nunca por el
 *     nombre del plan. Agregar un plan no obliga a tocar ningun `if`.
 */

/** Lo que un plan puede habilitar. Cerrado a proposito. */
export const PLAN_CAPABILITIES = [
  'WHATSAPP',
  'AI_AGENTS',
  'QUOTES',
  'SHOPIFY',
  'PAYMENTS',
  'EMAIL',
  'CAMPAIGNS',
] as const;

export type PlanCapability = (typeof PLAN_CAPABILITIES)[number];

export function isCapability(value: string): value is PlanCapability {
  return (PLAN_CAPABILITIES as readonly string[]).includes(value);
}

/**
 * Metricas con cupo mensual.
 *
 * `contacts`, `users` y `whatsapp_numbers` son existencias —cuantos hay ahora—
 * y el resto es consumo del periodo. Se distinguen en `ALLOWANCE_KIND` porque
 * un contacto borrado libera cupo y un mensaje enviado no.
 */
export const ALLOWANCE_METRICS = [
  'contacts',
  'users',
  'whatsapp_numbers',
  'conversations',
  'ai_cost_clp',
  'emails',
  'campaign_contacts',
] as const;

export type AllowanceMetric = (typeof ALLOWANCE_METRICS)[number];

export const ALLOWANCE_KIND: Record<AllowanceMetric, 'stock' | 'flow'> = {
  contacts: 'stock',
  users: 'stock',
  whatsapp_numbers: 'stock',
  conversations: 'flow',
  ai_cost_clp: 'flow',
  emails: 'flow',
  campaign_contacts: 'flow',
};

export const ALLOWANCE_LABEL: Record<AllowanceMetric, string> = {
  contacts: 'Contactos',
  users: 'Usuarios',
  whatsapp_numbers: 'Numeros de WhatsApp',
  conversations: 'Conversaciones del mes',
  ai_cost_clp: 'Costo de IA del mes',
  emails: 'Emails del mes',
  campaign_contacts: 'Contactos de campana del mes',
};

export const allowancesSchema = z
  .object(
    Object.fromEntries(
      ALLOWANCE_METRICS.map((metric) => [metric, z.number().int().min(0).optional()]),
    ) as Record<AllowanceMetric, z.ZodOptional<z.ZodNumber>>,
  )
  .strict();

export type Allowances = Partial<Record<AllowanceMetric, number>>;

export function parseAllowances(raw: unknown): Allowances {
  const parsed = allowancesSchema.safeParse(raw ?? {});
  return parsed.success ? (parsed.data as Allowances) : {};
}

/** Precio del excedente por unidad. Sin entrada, pasarse bloquea. */
export const overagesSchema = z
  .object(
    Object.fromEntries(
      ALLOWANCE_METRICS.map((metric) => [metric, z.number().int().min(0).optional()]),
    ) as Record<AllowanceMetric, z.ZodOptional<z.ZodNumber>>,
  )
  .strict();

export function parseOverages(raw: unknown): Allowances {
  const parsed = overagesSchema.safeParse(raw ?? {});
  return parsed.success ? (parsed.data as Allowances) : {};
}

export type PlanTerms = {
  key: string;
  name: string;
  priceClp: number;
  capabilities: PlanCapability[];
  allowances: Allowances;
  overages: Allowances;
};

export function planTerms(plan: SubscriptionPlan): PlanTerms {
  const allowances = parseAllowances(plan.allowances);

  return {
    key: plan.key,
    name: plan.name,
    priceClp: plan.priceClp,
    capabilities: plan.capabilities.filter(isCapability),
    // `maxUsers` y `maxContacts` son columnas anteriores a esta fase. Siguen
    // mandando si el JSON no dice otra cosa, para no bajarle el cupo a un
    // cliente que ya lo tenia.
    allowances: {
      users: plan.maxUsers,
      contacts: plan.maxContacts,
      ...allowances,
    },
    overages: parseOverages(plan.overages),
  };
}

/**
 * Planes de la beta.
 *
 * Tres escalones y ninguno ilimitado. El de arranque no incluye Shopify ni
 * campanas: no por avaricia, sino porque un cliente que todavia no vendio nada
 * no necesita sincronizar un catalogo, y darle menos superficie es darle menos
 * formas de configurarse mal.
 */
export const BETA_PLANS: (PlanTerms & { features: string[]; position: number })[] = [
  {
    key: 'beta-inicial',
    name: 'Beta Inicial',
    priceClp: 49000,
    position: 1,
    capabilities: ['WHATSAPP', 'AI_AGENTS', 'PAYMENTS'],
    allowances: {
      users: 3,
      contacts: 1000,
      whatsapp_numbers: 1,
      conversations: 500,
      ai_cost_clp: 20000,
      emails: 0,
      campaign_contacts: 0,
    },
    overages: { conversations: 40, ai_cost_clp: 1 },
    features: ['CRM completo', 'WhatsApp con agente IA', 'Cobros con Mercado Pago'],
  },
  {
    key: 'beta-comercial',
    name: 'Beta Comercial',
    priceClp: 89000,
    position: 2,
    capabilities: ['WHATSAPP', 'AI_AGENTS', 'PAYMENTS', 'QUOTES', 'EMAIL', 'CAMPAIGNS'],
    allowances: {
      users: 8,
      contacts: 5000,
      whatsapp_numbers: 1,
      conversations: 2000,
      ai_cost_clp: 60000,
      emails: 10000,
      campaign_contacts: 5000,
    },
    overages: { conversations: 35, ai_cost_clp: 1, emails: 2 },
    features: ['Todo lo anterior', 'Cotizador con aprobacion', 'Email y campanas'],
  },
  {
    key: 'beta-completo',
    name: 'Beta Completo',
    priceClp: 149000,
    position: 3,
    capabilities: [
      'WHATSAPP',
      'AI_AGENTS',
      'PAYMENTS',
      'QUOTES',
      'EMAIL',
      'CAMPAIGNS',
      'SHOPIFY',
    ],
    allowances: {
      users: 20,
      contacts: 20000,
      whatsapp_numbers: 3,
      conversations: 8000,
      ai_cost_clp: 200000,
      emails: 50000,
      campaign_contacts: 20000,
    },
    overages: { conversations: 30, ai_cost_clp: 1, emails: 1 },
    features: ['Todo lo anterior', 'Shopify sincronizado', 'Hasta 3 numeros de WhatsApp'],
  },
];
