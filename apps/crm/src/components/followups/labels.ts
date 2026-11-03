/** Etiquetas de estado compartidas por las vistas de seguimiento (Punto 7). */

export type BadgeTone = 'success' | 'warning' | 'outline' | 'danger' | 'info' | 'neutral' | 'ai';

export const STRATEGY_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: 'Borrador', tone: 'outline' },
  PUBLISHED: { label: 'Activa', tone: 'success' },
  PAUSED: { label: 'Pausada', tone: 'warning' },
  ARCHIVED: { label: 'Desactivada', tone: 'neutral' },
};

export const ENROLLMENT_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'En curso', tone: 'info' },
  COMPLETED: { label: 'Terminó', tone: 'neutral' },
  EXITED: { label: 'Detenido', tone: 'success' },
  CANCELED: { label: 'Cancelado', tone: 'warning' },
};

export const RUN_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  SENDING: { label: 'Enviando', tone: 'info' },
  SENT: { label: 'Enviado', tone: 'success' },
  SIMULATED: { label: 'Simulado', tone: 'ai' },
  DONE: { label: 'Hecho', tone: 'neutral' },
  SKIPPED: { label: 'Omitido', tone: 'outline' },
  BLOCKED: { label: 'Bloqueado', tone: 'warning' },
  FAILED: { label: 'Falló', tone: 'danger' },
};

const dateTime = new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' });

export function formatWhen(value: Date | string | null | undefined) {
  if (!value) return '—';
  return dateTime.format(typeof value === 'string' ? new Date(value) : value);
}
