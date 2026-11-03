import { canWith } from './resolve';
import type { EntitlementValues, FeatureKey } from './config';

/**
 * Que funciones del plan necesita una automatizacion para ejecutarse. Puro:
 * lo usan la validacion al PUBLICAR, la reconciliacion y el runtime.
 *
 * Lo interno (mover etapa, etiquetas, campos, tareas, asignar, condiciones,
 * esperas, sub-flujos, derivar a humano) no requiere nada: es lo que FREE
 * puede automatizar (D2). Lo que sale del CRM o gasta dinero si:
 *  - mensajes por canal (WhatsApp/Instagram/Messenger) → `channels.messaging`
 *  - IA / agentes → `ai` + `agents`
 *  - cobro (checkout) → `commerce.checkout`
 *  - email promocional → `email.promotional`
 */

export type Requirement = { feature: FeatureKey; where: string };

type FlowNodeLike = { id: string; type: string; action?: string };

export function flowRequirements(graph: { nodes: FlowNodeLike[] }): Requirement[] {
  const out: Requirement[] = [];
  for (const node of graph.nodes) {
    if (node.type === 'MESSAGE') out.push({ feature: 'channels.messaging', where: node.id });
    if (node.type === 'AI') {
      out.push({ feature: 'ai', where: node.id }, { feature: 'agents', where: node.id });
    }
    if (node.type === 'ACTION' && node.action === 'CREATE_CHECKOUT') {
      out.push({ feature: 'commerce.checkout', where: node.id });
    }
  }
  return out;
}

type RuleActionLike = { type: string; actionType?: string };

export function ruleRequirements(actions: RuleActionLike[]): Requirement[] {
  const out: Requirement[] = [];
  actions.forEach((action, index) => {
    const where = `accion ${index + 1}`;
    if (action.type === 'SEND_MESSAGE') out.push({ feature: 'channels.messaging', where });
    if (action.type === 'RUN_AGENT') out.push({ feature: 'ai', where }, { feature: 'agents', where });
    if (action.type === 'SCHEDULE_ACTION' && action.actionType === 'CHECKOUT_RECOVERY') out.push({ feature: 'recovery', where });
    if (action.type === 'SCHEDULE_ACTION' && action.actionType === 'QUOTE_REMINDER') out.push({ feature: 'quotes', where });
  });
  return out;
}

export function journeyRequirements(journey: { trigger: string; steps: { action: string; label?: string | null; messageMode?: string | null }[] }): Requirement[] {
  const out: Requirement[] = [{ feature: 'campaigns.journeys', where: 'journey' }];
  if (journey.trigger === 'CHECKOUT_ABANDONED') out.push({ feature: 'recovery', where: 'trigger' });
  if (journey.trigger === 'QUOTE_PENDING') out.push({ feature: 'quotes', where: 'trigger' });
  if (journey.trigger === 'ORDER_PAID') out.push({ feature: 'commerce.orders', where: 'trigger' });
  for (const step of journey.steps) {
    const where = step.label ?? step.action;
    if (step.action === 'SEND_WHATSAPP' || step.action === 'SEND_INSTAGRAM') out.push({ feature: 'channels.messaging', where });
    if (step.messageMode === 'AI') out.push({ feature: 'ai', where });
    if (step.action === 'SEND_EMAIL') out.push({ feature: 'email.promotional', where });
  }
  return out;
}

/** Requisitos que el plan NO cubre, sin repetir funcion. */
export function missingFeatures(values: EntitlementValues, requirements: Requirement[]): Requirement[] {
  const seen = new Set<FeatureKey>();
  return requirements.filter((req) => {
    if (seen.has(req.feature) || canWith(values, req.feature)) return false;
    seen.add(req.feature);
    return true;
  });
}

/** Parseo tolerante de las acciones guardadas de una regla (Json). */
export function ruleActionsOf(rule: { actions: unknown; action?: string | null }): RuleActionLike[] {
  if (Array.isArray(rule.actions)) {
    return rule.actions.filter((a): a is RuleActionLike => typeof a === 'object' && a !== null && typeof (a as { type?: unknown }).type === 'string');
  }
  // Reglas anteriores a la Fase 3: accion unica legacy.
  return rule.action ? [{ type: rule.action }] : [];
}
