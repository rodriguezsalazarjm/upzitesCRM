import { z } from 'zod';

/**
 * El grafo de una automatizacion (Flow Builder). Vive como Json validado con
 * Zod en AutomationFlowVersion.{trigger,nodes,edges} — mismo criterio que
 * AutomationRule.conditions/actions: el grafo es datos, no columnas.
 *
 * Convencion de ejecucion: `nodes[0]` es SIEMPRE el punto de entrada (el nodo
 * sin aristas entrantes). Desde ahi, el motor sigue la arista saliente de
 * `from === nodeId` que coincide con la rama activa (CONDITION/RANDOM_SPLIT
 * tienen mas de una arista saliente, distinguidas por `branch`).
 */

export const flowTriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('MESSAGE_RECEIVED'), keywords: z.array(z.string()).optional() }),
  z.object({ type: z.literal('COMMENT'), postId: z.string().optional(), keywords: z.array(z.string()).optional() }),
  z.object({ type: z.literal('STORY_REPLY') }),
  z.object({ type: z.literal('STORY_MENTION') }),
  z.object({ type: z.literal('FOLLOW') }),
  z.object({ type: z.literal('SHARE') }),
  z.object({ type: z.literal('LIVE_COMMENT'), keywords: z.array(z.string()).optional() }),
  z.object({ type: z.literal('AD_CONVERSATION_STARTED') }),
  z.object({ type: z.literal('REF_LINK'), ref: z.string().optional() }),
  z.object({ type: z.literal('QR_SCAN') }),
  z.object({ type: z.literal('NEW_CONTACT') }),
  z.object({ type: z.literal('TAG_ADDED'), tag: z.string() }),
  z.object({ type: z.literal('CUSTOM_FIELD_CHANGED'), field: z.string() }),
  z.object({ type: z.literal('DATE_TIME') }),
  z.object({ type: z.literal('CHECKOUT_CREATED') }),
  z.object({ type: z.literal('PAYMENT_APPROVED') }),
  z.object({ type: z.literal('OPPORTUNITY_STAGE_CHANGED'), stage: z.string().optional() }),
  // Arranque manual (pruebas, "Probar" en el editor, o Start Automation desde otro flow).
  z.object({ type: z.literal('MANUAL') }),
]);
export type FlowTrigger = z.infer<typeof flowTriggerSchema>;
/** El tipo de evento normalizado que un ChannelEvent puede disparar. */
export const CHANNEL_EVENT_TRIGGER_TYPES = [
  'MESSAGE_RECEIVED',
  'COMMENT',
  'STORY_REPLY',
  'STORY_MENTION',
  'LIVE_COMMENT',
  'FOLLOW',
  'SHARE',
  'AD_CONVERSATION_STARTED',
  'REF_LINK',
  'QR_SCAN',
] as const;

const conditionField = z.enum([
  'TAG',
  'CUSTOM_FIELD',
  'CHANNEL',
  'PIPELINE_STAGE',
  'LEAD_STATUS',
  'PRODUCT_PURCHASED',
]);
const conditionOperator = z.enum(['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'EXISTS', 'NOT_EXISTS']);

const automationAction = z.enum([
  'ADD_TAG',
  'REMOVE_TAG',
  'SET_CUSTOM_FIELD',
  'ASSIGN_OPERATOR',
  'UPDATE_OPPORTUNITY_STAGE',
  'CREATE_TASK',
  'CREATE_CHECKOUT',
  'REQUEST_HUMAN_HANDOFF',
]);

export const flowNodeSchema = z.discriminatedUnion('type', [
  z.object({ id: z.string().min(1), type: z.literal('MESSAGE'), text: z.string().min(1) }),
  z.object({
    id: z.string().min(1),
    type: z.literal('CONDITION'),
    field: conditionField,
    operator: conditionOperator,
    value: z.string().optional(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('ACTION'),
    action: automationAction,
    params: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('DELAY'),
    minutes: z.number().int().positive().optional(),
    untilISO: z.string().optional(),
    respectQuietHours: z.boolean().default(true),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('AI'),
    goal: z.string().min(1),
    allowedTools: z.array(z.string()).default([]),
    exitConditions: z.array(z.string()).default([]),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('RANDOM_SPLIT'),
    branches: z.array(z.object({ id: z.string().min(1), weight: z.number().positive() })).min(2),
  }),
  z.object({ id: z.string().min(1), type: z.literal('START_AUTOMATION'), flowKey: z.string().min(1) }),
  z.object({ id: z.string().min(1), type: z.literal('HUMAN_HANDOFF') }),
  z.object({ id: z.string().min(1), type: z.literal('END') }),
]);
export type FlowNode = z.infer<typeof flowNodeSchema>;
export type FlowNodeType = FlowNode['type'];

export const flowEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  /** 'true'|'false' para CONDITION; el id de rama para RANDOM_SPLIT. */
  branch: z.string().optional(),
});
export type FlowEdge = z.infer<typeof flowEdgeSchema>;

export const flowGraphSchema = z.object({
  trigger: flowTriggerSchema,
  nodes: z.array(flowNodeSchema).min(1),
  edges: z.array(flowEdgeSchema),
});
export type FlowGraph = z.infer<typeof flowGraphSchema>;

export type FlowValidation = { valid: true } | { valid: false; reason: string };

/**
 * Validacion estructural minima: referencias validas, un solo punto de
 * entrada. No intenta detectar TODO grafo invalido (p.ej. un ciclo, que el
 * motor ya tolera via el limite de pasos) — solo lo que rompería la ejecución
 * de entrada.
 */
export function validateFlowGraph(graph: FlowGraph): FlowValidation {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  if (nodeIds.size !== graph.nodes.length) {
    return { valid: false, reason: 'Hay ids de nodo repetidos.' };
  }
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from)) return { valid: false, reason: `La arista ${edge.id} sale de un nodo inexistente.` };
    if (!nodeIds.has(edge.to)) return { valid: false, reason: `La arista ${edge.id} entra a un nodo inexistente.` };
  }
  const hasIncoming = new Set(graph.edges.map((edge) => edge.to));
  const entryCandidates = graph.nodes.filter((node) => !hasIncoming.has(node.id));
  if (entryCandidates.length === 0) {
    return { valid: false, reason: 'El flujo no tiene un punto de entrada (todos los nodos tienen entrada).' };
  }
  if (graph.nodes[0] && hasIncoming.has(graph.nodes[0].id)) {
    return { valid: false, reason: 'El primer nodo debe ser el punto de entrada (sin aristas entrantes).' };
  }
  return { valid: true };
}
