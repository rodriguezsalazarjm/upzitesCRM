import { z } from 'zod';
import { CURRENCY_EXPONENT } from '../../billing/money';
import { exponentOf, formatMinor, majorText } from '../money';

export { exponentOf, formatMinor };

/**
 * Product Sales Studio — reglas puras (sin base de datos ni red).
 *
 * Las comparten el editor (cliente) y el servicio (servidor): el cliente las
 * usa para avisar antes de enviar, pero la autoridad es SIEMPRE el servidor,
 * que vuelve a validar todo con el mismo schema.
 *
 * Dinero: enteros en unidades menores ISO 4217 (la convencion de
 * lib/billing/money): CLP exponente 0 (19990 = $19.990), USD exponente 2
 * (1999 = US$19,99). `ProductVariant.priceMinor` guarda ese entero en la moneda
 * del producto. Formato y precio con moneda: lib/commerce/money.
 */

export const PRODUCT_TYPES = ['DIGITAL', 'PHYSICAL', 'SERVICE'] as const;
export type StudioProductType = (typeof PRODUCT_TYPES)[number];

export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type StudioProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Monedas que el Studio ofrece: las que tienen exponente conocido. */
export const STUDIO_CURRENCIES = ['CLP', 'USD'] as const satisfies readonly (keyof typeof CURRENCY_EXPONENT)[];
export type StudioCurrency = (typeof STUDIO_CURRENCIES)[number];

/** Tope por precio (unidades menores). main + bump sigue cabiendo en un int4. */
export const MAX_PRICE_MINOR = 999_999_999;
export const MAX_VARIANTS = 50;
export const NAME_MAX = 120;
export const DESCRIPTION_MAX = 5000;
export const VARIANT_NAME_MAX = 80;
export const SKU_MAX = 64;

export const TYPE_LABEL: Record<StudioProductType, string> = {
  DIGITAL: 'Digital',
  PHYSICAL: 'Físico',
  SERVICE: 'Servicio',
};

export const STATUS_LABEL: Record<StudioProductStatus, string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Publicado',
  ARCHIVED: 'Archivado',
};

export const CURRENCY_LABEL: Record<StudioCurrency, string> = {
  CLP: 'Peso chileno (CLP)',
  USD: 'Dólar estadounidense (USD)',
};

// --- Dinero -----------------------------------------------------------------

/**
 * Texto escrito por una persona → unidades menores, o null si no es un monto.
 * CLP: "19.990", "19990" → 19990 (sin decimales). USD: "19.99", "19,99",
 * "1.234,50", "1,234.50" → centavos. Nunca usa floats para el resultado.
 */
export function parseMoneyInput(raw: string, currency: string): number | null {
  const text = raw.replace(/[\s$]/g, '').replace(/^(CLP|USD|US)/i, '');
  if (!text || !/^[0-9.,]+$/.test(text)) return null;
  const exponent = exponentOf(currency);

  let integer = text;
  let fraction = '';
  const lastSep = Math.max(text.lastIndexOf('.'), text.lastIndexOf(','));
  if (exponent > 0 && lastSep >= 0) {
    const tail = text.slice(lastSep + 1);
    const hasBoth = text.includes('.') && text.includes(',');
    // Con un solo tipo de separador, solo es decimal si le siguen 1-2 digitos.
    if (hasBoth || (tail.length >= 1 && tail.length <= exponent)) {
      integer = text.slice(0, lastSep);
      fraction = tail;
    }
  }
  if (fraction && !/^\d+$/.test(fraction)) return null;
  // Separadores de miles: grupos de 3 digitos.
  if (/[.,]/.test(integer) && !/^\d{1,3}([.,]\d{3})+$/.test(integer)) return null;
  const digits = integer.replace(/[.,]/g, '');
  if (!/^\d+$/.test(digits) || fraction.length > exponent) return null;
  const minor = Number(digits) * 10 ** exponent + Number((fraction + '0'.repeat(exponent)).slice(0, exponent) || 0);
  return Number.isSafeInteger(minor) && minor <= MAX_PRICE_MINOR ? minor : null;
}

/** Unidades menores → texto editable ("19990" / "19.99"). */
export function minorToInput(amountMinor: number, currency: string) {
  return majorText(amountMinor, currency);
}

// --- SKU --------------------------------------------------------------------

/**
 * SKU opcional, unico por WORKSPACE (identifica una unidad vendible dentro del
 * catalogo de un negocio; dos negocios distintos pueden repetirlo). Se
 * normaliza a mayusculas, sin espacios: "cam s" → "CAM-S".
 */
export function normalizeSku(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim().toUpperCase().replace(/\s+/g, '-');
  return value ? value : null;
}

export function skuProblem(sku: string | null) {
  if (sku === null) return null;
  if (sku.length > SKU_MAX) return `El SKU admite hasta ${SKU_MAX} caracteres.`;
  if (!/^[A-Z0-9][A-Z0-9._/-]*$/.test(sku)) return 'El SKU solo admite letras, números, guiones, puntos y barras.';
  return null;
}

// --- Payload del editor ------------------------------------------------------

const idSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Identificador inválido.');
const priceSchema = z
  .number({ invalid_type_error: 'Ingresa un precio válido.' })
  .int('Ingresa un precio válido.')
  .min(0, 'El precio no puede ser negativo.')
  .max(MAX_PRICE_MINOR, 'El precio es demasiado alto.');
const skuSchema = z
  .string()
  .max(SKU_MAX * 2)
  .nullable()
  .optional()
  .transform((value) => normalizeSku(value));

export const variantInputSchema = z
  .object({
    id: idSchema.optional(),
    name: z.string().trim().min(1, 'Cada variante necesita un nombre.').max(VARIANT_NAME_MAX, `El nombre de la variante admite hasta ${VARIANT_NAME_MAX} caracteres.`),
    sku: skuSchema,
    price: priceSchema,
    isActive: z.boolean(),
  })
  .strict();

/**
 * Lo unico que el editor puede enviar. `.strict()`: cualquier otra clave
 * (status, workspaceId, metadata, connectionId...) rechaza el request entero.
 */
export const productInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Escribe el nombre del producto.').max(NAME_MAX, `El nombre admite hasta ${NAME_MAX} caracteres.`),
    description: z.string().max(DESCRIPTION_MAX, `La descripción admite hasta ${DESCRIPTION_MAX} caracteres.`).optional().default('').transform((value) => value.trim()),
    type: z.enum(PRODUCT_TYPES, { errorMap: () => ({ message: 'Elige un tipo de producto.' }) }),
    currency: z.enum(STUDIO_CURRENCIES, { errorMap: () => ({ message: 'Elige una moneda disponible.' }) }),
    basePrice: priceSchema,
    sku: skuSchema,
    variants: z.array(variantInputSchema).max(MAX_VARIANTS, `Máximo ${MAX_VARIANTS} variantes.`).default([]),
    orderBump: z
      .object({ enabled: z.boolean(), variantId: idSchema.nullable().optional() })
      .strict()
      .default({ enabled: false }),
  })
  .strict()
  .superRefine((value, ctx) => {
    const skuIssue = skuProblem(value.sku);
    if (skuIssue) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sku'], message: skuIssue });

    const names = new Set<string>();
    const skus = new Map<string, string>();
    if (value.sku) skus.set(value.sku, 'sku');
    const ids = new Set<string>();
    value.variants.forEach((variant, index) => {
      const key = variant.name.toLocaleLowerCase('es');
      if (names.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['variants', index, 'name'], message: `Hay dos variantes llamadas "${variant.name}".` });
      names.add(key);
      if (variant.id) {
        if (ids.has(variant.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['variants', index, 'id'], message: 'Variante repetida.' });
        ids.add(variant.id);
      }
      const variantSkuIssue = skuProblem(variant.sku);
      if (variantSkuIssue) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['variants', index, 'sku'], message: variantSkuIssue });
      if (variant.sku) {
        if (skus.has(variant.sku)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['variants', index, 'sku'], message: `El SKU ${variant.sku} está repetido.` });
        skus.set(variant.sku, `variants.${index}`);
      }
    });

    if (value.orderBump.enabled && !value.orderBump.variantId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['orderBump', 'variantId'], message: 'Elige el producto adicional que se ofrecerá en el checkout.' });
    }
  });

export type ProductInput = z.infer<typeof productInputSchema>;
export type ProductInputRaw = z.input<typeof productInputSchema>;

export const statusActionSchema = z.object({ action: z.enum(['publish', 'unpublish', 'archive', 'restore']) }).strict();
export type StatusAction = z.infer<typeof statusActionSchema>['action'];

// --- Variantes vendibles -------------------------------------------------------

export type VariantLike = { id: string; isDefault: boolean; isActive: boolean; price: number };

/**
 * Que se puede comprar. Un producto sin variantes vende su variante por
 * defecto; con variantes, el comprador elige una de las ACTIVAS y la variante
 * por defecto queda inactiva (no es una opcion).
 */
export function sellableVariants<V extends VariantLike>(variants: V[]) {
  const active = variants.filter((variant) => variant.isActive && variant.price > 0);
  const options = active.filter((variant) => !variant.isDefault);
  return options.length > 0 ? { needsChoice: true, variants: options } : { needsChoice: false, variants: active.filter((variant) => variant.isDefault).slice(0, 1) };
}

export type ChoiceResult<V> = { ok: true; variant: V } | { ok: false; reason: 'UNAVAILABLE' | 'CHOOSE_VARIANT' | 'INVALID_VARIANT' };

/** Variante elegida por el comprador, validada contra las vendibles del PRODUCTO. */
export function chooseVariant<V extends VariantLike>(variants: V[], requestedId: string | null | undefined): ChoiceResult<V> {
  const sellable = sellableVariants(variants);
  if (sellable.variants.length === 0) return { ok: false, reason: 'UNAVAILABLE' };
  if (!sellable.needsChoice) {
    // Sin variantes: un id distinto del de la unica vendible es manipulacion.
    if (requestedId && requestedId !== sellable.variants[0].id) return { ok: false, reason: 'INVALID_VARIANT' };
    return { ok: true, variant: sellable.variants[0] };
  }
  if (!requestedId) return { ok: false, reason: 'CHOOSE_VARIANT' };
  const variant = sellable.variants.find((candidate) => candidate.id === requestedId);
  return variant ? { ok: true, variant } : { ok: false, reason: 'INVALID_VARIANT' };
}

/** Precio "desde": el menor de lo vendible (o el base si aun no hay nada vendible). */
export function priceFrom(variants: VariantLike[]) {
  const sellable = sellableVariants(variants).variants;
  const pool = sellable.length ? sellable : variants.filter((variant) => variant.isDefault);
  return pool.length ? Math.min(...pool.map((variant) => variant.price)) : null;
}

// --- Publicacion --------------------------------------------------------------

export type ReadinessInput = {
  name: string;
  currency: string;
  variants: VariantLike[];
  /** Problema del producto adicional configurado, si lo hay (ver bumpProblem). */
  bumpIssue?: BumpIssue | null;
};

/** Lo que impide publicar (o mantener publicado) un producto. Vacio = listo. */
export function publishBlockers(input: ReadinessInput) {
  const blockers: string[] = [];
  if (!input.name.trim()) blockers.push('Falta el nombre del producto.');
  if (!(STUDIO_CURRENCIES as readonly string[]).includes(input.currency)) blockers.push('La moneda del producto no está disponible.');
  // Con variantes activas se venden ellas; sin ninguna, la variante por defecto
  // (que queda inactiva mientras el producto tenga variantes).
  const activeOptions = input.variants.filter((variant) => !variant.isDefault && variant.isActive);
  if (activeOptions.length > 0) {
    if (activeOptions.some((variant) => variant.price <= 0)) blockers.push('Cada variante activa necesita un precio mayor que cero.');
  } else {
    const base = input.variants.find((variant) => variant.isDefault);
    if (!base || !base.isActive) blockers.push('Activa al menos una variante para poder vender.');
    else if (base.price <= 0) blockers.push('Define un precio mayor que cero.');
  }
  return blockers;
}

// --- Order bump ------------------------------------------------------------------

export type BumpCandidate = {
  productId: string;
  workspaceId: string;
  status: StudioProductStatus;
  currency: string;
  variantActive: boolean;
  price: number;
};

export type BumpIssue = 'SELF' | 'OTHER_WORKSPACE' | 'ARCHIVED' | 'NOT_PUBLISHED' | 'CURRENCY' | 'INACTIVE' | 'NO_PRICE' | 'MISSING';

export const BUMP_ISSUE_TEXT: Record<BumpIssue, string> = {
  SELF: 'Un producto no puede ofrecerse a sí mismo como adicional.',
  OTHER_WORKSPACE: 'El producto adicional no está disponible.',
  ARCHIVED: 'El producto adicional está archivado.',
  NOT_PUBLISHED: 'El producto adicional aún no está publicado: no se mostrará en el checkout hasta que lo publiques.',
  CURRENCY: 'El producto adicional usa otra moneda: debe cobrarse en la misma moneda que este producto.',
  INACTIVE: 'La opción elegida del producto adicional está desactivada.',
  NO_PRICE: 'El producto adicional no tiene precio.',
  MISSING: 'El producto adicional ya no existe.',
};

/**
 * Por que un producto adicional no sirve (o null si sirve). `strict` = para
 * GUARDAR la relacion; sin strict = salud de una relacion ya guardada.
 * NOT_PUBLISHED no bloquea el guardado (se puede preparar el borrador del
 * adicional), pero el checkout no lo muestra hasta que este publicado: el
 * motor del Punto 1 exige ACTIVE.
 */
export function bumpProblem(input: {
  mainProductId: string | null;
  workspaceId: string;
  currency: string;
  candidate: BumpCandidate | null;
}): BumpIssue | null {
  const { candidate } = input;
  if (!candidate) return 'MISSING';
  if (candidate.workspaceId !== input.workspaceId) return 'OTHER_WORKSPACE';
  if (input.mainProductId && candidate.productId === input.mainProductId) return 'SELF';
  if (candidate.status === 'ARCHIVED') return 'ARCHIVED';
  if (candidate.currency !== input.currency) return 'CURRENCY';
  if (!candidate.variantActive) return 'INACTIVE';
  if (candidate.price <= 0) return 'NO_PRICE';
  if (candidate.status !== 'ACTIVE') return 'NOT_PUBLISHED';
  return null;
}

/** Problemas que impiden GUARDAR la relacion (los demas solo se avisan). */
export function isBlockingBumpIssue(issue: BumpIssue | null) {
  return issue !== null && issue !== 'NOT_PUBLISHED';
}

/** Nombre de una linea/opcion: "Producto" o "Producto — Variante" (igual que createOrder). */
export function offerLabel(productName: string, variant: { isDefault: boolean; name: string }) {
  return variant.isDefault ? productName : `${productName} — ${variant.name}`;
}

/** Copia del nombre al duplicar, dentro del maximo. */
export function copyName(name: string) {
  const suffix = ' (copia)';
  return `${name.slice(0, NAME_MAX - suffix.length)}${suffix}`;
}
