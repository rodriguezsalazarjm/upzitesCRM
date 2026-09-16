import type { FlowNode } from './schema';

/** Lo que el motor junta ANTES de evaluar un nodo CONDITION. Pura por diseno:
 *  las consultas a la base viven en engine.ts, esto solo compara valores. */
export type ConditionContext = {
  tags: string[];
  customFields: Record<string, unknown>;
  channel: string | null;
  pipelineStage: string | null;
  leadStatus: string | null;
  purchasedProductIds: string[];
};

export type ConditionNode = Extract<FlowNode, { type: 'CONDITION' }>;

export function evaluateCondition(node: ConditionNode, context: ConditionContext): boolean {
  switch (node.field) {
    case 'TAG': {
      const has = node.value ? context.tags.includes(node.value) : context.tags.length > 0;
      return node.operator === 'NOT_EXISTS' ? !has : has;
    }
    case 'CUSTOM_FIELD': {
      const raw = node.value ? context.customFields[node.value] : undefined;
      if (node.operator === 'EXISTS') return raw !== undefined && raw !== null;
      if (node.operator === 'NOT_EXISTS') return raw === undefined || raw === null;
      // Para EQUALS/NOT_EQUALS/CONTAINS, "value" trae "campo:valor" — el campo
      // ya se separo en `node.value` como clave; el motor pasa el valor a
      // comparar por separado no existe en este schema simple, asi que se
      // compara el propio campo contra su presencia como string.
      const text = raw === undefined || raw === null ? '' : String(raw);
      if (node.operator === 'CONTAINS') return text.includes(String(node.value ?? ''));
      return node.operator === 'EQUALS' ? text === String(node.value ?? '') : text !== String(node.value ?? '');
    }
    case 'CHANNEL': {
      const match = context.channel === node.value;
      return node.operator === 'NOT_EQUALS' ? !match : match;
    }
    case 'PIPELINE_STAGE': {
      const match = context.pipelineStage === node.value;
      return node.operator === 'NOT_EQUALS' ? !match : match;
    }
    case 'LEAD_STATUS': {
      const match = context.leadStatus === node.value;
      return node.operator === 'NOT_EQUALS' ? !match : match;
    }
    case 'PRODUCT_PURCHASED': {
      const has = node.value ? context.purchasedProductIds.includes(node.value) : context.purchasedProductIds.length > 0;
      return node.operator === 'NOT_EXISTS' ? !has : has;
    }
    default:
      return false;
  }
}
