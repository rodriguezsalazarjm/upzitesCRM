import { z } from 'zod';
import { conditionGroupSchema } from '../automation/schema';

/**
 * Lenguaje de reglas de precio.
 *
 * Es **datos, no codigo**: cada workspace describe su servicio en JSON y el
 * motor lo evalua. Asi un rubro nuevo no necesita un despliegue, y ningun rubro
 * queda hardcodeado en el producto.
 *
 * Las condiciones reutilizan el evaluador de la Fase 3: un operador nuevo sirve
 * para automatizaciones y para precios a la vez.
 */

/** Campo que hay que pedirle al cliente antes de poder calcular. */
export const intakeFieldSchema = z.object({
  key: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, 'La clave debe ser snake_case'),
  label: z.string().min(1),
  type: z.enum(['number', 'text', 'select', 'boolean']),
  /** Un campo requerido que falta BLOQUEA el calculo. */
  required: z.boolean().default(true),
  unit: z.string().optional(),
  options: z.array(z.string()).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  help: z.string().optional(),
});

export type IntakeField = z.infer<typeof intakeFieldSchema>;

export const intakeSchemaSchema = z.object({
  fields: z.array(intakeFieldSchema).min(1).max(30),
});

export type IntakeSchema = z.infer<typeof intakeSchemaSchema>;

// --- Componentes de calculo --------------------------------------------------

const baseComponent = {
  key: z.string().min(1),
  label: z.string().min(1),
  /** Si se define, el componente solo aplica cuando la condicion se cumple. */
  when: conditionGroupSchema.optional(),
};

export const componentSchema = z.discriminatedUnion('type', [
  /** Monto fijo. */
  z.object({ ...baseComponent, type: z.literal('FIXED'), amountClp: z.number().int() }),

  /** Precio por unidad de un campo numerico. */
  z.object({
    ...baseComponent,
    type: z.literal('PER_UNIT'),
    unitPriceClp: z.number().int(),
    quantityFrom: z.string().min(1),
  }),

  /** Precio por area: dos campos numericos multiplicados. */
  z.object({
    ...baseComponent,
    type: z.literal('PER_AREA'),
    unitPriceClp: z.number().int(),
    widthFrom: z.string().min(1),
    heightFrom: z.string().min(1),
  }),

  /**
   * Precio por tramos sobre un campo numerico. El tramo se elige por el valor,
   * y el primero que calza manda: el orden importa y es responsabilidad de quien
   * configura.
   */
  z.object({
    ...baseComponent,
    type: z.literal('TIERED'),
    quantityFrom: z.string().min(1),
    tiers: z
      .array(
        z.object({
          upTo: z.number().nullable(),
          unitPriceClp: z.number().int(),
        }),
      )
      .min(1),
  }),

  /** Recargo: monto fijo o porcentaje del subtotal acumulado. */
  z.object({
    ...baseComponent,
    type: z.literal('SURCHARGE'),
    amountClp: z.number().int().optional(),
    percent: z.number().optional(),
  }),

  /** Descuento. Se guarda como monto negativo en el desglose. */
  z.object({
    ...baseComponent,
    type: z.literal('DISCOUNT'),
    amountClp: z.number().int().optional(),
    percent: z.number().optional(),
  }),
]);

export type PricingComponent = z.infer<typeof componentSchema>;

export const rulesSchema = z.object({
  components: z.array(componentSchema).min(1).max(40),
  /** Piso del total. Un trabajo chico igual tiene un costo minimo. */
  minimumClp: z.number().int().min(0).optional(),
  /** Redondeo del total final, en pesos. 1000 redondea al millar mas cercano. */
  roundToClp: z.number().int().min(0).optional(),
});

export type PricingRules = z.infer<typeof rulesSchema>;

export function parseIntakeSchema(raw: unknown) {
  const parsed = intakeSchemaSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseRules(raw: unknown) {
  const parsed = rulesSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Valida los datos del cliente contra el schema del servicio.
 *
 * Devuelve los campos que faltan por separado: el agente necesita saber QUE
 * preguntar, no solo que fallo.
 */
export type IntakeValidation =
  | { ok: true; values: Record<string, string | number | boolean> }
  | { ok: false; missing: string[]; invalid: { field: string; reason: string }[] };

export function validateIntake(schema: IntakeSchema, raw: Record<string, unknown>): IntakeValidation {
  const values: Record<string, string | number | boolean> = {};
  const missing: string[] = [];
  const invalid: { field: string; reason: string }[] = [];

  for (const field of schema.fields) {
    const value = raw[field.key];
    const empty = value === undefined || value === null || value === '';

    if (empty) {
      if (field.required) missing.push(field.key);
      continue;
    }

    switch (field.type) {
      case 'number': {
        const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
        if (!Number.isFinite(parsed)) {
          invalid.push({ field: field.key, reason: 'debe ser un numero' });
          break;
        }
        if (field.min !== undefined && parsed < field.min) {
          invalid.push({ field: field.key, reason: `minimo ${field.min}` });
          break;
        }
        if (field.max !== undefined && parsed > field.max) {
          invalid.push({ field: field.key, reason: `maximo ${field.max}` });
          break;
        }
        values[field.key] = parsed;
        break;
      }

      case 'boolean': {
        if (typeof value === 'boolean') {
          values[field.key] = value;
        } else {
          const text = String(value).toLowerCase();
          values[field.key] = text === 'true' || text === 'si' || text === 'sí' || text === '1';
        }
        break;
      }

      case 'select': {
        const text = String(value);
        if (field.options && !field.options.includes(text)) {
          invalid.push({ field: field.key, reason: `debe ser uno de: ${field.options.join(', ')}` });
          break;
        }
        values[field.key] = text;
        break;
      }

      default:
        values[field.key] = String(value);
    }
  }

  if (missing.length > 0 || invalid.length > 0) return { ok: false, missing, invalid };
  return { ok: true, values };
}
