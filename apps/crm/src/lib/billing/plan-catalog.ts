import { PlanCode } from '../../../generated/prisma/enums';
import type { PrismaClient, Prisma } from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { PLAN_ENTITLEMENTS } from '../entitlements/config';
import { legacyTermsFromValues } from '../entitlements/resolve';
import type { PlanTerms } from './plans';

/**
 * Catalogo de planes de Upzites Flow: FREE, START, PRO, SCALE.
 *
 * Aqui viven nombre, orden y textos comerciales. Los NUMEROS y las FUNCIONES
 * de cada plan viven en `entitlements/config.ts` (P0-C, unica fuente); los
 * terminos legacy (capabilities/allowances) se derivan de ahi para que
 * `hasCapability`/`checkAllowance` sigan funcionando como fachadas. Los
 * PRECIOS estan en el Price Book (`plan_prices`, ver price-book.ts).
 */

type CatalogEntry = { key: string; name: string; position: number; terms: Omit<PlanTerms, 'key' | 'name' | 'priceClp'>; features: string[] };

function entry(code: PlanCode, key: string, name: string, position: number, features: string[]): CatalogEntry {
  return { key, name, position, terms: legacyTermsFromValues(PLAN_ENTITLEMENTS[code]), features };
}

export const PLAN_CATALOG: Record<PlanCode, CatalogEntry> = {
  [PlanCode.FREE]: entry(PlanCode.FREE, 'free', 'Free', 0, [
    'CRM básico: contactos, pipeline y actividades',
    'Hasta 3 automatizaciones internas',
    'Tus datos siempre accesibles',
  ]),
  [PlanCode.START]: entry(PlanCode.START, 'start', 'Start', 1, [
    '2 canales de mensajería',
    'Agente IA con 200 créditos al mes',
    'Cotizador y seguimientos automáticos',
  ]),
  [PlanCode.PRO]: entry(PlanCode.PRO, 'pro', 'Pro', 2, [
    'Productos, pedidos y cobros',
    'Shopify y recuperación de ventas',
    'Campañas y analítica avanzada',
  ]),
  [PlanCode.SCALE]: entry(PlanCode.SCALE, 'scale', 'Scale', 3, [
    'Todo lo de Pro, con más capacidad',
    '10 canales y 20 agentes IA',
    'API avanzada',
  ]),
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
