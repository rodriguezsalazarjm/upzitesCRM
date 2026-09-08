import { z } from 'zod';

/**
 * Esquema de condiciones y acciones de una regla.
 *
 * Se valida con Zod al guardar Y al ejecutar: una regla guardada por una version
 * anterior del producto no debe romper el motor, solo quedar marcada como
 * invalida.
 */

/** Operadores soportados. Deliberadamente pocos: la spec pide reglas predefinidas. */
export const conditionOperators = [
  'eq',
  'neq',
  'in',
  'not_in',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'is_empty',
  'is_not_empty',
] as const;

export const conditionSchema = z.object({
  /** Ruta dentro del contexto del evento, por ejemplo `contact.temperature`. */
  field: z.string().min(1),
  operator: z.enum(conditionOperators),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]).optional(),
});

export type Condition = z.infer<typeof conditionSchema>;

/**
 * Grupo de condiciones. `ALL` es AND, `ANY` es OR. Se permite un nivel de
 * anidamiento, suficiente para "(A y B) o C" sin convertirse en un constructor
 * visual, que la spec deja fuera de la beta.
 */
export type ConditionGroup = {
  match: 'ALL' | 'ANY';
  rules: (Condition | ConditionGroup)[];
};

/** Lo que se acepta al guardar: `match` y `rules` pueden omitirse. */
type ConditionGroupInput = {
  match?: 'ALL' | 'ANY';
  rules?: (Condition | ConditionGroupInput)[];
};

export const conditionGroupSchema: z.ZodType<ConditionGroup, z.ZodTypeDef, ConditionGroupInput> = z.lazy(() =>
  z.object({
    match: z.enum(['ALL', 'ANY']).default('ALL'),
    rules: z.array(z.union([conditionSchema, conditionGroupSchema])).default([]),
  }),
);

export function isGroup(node: Condition | ConditionGroup): node is ConditionGroup {
  return 'rules' in node;
}

// --- Acciones ----------------------------------------------------------------

export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('CREATE_TASK'),
    title: z.string().min(1),
    description: z.string().optional(),
    dueInHours: z.number().int().min(0).max(24 * 90).default(24),
  }),
  z.object({
    type: z.literal('SEND_MESSAGE'),
    text: z.string().min(1).max(4096),
    /** Si es true, no se envia cuando falta consentimiento de WhatsApp. */
    requireConsent: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('SCHEDULE_ACTION'),
    actionType: z.enum(['FOLLOW_UP', 'CHECKOUT_RECOVERY', 'QUOTE_REMINDER', 'REPURCHASE_REMINDER', 'CUSTOM']),
    delayHours: z.number().min(0).max(24 * 365),
    cancelKey: z.string().optional(),
    payload: z.record(z.unknown()).optional(),
    /** Respeta la ventana de silencio del workspace. */
    respectQuietHours: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('CANCEL_ACTIONS'),
    cancelKey: z.string().optional(),
    reason: z.string().default('cancelado por automatizacion'),
  }),
  z.object({ type: z.literal('ADD_TAG'), tag: z.string().min(1) }),
  z.object({ type: z.literal('REMOVE_TAG'), tag: z.string().min(1) }),
  z.object({
    type: z.literal('MOVE_OPPORTUNITY'),
    stageKey: z.enum(['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST']),
  }),
  z.object({
    type: z.literal('SET_LIFECYCLE'),
    status: z.enum(['LEAD', 'QUALIFIED', 'LOST']),
  }),
  z.object({ type: z.literal('ASSIGN_CONVERSATION'), userId: z.string().min(1) }),
  z.object({ type: z.literal('RECALCULATE_SCORE') }),
  z.object({
    type: z.literal('CREATE_INSIGHT'),
    title: z.string().min(1),
    description: z.string().min(1),
    score: z.number().int().min(0).max(100).optional(),
  }),
  z.object({ type: z.literal('RUN_AGENT'), agentKey: z.string().min(1) }),
]);

export type AutomationActionConfig = z.infer<typeof actionSchema>;

export const actionsSchema = z.array(actionSchema).min(1).max(10);

/**
 * `SET_LIFECYCLE` no incluye CUSTOMER ni REPEAT_CUSTOMER a proposito: la spec
 * exige que a cliente solo se llegue por pago aprobado o confirmacion humana.
 * Una automatizacion no puede saltarse esa regla.
 */
export function parseActions(raw: unknown) {
  const parsed = actionsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseConditions(raw: unknown) {
  if (raw === null || raw === undefined) return { match: 'ALL', rules: [] } as ConditionGroup;
  const parsed = conditionGroupSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
