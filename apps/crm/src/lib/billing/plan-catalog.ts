import { PlanCode } from '../../../generated/prisma/enums';
import type { PrismaClient, Prisma } from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { BETA_PLANS, type PlanTerms } from './plans';

/**
 * Catalogo de planes de Upzites Flow (P0-B): FREE, START, PRO, SCALE.
 *
 * Aqui viven los TERMINOS (capacidades y cupos). Los PRECIOS no: estan en el
 * Price Book (`plan_prices`, ver price-book.ts), que se cambia sin deploy.
 *
 * PROVISIONAL hasta P0-C. START/PRO/SCALE reutilizan los terminos de la beta
 * solo por compatibilidad; no son el contrato comercial definitivo. FREE es
 * deliberadamente conservador: CRM basico y datos accesibles, nada que genere
 * coste variable (IA, mensajes pagados, email, campanas, Shopify, cotizador).
 * Canales y automatizaciones gratuitas se definen en P0-C.
 */

type CatalogEntry = { key: string; name: string; position: number; terms: Omit<PlanTerms, 'key' | 'name' | 'priceClp'>; features: string[] };

function fromBeta(betaKey: string) {
  const beta = BETA_PLANS.find((plan) => plan.key === betaKey);
  if (!beta) throw new Error(`Plan beta ${betaKey} no existe.`);
  return { terms: { capabilities: [...beta.capabilities], allowances: { ...beta.allowances }, overages: { ...beta.overages } }, features: beta.features };
}

export const PLAN_CATALOG: Record<PlanCode, CatalogEntry> = {
  [PlanCode.FREE]: {
    key: 'free',
    name: 'Free',
    position: 0,
    terms: {
      capabilities: [],
      allowances: {
        users: 1,
        contacts: 300,
        whatsapp_numbers: 0,
        conversations: 0,
        ai_cost_clp: 0,
        emails: 0,
        campaign_contacts: 0,
      },
      overages: {},
    },
    features: ['CRM basico', 'Contactos, pipeline y actividades', 'Tus datos siempre accesibles'],
  },
  [PlanCode.START]: { key: 'start', name: 'Start', position: 1, ...fromBeta('beta-inicial') },
  [PlanCode.PRO]: { key: 'pro', name: 'Pro', position: 2, ...fromBeta('beta-comercial') },
  [PlanCode.SCALE]: { key: 'scale', name: 'Scale', position: 3, ...fromBeta('beta-completo') },
};

export const PLAN_CODES = [PlanCode.FREE, PlanCode.START, PlanCode.PRO, PlanCode.SCALE] as const;

export function isPlanCode(value: unknown): value is PlanCode {
  return typeof value === 'string' && (PLAN_CODES as readonly string[]).includes(value);
}

/** Terminos de un plan del catalogo, con la forma que usa el enforcement. */
export function catalogTerms(code: PlanCode): PlanTerms {
  const entry = PLAN_CATALOG[code];
  return { key: entry.key, name: entry.name, priceClp: 0, ...entry.terms };
}

type Db = Pick<PrismaClient, 'subscriptionPlan'> | Pick<Prisma.TransactionClient, 'subscriptionPlan'>;

/**
 * Crea o actualiza las filas de plan del catalogo (idempotente). Las filas
 * existen para la FK de la suscripcion; `priceClp` queda en 0 a proposito:
 * el precio real sale del Price Book.
 */
export async function ensurePlanCatalog(db: Db = prisma) {
  const rows: Record<string, { id: string; code: PlanCode | null; key: string }> = {};
  for (const code of PLAN_CODES) {
    const entry = PLAN_CATALOG[code];
    const data = {
      code,
      name: entry.name,
      priceClp: 0,
      maxUsers: entry.terms.allowances.users ?? 0,
      maxContacts: entry.terms.allowances.contacts ?? 0,
      features: entry.features,
      capabilities: [...entry.terms.capabilities],
      allowances: entry.terms.allowances,
      overages: entry.terms.overages,
      position: entry.position,
      isActive: true,
    };
    rows[code] = await db.subscriptionPlan.upsert({
      where: { key: entry.key },
      create: { key: entry.key, ...data },
      update: data,
      select: { id: true, code: true, key: true },
    });
  }
  return rows as Record<PlanCode, { id: string; code: PlanCode | null; key: string }>;
}
