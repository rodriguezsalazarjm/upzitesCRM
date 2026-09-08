import { AutomationTrigger } from '../../../generated/prisma/client';
import type { AutomationActionConfig, ConditionGroup } from './schema';

/**
 * Catalogo de reglas predefinidas.
 *
 * La spec deja fuera de la beta el constructor visual: el cliente activa reglas
 * de este catalogo y ajusta parametros. Son **deliberadamente genericas**: la
 * beta es multivertical, asi que ninguna asume un rubro. Los textos hablan de
 * "tu consulta" y no de un producto concreto.
 */
export type AutomationPreset = {
  key: string;
  name: string;
  description: string;
  trigger: AutomationTrigger;
  conditions: ConditionGroup;
  actions: AutomationActionConfig[];
  dedupeMinutes: number;
  /** Se activa sola al crear el workspace. */
  enabledByDefault: boolean;
};

export const AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    key: 'nuevo-lead-tarea',
    name: 'Tarea al llegar un lead nuevo',
    description: 'Crea una tarea de contacto para que nadie quede sin respuesta.',
    trigger: AutomationTrigger.LEAD_CREATED,
    conditions: { match: 'ALL', rules: [] },
    actions: [
      {
        type: 'CREATE_TASK',
        title: 'Contactar lead nuevo',
        description: 'Responder dentro de las proximas horas.',
        dueInHours: 2,
      },
      { type: 'RECALCULATE_SCORE' },
    ],
    dedupeMinutes: 0,
    enabledByDefault: true,
  },
  {
    key: 'seguimiento-2h',
    name: 'Seguimiento a las 2 horas sin respuesta',
    description: 'Programa un primer recordatorio breve si el lead no responde.',
    trigger: AutomationTrigger.LEAD_CREATED,
    conditions: { match: 'ALL', rules: [] },
    actions: [
      {
        type: 'SCHEDULE_ACTION',
        actionType: 'FOLLOW_UP',
        delayHours: 2,
        respectQuietHours: true,
      },
    ],
    dedupeMinutes: 0,
    enabledByDefault: true,
  },
  {
    key: 'lead-caliente-etiqueta',
    name: 'Etiquetar leads calientes',
    description: 'Marca al contacto cuando su score supera 70 para priorizarlo.',
    trigger: AutomationTrigger.MESSAGE_RECEIVED,
    conditions: {
      match: 'ALL',
      rules: [{ field: 'contact.leadScore', operator: 'gte', value: 70 }],
    },
    actions: [{ type: 'ADD_TAG', tag: 'prioritario' }],
    dedupeMinutes: 60 * 24,
    enabledByDefault: false,
  },
  {
    key: 'silencio-3-dias',
    name: 'Enfriar leads con 3 dias de silencio',
    description: 'Baja la prioridad y deja constancia cuando un lead deja de responder.',
    trigger: AutomationTrigger.NO_ACTIVITY,
    conditions: {
      match: 'ALL',
      rules: [
        { field: 'contact.hoursSinceLastActivity', operator: 'gte', value: 72 },
        { field: 'contact.lifecycleStatus', operator: 'in', value: ['LEAD', 'QUALIFIED'] },
      ],
    },
    actions: [
      { type: 'ADD_TAG', tag: 'frio' },
      { type: 'RECALCULATE_SCORE' },
      {
        type: 'CREATE_INSIGHT',
        title: 'Lead sin actividad hace 3 dias',
        description: 'Ultimo intento del ciclo antes de darlo por frio.',
        score: 40,
      },
    ],
    dedupeMinutes: 60 * 24 * 3,
    enabledByDefault: false,
  },
  {
    key: 'pago-limpia-seguimientos',
    name: 'Al confirmarse un pago, cerrar seguimientos',
    description: 'Cancela recordatorios pendientes y agradece la compra.',
    trigger: AutomationTrigger.PAYMENT_CONFIRMED,
    conditions: { match: 'ALL', rules: [] },
    actions: [
      { type: 'CANCEL_ACTIONS', reason: 'el pago fue confirmado' },
      { type: 'ADD_TAG', tag: 'cliente' },
      { type: 'REMOVE_TAG', tag: 'frio' },
    ],
    dedupeMinutes: 0,
    enabledByDefault: true,
  },
  {
    key: 'opt-out-limpieza',
    name: 'Al revocarse el consentimiento, detener todo',
    description: 'Cancela acciones pendientes y etiqueta al contacto como suprimido.',
    trigger: AutomationTrigger.CONSENT_REVOKED,
    conditions: { match: 'ALL', rules: [] },
    actions: [
      { type: 'CANCEL_ACTIONS', reason: 'el contacto revoco el consentimiento' },
      { type: 'ADD_TAG', tag: 'no-contactar' },
    ],
    dedupeMinutes: 0,
    enabledByDefault: true,
  },
  {
    key: 'mensaje-fallido-aviso',
    name: 'Avisar cuando un mensaje no se entrega',
    description: 'Deja un insight para revisar entregas fallidas de WhatsApp.',
    trigger: AutomationTrigger.MESSAGE_FAILED,
    conditions: { match: 'ALL', rules: [] },
    actions: [
      {
        type: 'CREATE_INSIGHT',
        title: 'Mensaje de WhatsApp no entregado',
        description: 'Revisar el numero, la ventana de 24 horas o el estado del canal.',
      },
    ],
    dedupeMinutes: 60,
    enabledByDefault: false,
  },
];

export function presetByKey(key: string) {
  return AUTOMATION_PRESETS.find((preset) => preset.key === key) ?? null;
}
