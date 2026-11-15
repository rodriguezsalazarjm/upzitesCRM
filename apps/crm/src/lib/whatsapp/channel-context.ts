import { minutesOfDayIn, wallTimeIn } from '../marketing/quiet-hours';

/**
 * Punto 8 — resolucion basica de contexto por numero.
 *
 * Parte pura: recibe lo que ya se leyo de la base (con el workspace verificado)
 * y decide producto, agente, automatizacion y si la IA puede atender. Sin base
 * de datos, para probarla con relojes controlados.
 *
 * Prioridad del producto: el que la conversacion ya tenia (una atribucion
 * anterior manda) y, si no hay, el predeterminado del numero. Anuncios,
 * campañas y CTWA son los Puntos 9 y 10: aqui no se adivinan.
 */

export type AttentionHours = {
  timezone: string;
  startMinute: number;
  endMinute: number;
  /** 0 = domingo. Vacia = todos los dias. */
  days: number[];
};

export type ChannelContextInput = {
  aiEnabled: boolean;
  aiSchedule: 'ALWAYS' | 'IN_HOURS' | 'OUT_OF_HOURS';
  hours: AttentionHours;
  noProductBehavior: 'AI_GENERAL' | 'HUMAN';
  /** null = el numero no fijo agente (se usa el agente de ventas del workspace). */
  defaultAgent: { id: string; usable: boolean } | null;
  defaultProduct: { id: string; usable: boolean } | null;
  defaultFlow: { id: string; usable: boolean } | null;
  conversationProductId: string | null;
  /** Punto 9: agente/automatizacion de la regla de campaña de la conversacion. */
  routeAgent?: { id: string; usable: boolean } | null;
  routeFlow?: { id: string; usable: boolean } | null;
};

export type ChannelContext = {
  productId: string | null;
  productSource: 'CONVERSATION' | 'CHANNEL_DEFAULT' | 'NONE';
  /** Agente a usar; null con `aiAllowed` = el agente de ventas por defecto. */
  agentId: string | null;
  aiAllowed: boolean;
  flowId: string | null;
  /** Motivo por el que la conversacion queda para una persona. */
  humanReason: string | null;
  /** Configuracion del numero que no se pudo usar (se registra, no se inventa). */
  warnings: string[];
};

export const HUMAN_REASON = {
  AI_DISABLED: 'la IA está desactivada en este número',
  OUT_OF_SCHEDULE: 'fuera del horario en que atiende la IA',
  AGENT_UNAVAILABLE: 'el agente predeterminado del número no está disponible',
  NO_PRODUCT: 'la conversación no tiene producto y el número pide atención humana en ese caso',
} as const;

/** Dentro del horario de atencion. Una ventana con inicio > fin cruza la medianoche. */
export function isWithinAttentionHours(now: Date, hours: AttentionHours) {
  const minute = minutesOfDayIn(now, hours.timezone);
  const wall = wallTimeIn(now, hours.timezone);
  const weekday = new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay();
  if (hours.days.length > 0 && hours.days.length < 7) {
    // Una ventana nocturna (22:00-06:00) que empezo ayer sigue siendo de ayer.
    const overnight = hours.startMinute > hours.endMinute;
    const dayOfWindow = overnight && minute < hours.endMinute ? (weekday + 6) % 7 : weekday;
    if (!hours.days.includes(dayOfWindow)) return false;
  }
  if (hours.startMinute === hours.endMinute) return true;
  return hours.startMinute < hours.endMinute
    ? minute >= hours.startMinute && minute < hours.endMinute
    : minute >= hours.startMinute || minute < hours.endMinute;
}

export function resolveChannelContext(input: ChannelContextInput, now: Date): ChannelContext {
  const warnings: string[] = [];

  let productId: string | null = null;
  let productSource: ChannelContext['productSource'] = 'NONE';
  if (input.conversationProductId) {
    productId = input.conversationProductId;
    productSource = 'CONVERSATION';
  } else if (input.defaultProduct?.usable) {
    productId = input.defaultProduct.id;
    productSource = 'CHANNEL_DEFAULT';
  } else if (input.defaultProduct) {
    warnings.push('el producto predeterminado no está activo');
  }

  let flowId: string | null = null;
  if (input.routeFlow && !input.routeFlow.usable) warnings.push('la automatización de la campaña no está publicada para WhatsApp; se usa la del número');
  if (input.routeFlow?.usable) flowId = input.routeFlow.id;
  else if (input.defaultFlow?.usable) flowId = input.defaultFlow.id;
  else if (input.defaultFlow) warnings.push('la automatización predeterminada no está publicada para WhatsApp');

  let humanReason: string | null = null;
  if (!input.aiEnabled) {
    humanReason = HUMAN_REASON.AI_DISABLED;
  } else if (input.aiSchedule !== 'ALWAYS') {
    const within = isWithinAttentionHours(now, input.hours);
    if ((input.aiSchedule === 'IN_HOURS') !== within) humanReason = HUMAN_REASON.OUT_OF_SCHEDULE;
  }
  // Punto 9: un agente de campaña invalido cae al del numero (fallback del plan), con aviso.
  const routeAgentId = input.routeAgent?.usable ? input.routeAgent.id : null;
  if (input.routeAgent && !routeAgentId) warnings.push('el agente de la campaña no está disponible; se usa el del número');
  if (!humanReason && !routeAgentId && input.defaultAgent && !input.defaultAgent.usable) {
    humanReason = HUMAN_REASON.AGENT_UNAVAILABLE;
    warnings.push('el agente predeterminado está inactivo, sin versión publicada o limitado por el plan');
  }
  if (!humanReason && !productId && input.noProductBehavior === 'HUMAN') {
    humanReason = HUMAN_REASON.NO_PRODUCT;
  }

  return {
    productId,
    productSource,
    agentId: routeAgentId ?? (input.defaultAgent?.usable ? input.defaultAgent.id : null),
    aiAllowed: humanReason === null,
    flowId,
    humanReason,
    warnings,
  };
}
