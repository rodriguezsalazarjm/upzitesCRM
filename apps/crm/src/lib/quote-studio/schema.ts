import { z } from 'zod';

/**
 * P37: contratos de Quote Studio. Todo lo que define el aspecto viene de un
 * catálogo cerrado (tipografías, estilos, tamaños): no hay CSS libre.
 */

export const FONTS = { helvetica: 'Helvetica (sans)', times: 'Times (serif)', courier: 'Courier (mono)' } as const;
export type FontFamily = keyof typeof FONTS;
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido (usa #RRGGBB).');

export const brandSchema = z.object({
  companyName: z.string().trim().max(120).default(''),
  taxId: z.string().trim().max(40).default(''),
  address: z.string().trim().max(200).default(''),
  email: z.string().trim().max(120).default(''),
  phone: z.string().trim().max(40).default(''),
  website: z.string().trim().max(120).default(''),
  primary: hex.default('#1f2a44'),
  accent: hex.default('#1f4bff'),
  headingFont: z.enum(['helvetica', 'times', 'courier']).default('helvetica'),
  bodyFont: z.enum(['helvetica', 'times', 'courier']).default('helvetica'),
  textSize: z.enum(['sm', 'md', 'lg']).default('md'),
  spacing: z.enum(['compact', 'normal', 'airy']).default('normal'),
  borders: z.enum(['none', 'thin', 'thick']).default('thin'),
  tableStyle: z.enum(['lines', 'striped', 'boxed']).default('striped'),
  headerStyle: z.enum(['band', 'line', 'minimal']).default('band'),
  footerStyle: z.enum(['line', 'none']).default('line'),
  logoHeight: z.number().int().min(24).max(96).default(48),
});
export type Brand = z.infer<typeof brandSchema>;
export const parseBrand = (value: unknown): Brand => brandSchema.parse(value && typeof value === 'object' ? value : {});

export const BLOCKS = {
  logo: 'Logo / identidad',
  header: 'Encabezado',
  company: 'Datos de la empresa',
  customer: 'Datos del cliente',
  number: 'Número de cotización',
  date: 'Fecha',
  due_date: 'Fecha de vencimiento',
  owner: 'Ejecutivo responsable',
  title: 'Título',
  intro: 'Introducción',
  items: 'Tabla de productos/servicios',
  subtotal: 'Subtotal',
  discount: 'Descuento',
  taxes: 'Impuestos',
  charges: 'Costos adicionales',
  total: 'Total',
  payment: 'Forma de pago',
  conditions: 'Condiciones comerciales',
  validity: 'Validez de la oferta',
  delivery: 'Plazos de entrega',
  notes: 'Notas',
  terms: 'Términos',
  signature: 'Firma',
  contact_cta: 'CTA / datos de contacto',
  footer: 'Footer',
} as const;
export type BlockType = keyof typeof BLOCKS;
/** Bloques cuyo texto se escribe (en la plantilla por defecto, y se ajusta en cada cotización). */
export const TEXT_BLOCKS = ['intro', 'payment', 'conditions', 'delivery', 'notes', 'terms', 'contact_cta', 'footer'] as const;
export type TextBlock = (typeof TEXT_BLOCKS)[number];

export const blockSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(Object.keys(BLOCKS) as [BlockType, ...BlockType[]]),
  visible: z.boolean().default(true),
  label: z.string().trim().max(60).default(''),
  text: z.string().max(2000).default(''),
  align: z.enum(['left', 'center', 'right']).default('left'),
});
export type Block = z.infer<typeof blockSchema>;
export const blocksSchema = z.array(blockSchema).min(1).max(40);

export const templateInputSchema = z.object({
  name: z.string().trim().min(1, 'Ponle un nombre.').max(80),
  blocks: blocksSchema,
});

const money = z.number().int().min(0).max(1_000_000_000_000);
const bp = z.number().int().min(0).max(10_000);

export const lineSchema = z.object({
  id: z.string().min(1).max(40),
  catalogItemId: z.string().max(40).nullish(),
  name: z.string().trim().min(1, 'Cada línea necesita un nombre.').max(160),
  description: z.string().max(1000).default(''),
  quantity: z.number().positive('La cantidad debe ser mayor que 0.').max(1_000_000).refine((q) => Math.round(q * 1000) === q * 1000, 'Máximo 3 decimales en la cantidad.'),
  unit: z.string().trim().max(20).default('unidad'),
  unitPriceMinor: money,
  discountBp: bp.default(0),
  taxRateBp: bp.nullable().default(null),
});
export const chargeSchema = z.object({ id: z.string().min(1).max(40), label: z.string().trim().min(1).max(80), amountMinor: money, taxable: z.boolean().default(true) });

export const customerSchema = z.object({
  name: z.string().trim().max(120).default(''),
  company: z.string().trim().max(120).default(''),
  email: z.string().trim().max(160).default(''),
  phone: z.string().trim().max(40).default(''),
  taxId: z.string().trim().max(40).default(''),
  address: z.string().trim().max(200).default(''),
});
export type Customer = z.infer<typeof customerSchema>;

export const contentSchema = z.object(Object.fromEntries(TEXT_BLOCKS.map((k) => [k, z.string().max(4000).default('')])) as Record<TextBlock, z.ZodDefault<z.ZodString>>);
export type QuoteContent = z.infer<typeof contentSchema>;

export const CURRENCIES = ['CLP', 'USD'] as const;

export const quoteInputSchema = z.object({
  templateId: z.string().max(40).nullish(),
  title: z.string().trim().max(160).default(''),
  currency: z.enum(CURRENCIES),
  pricesIncludeTax: z.boolean(),
  customer: customerSchema,
  contactId: z.string().max(40).nullish(),
  opportunityId: z.string().max(40).nullish(),
  ownerId: z.string().max(40).nullish(),
  content: contentSchema,
  lines: z.array(lineSchema).max(200),
  globalDiscountBp: bp.default(0),
  charges: z.array(chargeSchema).max(20).default([]),
  validUntil: z.string().datetime({ offset: true }).nullish(),
});
export type QuoteInput = z.input<typeof quoteInputSchema>;

export const settingsInputSchema = z.object({
  brand: brandSchema,
  numberPrefix: z.string().trim().regex(/^[A-Za-z0-9]{1,8}$/, 'Prefijo: letras o números, hasta 8.'),
  includeYear: z.boolean(),
  yearlyReset: z.boolean(),
  numberPadding: z.number().int().min(3).max(6),
  currency: z.enum(CURRENCIES),
  taxRateBp: bp,
  pricesIncludeTax: z.boolean(),
  validityDays: z.number().int().min(1).max(365),
});

export const catalogItemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().max(1000).default(''),
  unit: z.string().trim().max(20).default('unidad'),
  unitPriceMinor: money,
  taxRateBp: bp.nullable().default(null),
  category: z.string().trim().max(60).nullish(),
});

/** Plantilla inicial: todos los bloques útiles en un orden profesional. */
export function defaultBlocks(): Block[] {
  const make = (type: BlockType, extra: Partial<Block> = {}): Block => ({ id: type, type, visible: true, label: '', text: '', align: 'left', ...extra });
  return [
    make('header'), make('logo'), make('company'), make('customer'), make('number'), make('date'), make('due_date'), make('owner'),
    make('title'), make('intro', { text: 'Gracias por tu interés. Esta es nuestra propuesta.' }), make('items'),
    make('subtotal'), make('discount'), make('taxes'), make('charges'), make('total'),
    make('payment', { text: 'Transferencia bancaria: 50 % al aceptar y 50 % contra entrega.' }), make('conditions'), make('validity'), make('delivery'),
    make('notes'), make('terms'), make('signature'), make('contact_cta'), make('footer'),
  ];
}

/** COT-2026-0042 (prefijo, año opcional, correlativo con ceros). */
export function formatQuoteNumber(s: { numberPrefix: string; includeYear: boolean; numberPadding: number }, year: number, n: number) {
  return [s.numberPrefix, s.includeYear ? String(year) : null, String(n).padStart(s.numberPadding, "0")].filter(Boolean).join("-");
}
