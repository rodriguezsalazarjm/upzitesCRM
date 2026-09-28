import { BillingInterval, type PlanCode } from '../../../generated/prisma/enums';
import type { Prisma, PrismaClient } from '../../../generated/prisma/client';
import { prisma } from '../prisma';

/**
 * Price Book (P0-B). La tabla `plan_prices` es la fuente de verdad del precio:
 * ninguna pantalla ni endpoint lleva montos escritos a mano.
 *
 * Convencion unica de montos: ENTEROS en unidades menores ISO 4217.
 *   CLP (exponente 0): 19990 = $19.990
 *   USD (exponente 2): 1900  = US$19,00
 * No hay conversion entre monedas: cada moneda tiene su propia fila.
 *
 * Sin ambiguedad: para cada (plan, moneda, intervalo) las filas activas forman
 * una linea de tiempo sin solapes. Solo `publishPlanPrice` crea versiones, y
 * lo hace cerrando la anterior en la misma transaccion. Las filas cerradas se
 * conservan: un checkout emitido con una version vieja se valida contra ESA
 * version (ver el webhook), no contra la vigente.
 */

export { addInterval, CURRENCY_EXPONENT, currencyExponent, formatMoney, toMajorUnits } from './money';

type Db = Pick<PrismaClient, 'planPrice'> | Pick<Prisma.TransactionClient, 'planPrice'>;

/** Filtro de vigencia: activa y dentro de [validFrom, validUntil). */
function inForce(now: Date) {
  return {
    active: true,
    validFrom: { lte: now },
    OR: [{ validUntil: null }, { validUntil: { gt: now } }],
  } satisfies Prisma.PlanPriceWhereInput;
}

/**
 * Orden determinista. Con la linea de tiempo sin solapes hay a lo sumo una
 * fila vigente; si alguna vez hubiera dos (datos cargados a mano), gana siempre
 * la misma: la de `validFrom` mas reciente, luego la mas nueva, luego por id.
 */
const DETERMINISTIC_ORDER = [
  { validFrom: 'desc' },
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.PlanPriceOrderByWithRelationInput[];

export function getCurrentPrice(
  input: { planCode: PlanCode; currency: string; interval?: BillingInterval; now?: Date },
  db: Db = prisma,
) {
  return db.planPrice.findFirst({
    where: {
      planCode: input.planCode,
      currency: input.currency.toUpperCase(),
      interval: input.interval ?? BillingInterval.MONTH,
      ...inForce(input.now ?? new Date()),
    },
    orderBy: DETERMINISTIC_ORDER,
  });
}

/** Todos los precios vigentes (una fila por plan/moneda/intervalo). */
export async function listCurrentPrices(input: { currency?: string; now?: Date } = {}, db: Db = prisma) {
  const rows = await db.planPrice.findMany({
    where: { ...(input.currency ? { currency: input.currency.toUpperCase() } : {}), ...inForce(input.now ?? new Date()) },
    orderBy: [{ planCode: 'asc' }, { currency: 'asc' }, { interval: 'asc' }, ...DETERMINISTIC_ORDER],
  });
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.planCode}:${row.currency}:${row.interval}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Publica una version de precio, en una transaccion:
 *  1. bloquea la clave (plan, moneda, intervalo) para que dos publicaciones
 *     simultaneas no se crucen;
 *  2. cierra con `validUntil = validFrom` la version que cubre ese momento;
 *  3. desactiva las versiones programadas para despues (quedan como historial);
 *  4. crea la nueva version con `validFrom`.
 * Resultado: nunca hay dos precios activos vigentes a la vez para la clave.
 */
export async function publishPlanPrice(input: {
  planCode: PlanCode;
  currency: string;
  interval?: BillingInterval;
  amountMinor: number;
  validFrom?: Date;
  actorId?: string | null;
}) {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < 0) {
    throw new Error('amountMinor debe ser un entero >= 0 en unidades menores.');
  }
  const currency = input.currency.toUpperCase();
  const interval = input.interval ?? BillingInterval.MONTH;
  const validFrom = input.validFrom ?? new Date();
  const key = { planCode: input.planCode, currency, interval };

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `plan_price:${input.planCode}:${currency}:${interval}`);

    const closed = await tx.planPrice.updateMany({
      where: { ...key, active: true, validFrom: { lt: validFrom }, OR: [{ validUntil: null }, { validUntil: { gt: validFrom } }] },
      data: { validUntil: validFrom },
    });
    const superseded = await tx.planPrice.updateMany({
      where: { ...key, active: true, validFrom: { gte: validFrom } },
      data: { active: false },
    });
    const price = await tx.planPrice.create({
      data: { ...key, amountMinor: input.amountMinor, validFrom, createdById: input.actorId ?? null },
    });
    await tx.platformAuditLog.create({
      data: {
        actorUserId: input.actorId ?? null,
        action: 'price_book.published',
        metadata: { ...key, amountMinor: input.amountMinor, validFrom: validFrom.toISOString(), priceId: price.id, closed: closed.count, superseded: superseded.count },
      },
    });
    return price;
  });
}

/**
 * Verificacion de integridad: momentos en que una clave tendria mas de una
 * version activa vigente. Debe devolver siempre []. Lo usan los tests.
 */
export async function findOverlappingPrices(db: Db = prisma) {
  const rows = await db.planPrice.findMany({
    where: { active: true },
    orderBy: [{ planCode: 'asc' }, { currency: 'asc' }, { interval: 'asc' }, { validFrom: 'asc' }],
  });
  const overlaps: { key: string; a: string; b: string }[] = [];
  // Por clave, la fila que llega mas lejos hasta ahora: cualquier fila que
  // empiece antes de ese fin se solapa con ella (no solo con la vecina).
  const reach = new Map<string, { id: string; end: number }>();
  for (const row of rows) {
    const key = `${row.planCode}:${row.currency}:${row.interval}`;
    const end = row.validUntil?.getTime() ?? Number.POSITIVE_INFINITY;
    const furthest = reach.get(key);
    if (furthest && row.validFrom.getTime() < furthest.end) overlaps.push({ key, a: furthest.id, b: row.id });
    if (!furthest || end > furthest.end) reach.set(key, { id: row.id, end });
  }
  return overlaps;
}
