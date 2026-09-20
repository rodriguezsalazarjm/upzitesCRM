import type { StatusTone } from '@/components/ui/status-badge';

/** Etiquetas y tonos de la bandeja. Un solo lugar para lista, cabecera y panel de contexto. */

export const MODE_LABEL: Record<string, string> = {
  AI_ACTIVE: 'IA respondiendo',
  HUMAN_ACTIVE: 'Atención humana',
  WAITING: 'Esperando cliente',
  PAUSED: 'Pausada',
  CLOSED: 'Cerrada',
};

/** Versión corta para filas densas de la lista. */
export const MODE_SHORT: Record<string, string> = {
  AI_ACTIVE: 'IA',
  HUMAN_ACTIVE: 'Humano',
  WAITING: 'Esperando',
  PAUSED: 'Pausada',
  CLOSED: 'Cerrada',
};

/** Lime (tono `ai`) solo marca IA/automatización, nunca un fondo. */
export const MODE_TONE: Record<string, StatusTone> = {
  AI_ACTIVE: 'ai',
  HUMAN_ACTIVE: 'info',
  WAITING: 'warning',
  PAUSED: 'neutral',
  CLOSED: 'draft',
};

export const LIFECYCLE_LABEL: Record<string, string> = {
  LEAD: 'Lead',
  QUALIFIED: 'Calificado',
  CUSTOMER: 'Cliente',
  REPEAT_CUSTOMER: 'Cliente recurrente',
  LOST: 'Perdido',
};

export const LIFECYCLE_TONE: Record<string, StatusTone> = {
  LEAD: 'info',
  QUALIFIED: 'ink',
  CUSTOMER: 'success',
  REPEAT_CUSTOMER: 'success',
  LOST: 'danger',
};

export const INTENT_LABEL: Record<string, string> = {
  UNKNOWN: 'Sin definir',
  INTERESTED: 'Interesado',
  QUOTE_REQUESTED: 'Pidió cotización',
  CHECKOUT_STARTED: 'Inició checkout',
  NO_INTENT: 'Sin interés',
};

export const TEMPERATURE_LABEL: Record<string, string> = {
  HOT: 'Caliente',
  WARM: 'Tibio',
  COLD: 'Frío',
};

/** Estado del canal cuando NO es CONNECTED; CONNECTED no muestra nada. */
export const CHANNEL_ISSUE_LABEL: Record<string, string> = {
  PENDING: 'Canal pendiente',
  DISCONNECTED: 'Canal desconectado',
  NEEDS_ATTENTION: 'Canal requiere atención',
  REAUTH_REQUIRED: 'Canal requiere reconexión',
};

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}
