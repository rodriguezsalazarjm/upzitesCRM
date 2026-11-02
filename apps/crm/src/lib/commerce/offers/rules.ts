import { z } from 'zod';
import { MAX_PRICE_MINOR, bumpProblem, type BumpCandidate, type BumpIssue } from '../product-studio/rules';

/**
 * Ofertas de producto (Punto 6) — reglas puras, sin base de datos.
 *
 * Dos tipos, un solo modelo (`ProductOffer`):
 *  - ORDER_BUMP: casilla opcional en el checkout, antes de pagar. Se suma al
 *    MISMO pedido y a la MISMA preferencia de pago.
 *  - UPSELL: oferta despues de que el pago se confirma. Mercado Pago Checkout
 *    Pro no permite cobrar de nuevo la tarjeta sin que el comprador vuelva a
 *    autorizar, asi que aceptar crea un pedido ADICIONAL con su propio pago.
 *
 * Una oferta ofrece una variante de OTRO producto del mismo workspace (mismas
 * reglas que el bump del Studio: `bumpProblem`), con copy y, opcionalmente, un
 * precio especial. Entre varias ofertas del mismo tipo gana la de menor
 * `priority` que este disponible; las demas son respaldo.
 */

export const OFFER_KINDS = ['ORDER_BUMP', 'UPSELL'] as const;
export type OfferKind = (typeof OFFER_KINDS)[number];

export const OFFER_HEADLINE_MAX = 120;
export const OFFER_DESCRIPTION_MAX = 400;
/** Ofertas por producto y tipo (activas o pausadas; las archivadas no cuentan). */
export const MAX_OFFERS_PER_KIND = 5;

export const OFFER_KIND_LABEL: Record<OfferKind, string> = {
  ORDER_BUMP: 'Order bump',
  UPSELL: 'Upsell postcompra',
};

const idSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Identificador inválido.');
const priceSchema = z
  .number({ invalid_type_error: 'Ingresa un precio válido.' })
  .int('Ingresa un precio válido.')
  .min(1, 'El precio especial debe ser mayor que cero.')
  .max(MAX_PRICE_MINOR, 'El precio es demasiado alto.');

const fields = {
  variantId: idSchema,
  headline: z.string().trim().min(1, 'Escribe el título de la oferta.').max(OFFER_HEADLINE_MAX, `El título admite hasta ${OFFER_HEADLINE_MAX} caracteres.`),
  description: z
    .string()
    .max(OFFER_DESCRIPTION_MAX, `La descripción admite hasta ${OFFER_DESCRIPTION_MAX} caracteres.`)
    .nullable()
    .optional()
    .transform((value) => (value ?? '').trim() || null),
  /** Precio especial en unidades menores; null = el de la variante. */
  price: priceSchema.nullable().default(null),
  showImage: z.boolean().default(true),
  isActive: z.boolean().default(true),
};

/** Lo unico que la UI puede enviar al crear. `.strict()`: workspace, prioridad o estado de medicion no se aceptan. */
export const offerCreateSchema = z.object({ kind: z.enum(OFFER_KINDS, { errorMap: () => ({ message: 'Tipo de oferta inválido.' }) }), ...fields }).strict();
export type OfferCreateInput = z.infer<typeof offerCreateSchema>;

/** Edicion: el tipo no cambia (un bump no se convierte en upsell). */
export const offerUpdateSchema = z.object(fields).strict();
export type OfferUpdateInput = z.infer<typeof offerUpdateSchema>;

export const offerReorderSchema = z
  .object({ kind: z.enum(OFFER_KINDS), ids: z.array(idSchema).min(1).max(MAX_OFFERS_PER_KIND) })
  .strict()
  .refine((value) => new Set(value.ids).size === value.ids.length, { message: 'Oferta repetida.', path: ['ids'] });

export const upsellDecisionSchema = z.enum(['accept', 'decline']);
export type UpsellDecision = z.infer<typeof upsellDecisionSchema>;

/** Precio que se cobra: el especial si existe, si no el de la variante. */
export function effectiveOfferPrice(offerPrice: number | null | undefined, variantPrice: number) {
  return typeof offerPrice === 'number' && offerPrice > 0 ? offerPrice : variantPrice;
}

export function defaultOfferHeadline(kind: OfferKind, label: string) {
  const text = kind === 'ORDER_BUMP' ? `Agregar también ${label}` : `Antes de irte: ${label}`;
  return text.slice(0, OFFER_HEADLINE_MAX);
}

export type OfferCandidate<T> = {
  offer: T & { isActive: boolean; archivedAt: Date | null; priority: number };
  candidate: BumpCandidate | null;
};

/**
 * Por que una oferta guardada no se mostraria hoy (null = se muestra). A
 * diferencia del guardado, aqui NOT_PUBLISHED si impide mostrarla: al
 * comprador solo se le ofrece lo que esta a la venta.
 */
export function offerIssue(input: { mainProductId: string; workspaceId: string; currency: string; candidate: BumpCandidate | null }): BumpIssue | null {
  return bumpProblem(input);
}

/**
 * La oferta que ve el comprador: la primera disponible por prioridad. Pausadas
 * y archivadas no compiten.
 */
export function pickOffer<T>(
  candidates: OfferCandidate<T>[],
  context: { mainProductId: string; workspaceId: string; currency: string },
): OfferCandidate<T> | null {
  const ordered = [...candidates].sort((a, b) => a.offer.priority - b.offer.priority);
  return ordered.find((item) => item.offer.isActive && !item.offer.archivedAt && offerIssue({ ...context, candidate: item.candidate }) === null) ?? null;
}

// --- Medicion ----------------------------------------------------------------------

export type OfferStatRow = {
  status: 'SHOWN' | 'ACCEPTED' | 'DECLINED';
  priceMinor: number;
  /** El pedido que cobra la oferta esta pagado (bump: el mismo; upsell: el adicional). */
  paid: boolean;
  /** El pedido en el que se mostro termino pagado (solo importa para el bump). */
  basePaid: boolean;
  simulated: boolean;
};

export type OfferStats = {
  shown: number;
  accepted: number;
  declined: number;
  paid: number;
  revenue: number;
  /** Proporcion 0..1, o null sin datos suficientes. Ver summarizeOfferStats. */
  takeRate: number | null;
  simulated: number;
};

/**
 * Take rate:
 *  - Bump: de los pedidos PAGADOS en los que se mostro, cuantos lo incluyeron.
 *    Un checkout abandonado no dice nada del bump.
 *  - Upsell: de las veces que se mostro (siempre tras un pago), cuantas
 *    terminaron en un pedido adicional pagado.
 */
export function summarizeOfferStats(kind: OfferKind, rows: OfferStatRow[]): OfferStats {
  const accepted = rows.filter((row) => row.status === 'ACCEPTED');
  const paidRows = accepted.filter((row) => row.paid);
  const base = kind === 'ORDER_BUMP' ? rows.filter((row) => row.basePaid).length : rows.length;
  return {
    shown: rows.length,
    accepted: accepted.length,
    declined: rows.filter((row) => row.status === 'DECLINED').length,
    paid: paidRows.length,
    revenue: paidRows.reduce((sum, row) => sum + row.priceMinor, 0),
    takeRate: base > 0 ? paidRows.length / base : null,
    simulated: paidRows.filter((row) => row.simulated).length,
  };
}

export function formatRate(rate: number | null) {
  return rate === null ? '—' : `${Math.round(rate * 1000) / 10}%`;
}
