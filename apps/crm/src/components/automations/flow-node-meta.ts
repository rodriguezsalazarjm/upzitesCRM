import {
  Bot,
  Clock,
  Flag,
  GitBranch,
  MessageSquare,
  PlayCircle,
  Shuffle,
  UserRound,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { flowNodeSchema, type FlowNode, type FlowNodeType } from '@/lib/automations/schema';

/**
 * Vocabulario visual del Flow Builder: nada de esto participa en persistencia,
 * ejecución ni validación — son solo etiquetas/iconos/tonos para presentar los
 * mismos datos del grafo (`FlowNode`/`FlowNodeType`) del sistema real.
 */

export const NODE_LABEL: Record<FlowNodeType, string> = {
  MESSAGE: 'Enviar mensaje',
  CONDITION: 'Condición',
  DELAY: 'Espera',
  AI: 'Paso IA',
  RANDOM_SPLIT: 'División aleatoria',
  ACTION: 'Acción CRM',
  START_AUTOMATION: 'Iniciar automatización',
  HUMAN_HANDOFF: 'Derivar a persona',
  END: 'Fin',
};

export const ACTION_LABEL: Record<string, string> = {
  ADD_TAG: 'Agregar etiqueta',
  REMOVE_TAG: 'Quitar etiqueta',
  SET_CUSTOM_FIELD: 'Campo personalizado',
  ASSIGN_OPERATOR: 'Asignar operador',
  UPDATE_OPPORTUNITY_STAGE: 'Etapa de oportunidad',
  CREATE_CHECKOUT: 'Crear checkout',
};

// El color es una señal puntual (icono/borde), nunca el fondo del nodo entero.
// Electric = acción, Lime = IA, Solar = espera, Ink = estructura/sistema.
export type NodeTone = 'electric' | 'lime' | 'solar' | 'ink';
export const TONE_CLASS: Record<NodeTone, string> = {
  electric: 'bg-electric/10 text-electric',
  lime: 'bg-lime/35 text-success-ink',
  solar: 'bg-solar/30 text-warning-ink',
  ink: 'bg-ink/10 text-ink',
};

export const NODE_META: Record<FlowNodeType, { icon: LucideIcon; tone: NodeTone; category: string }> = {
  MESSAGE: { icon: MessageSquare, tone: 'electric', category: 'Mensajería' },
  CONDITION: { icon: GitBranch, tone: 'ink', category: 'Lógica' },
  ACTION: { icon: Zap, tone: 'electric', category: 'CRM' },
  DELAY: { icon: Clock, tone: 'solar', category: 'Tiempo' },
  AI: { icon: Bot, tone: 'lime', category: 'IA' },
  RANDOM_SPLIT: { icon: Shuffle, tone: 'ink', category: 'Lógica' },
  START_AUTOMATION: { icon: PlayCircle, tone: 'ink', category: 'Sistema' },
  HUMAN_HANDOFF: { icon: UserRound, tone: 'ink', category: 'Sistema' },
  END: { icon: Flag, tone: 'ink', category: 'Sistema' },
};

// El grupo solo es texto de categoría en la paleta; no participa en la lógica
// de creación/drag del nodo (ver `append`/`onDrop` en flow-builder.tsx, que
// usan el índice de este array, no su contenido).
export const NODE_PALETTE: [string, FlowNode][] = [
  ['Mensajería', { id: '', type: 'MESSAGE', text: 'Escribe tu mensaje' }],
  ['Lógica', { id: '', type: 'CONDITION', field: 'TAG', operator: 'EXISTS', value: '' }],
  ['Tiempo', { id: '', type: 'DELAY', minutes: 60, respectQuietHours: true }],
  ['Lógica', { id: '', type: 'RANDOM_SPLIT', branches: [{ id: 'a', weight: 50 }, { id: 'b', weight: 50 }] }],
  ['IA', { id: '', type: 'AI', goal: 'Ayudar al cliente', allowedTools: [], exitConditions: [], maxTurns: 6 }],
  ...(['ADD_TAG', 'REMOVE_TAG', 'SET_CUSTOM_FIELD', 'ASSIGN_OPERATOR', 'UPDATE_OPPORTUNITY_STAGE', 'CREATE_CHECKOUT'] as const).map(
    (action) => [action === 'CREATE_CHECKOUT' ? 'Ventas' : 'CRM', { id: '', type: 'ACTION', action, params: {} }] as [string, FlowNode],
  ),
  ['Sistema', { id: '', type: 'START_AUTOMATION', flowKey: '' }],
  ['Sistema', { id: '', type: 'HUMAN_HANDOFF' }],
  ['Sistema', { id: '', type: 'END' }],
];

export function nodeTitle(step: FlowNode) {
  return step.type === 'ACTION' ? (ACTION_LABEL[step.action] ?? step.action) : NODE_LABEL[step.type];
}

export function nodeSubtitle(step: FlowNode) {
  return step.type === 'MESSAGE'
    ? step.text
    : step.type === 'AI'
      ? step.goal
      : step.type === 'DELAY'
        ? `${step.minutes ?? 0} min`
        : step.id;
}

/**
 * "Incompleto" (Solar) es puramente estructural: reusa el mismo Zod schema del
 * grafo (`flowNodeSchema`, la fuente de verdad) para ver si al nodo le falta un
 * campo requerido — sin duplicar ninguna regla de negocio propia. "Error"
 * (Tomato) es otra cosa: viene de una corrida real de Validar/Publish contra
 * el servidor (ver `errorsForNode`), no de este chequeo estructural.
 */
export function isNodeIncomplete(step: FlowNode): boolean {
  return !flowNodeSchema.safeParse(step).success;
}

/** Los mensajes de error del servidor mencionan el id del nodo (prefijo o en medio de la frase). */
export function errorsForNode(errors: string[], nodeId: string): string[] {
  return errors.filter((e) => e.includes(nodeId));
}
