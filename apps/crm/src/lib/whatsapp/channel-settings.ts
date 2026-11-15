import { z } from 'zod';

/**
 * Punto 8 — configuracion por numero y estado visible. Modulo puro: lo usan la
 * API (validacion) y la pantalla (formulario y etiquetas) por igual.
 */

function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const minute = z.number().int().min(0).max(1439);
const optionalId = z.string().min(1).max(64).nullable();

export const channelSettingsSchema = z
  .object({
    label: z.string().trim().max(60).nullable(),
    usage: z.enum(['SALES', 'SUPPORT', 'GENERAL']),
    defaultAgentId: optionalId,
    defaultProductId: optionalId,
    defaultFlowId: optionalId,
    aiEnabled: z.boolean(),
    aiSchedule: z.enum(['ALWAYS', 'IN_HOURS', 'OUT_OF_HOURS']),
    attentionTimezone: z.string().min(1).max(64).refine(isTimeZone, 'Zona horaria desconocida.'),
    attentionStartMinute: minute,
    attentionEndMinute: minute,
    attentionDays: z
      .array(z.number().int().min(0).max(6))
      .max(7)
      .refine((days) => new Set(days).size === days.length, 'Días repetidos.'),
    noProductBehavior: z.enum(['AI_GENERAL', 'HUMAN']),
    fallbackUserId: optionalId,
  })
  .strict()
  .partial()
  .superRefine((value, ctx) => {
    if (value.aiSchedule && value.aiSchedule !== 'ALWAYS' && value.attentionDays && value.attentionDays.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['attentionDays'], message: 'Elige al menos un día de atención.' });
    }
  });

export type ChannelSettingsInput = z.infer<typeof channelSettingsSchema>;

export const USAGE_LABEL = { SALES: 'Ventas', SUPPORT: 'Soporte', GENERAL: 'General' } as const;
export const AI_SCHEDULE_LABEL = {
  ALWAYS: 'Siempre',
  IN_HOURS: 'Solo en horario de atención',
  OUT_OF_HOURS: 'Solo fuera del horario de atención',
} as const;
export const NO_PRODUCT_LABEL = {
  AI_GENERAL: 'La IA atiende con el conocimiento general del negocio',
  HUMAN: 'Pasa a una persona',
} as const;

// --- Estado visible -----------------------------------------------------------

export type ChannelDisplayStatus = 'CONNECTED' | 'PENDING' | 'DISCONNECTED' | 'ERROR' | 'PERMISSION';
export type WebhookDisplayStatus = 'RECEIVING' | 'SUBSCRIBED' | 'NOT_SUBSCRIBED';

export const CHANNEL_STATUS_LABEL: Record<ChannelDisplayStatus, { label: string; tone: 'success' | 'warning' | 'outline' | 'danger' }> = {
  CONNECTED: { label: 'Conectado', tone: 'success' },
  PENDING: { label: 'Configuración pendiente', tone: 'warning' },
  DISCONNECTED: { label: 'Desconectado', tone: 'outline' },
  ERROR: { label: 'Error', tone: 'danger' },
  PERMISSION: { label: 'Permisos insuficientes', tone: 'danger' },
};

export const WEBHOOK_STATUS_LABEL: Record<WebhookDisplayStatus, string> = {
  RECEIVING: 'Recibiendo eventos de Meta',
  SUBSCRIBED: 'Suscrito, sin eventos recibidos todavía',
  NOT_SUBSCRIBED: 'Sin suscripción confirmada',
};

/** Eventos de webhook mas viejos que esto ya no prueban que el canal reciba hoy. */
export const WEBHOOK_FRESH_MS = 7 * 24 * 60 * 60 * 1000;

type StatusFacts = {
  status: 'PENDING' | 'CONNECTED' | 'DISCONNECTED' | 'NEEDS_ATTENTION';
  lastHealthCheckAt: Date | null;
  lastErrorCode: string | null;
  hasToken: boolean;
};

/**
 * Estado que ve el cliente. Tener credenciales guardadas NO es estar conectado:
 * "Conectado" exige que Meta haya confirmado el numero (lastHealthCheckAt) y
 * que siga habiendo un token con que operar.
 */
export function channelDisplayStatus(facts: StatusFacts): ChannelDisplayStatus {
  if (facts.status === 'DISCONNECTED') return 'DISCONNECTED';
  if (facts.lastErrorCode === 'PERMISSION_DENIED' && facts.status !== 'CONNECTED') return 'PERMISSION';
  if (facts.status === 'NEEDS_ATTENTION') return 'ERROR';
  if (facts.status === 'PENDING' || !facts.lastHealthCheckAt || !facts.hasToken) return 'PENDING';
  return 'CONNECTED';
}

export function webhookDisplayStatus(
  facts: { webhookSubscribedAt: Date | null; lastWebhookAt: Date | null },
  now = new Date(),
): WebhookDisplayStatus {
  if (facts.lastWebhookAt && now.getTime() - facts.lastWebhookAt.getTime() < WEBHOOK_FRESH_MS) return 'RECEIVING';
  if (facts.webhookSubscribedAt) return 'SUBSCRIBED';
  return 'NOT_SUBSCRIBED';
}

export function minuteToTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function timeToMinute(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]);
  return total >= 0 && total < 1440 ? total : null;
}
