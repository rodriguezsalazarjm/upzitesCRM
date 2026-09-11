import { prisma } from '../prisma';
import { recordAudit } from '../domain/audit';

/**
 * Interruptores de funciones.
 *
 * Es el freno de mano que la spec pide como criterio de salida de la beta:
 * "existe forma rapida de apagar IA o campanas sin detener el CRM". Apagar
 * `AI_AGENTS` deja el inbox, los contactos y los pedidos intactos; lo unico que
 * cambia es que el agente deja de responder y las conversaciones esperan a una
 * persona.
 *
 * Dos reglas que definen el comportamiento:
 *
 *  1. **Por defecto todo esta encendido.** Un interruptor que no existe no
 *     apaga nada. Si la consulta falla, tambien se responde encendido: un fallo
 *     al leer la tabla de flags no puede dejar el producto muerto.
 *  2. **El global gana.** Apagar algo globalmente no lo puede reencender un
 *     workspace. Es un corte de emergencia del operador, no una preferencia.
 */

export const FEATURES = [
  'AI_AGENTS',
  'JOURNEYS',
  'CAMPAIGNS',
  'EMAIL_SENDING',
  'WHATSAPP_OUTBOUND',
  'SHOPIFY_SYNC',
  'PAYMENTS',
  'WEBHOOKS_INBOUND',
] as const;

export type FeatureKey = (typeof FEATURES)[number];

export const FEATURE_LABEL: Record<FeatureKey, string> = {
  AI_AGENTS: 'Agentes IA',
  JOURNEYS: 'Journeys de recuperacion',
  CAMPAIGNS: 'Campanas',
  EMAIL_SENDING: 'Envio de email',
  WHATSAPP_OUTBOUND: 'Envio por WhatsApp',
  SHOPIFY_SYNC: 'Sincronizacion de Shopify',
  PAYMENTS: 'Cobros',
  WEBHOOKS_INBOUND: 'Recepcion de webhooks',
};

export const FEATURE_EFFECT: Record<FeatureKey, string> = {
  AI_AGENTS: 'El agente deja de responder. Las conversaciones quedan esperando a una persona.',
  JOURNEYS: 'Las secuencias dejan de avanzar. Las inscripciones se conservan.',
  CAMPAIGNS: 'Las campanas dejan de enviar. Los destinatarios pendientes se conservan.',
  EMAIL_SENDING: 'No sale ningun email, ni promocional ni operativo.',
  WHATSAPP_OUTBOUND: 'No sale ningun mensaje. Los entrantes se siguen recibiendo.',
  SHOPIFY_SYNC: 'El catalogo deja de actualizarse. Lo ya sincronizado sigue disponible.',
  PAYMENTS: 'No se pueden crear checkouts nuevos. Los pagos en curso se siguen procesando.',
  WEBHOOKS_INBOUND: 'Los webhooks se aceptan pero no se procesan. Nada se pierde: quedan en cola.',
};

export const GLOBAL_SCOPE = 'GLOBAL';

export function isFeatureKey(value: string): value is FeatureKey {
  return (FEATURES as readonly string[]).includes(value);
}

/**
 * Si una funcion esta activa para un workspace.
 *
 * El orden de precedencia es: global apagado > workspace apagado > encendido.
 */
export async function isEnabled(key: FeatureKey, workspaceId?: string | null): Promise<boolean> {
  try {
    const scopes = workspaceId ? [GLOBAL_SCOPE, workspaceId] : [GLOBAL_SCOPE];

    const flags = await prisma.featureFlag.findMany({
      where: { key, scope: { in: scopes } },
      select: { enabled: true },
    });

    // Cualquier interruptor apagado que aplique gana.
    return !flags.some((flag) => !flag.enabled);
  } catch (error) {
    // Un fallo leyendo la tabla de interruptores no puede apagar el producto.
    console.error('feature_flag_read_failed', { key, workspaceId, error });
    return true;
  }
}

export type FlagState = {
  key: FeatureKey;
  label: string;
  effect: string;
  enabled: boolean;
  /** Donde se apago: global, este workspace, o ninguno. */
  disabledBy: 'GLOBAL' | 'WORKSPACE' | null;
  note: string | null;
};

/** Estado de todos los interruptores para un workspace. */
export async function flagStates(workspaceId: string): Promise<FlagState[]> {
  const flags = await prisma.featureFlag.findMany({
    where: { scope: { in: [GLOBAL_SCOPE, workspaceId] } },
  });

  const byScope = new Map(flags.map((flag) => [`${flag.scope}:${flag.key}`, flag]));

  return FEATURES.map((key) => {
    const global = byScope.get(`${GLOBAL_SCOPE}:${key}`);
    const local = byScope.get(`${workspaceId}:${key}`);

    const disabledBy = global && !global.enabled ? 'GLOBAL' : local && !local.enabled ? 'WORKSPACE' : null;

    return {
      key,
      label: FEATURE_LABEL[key],
      effect: FEATURE_EFFECT[key],
      enabled: disabledBy === null,
      disabledBy,
      note: (disabledBy === 'GLOBAL' ? global?.note : local?.note) ?? null,
    };
  });
}

export type SetFlagInput = {
  key: FeatureKey;
  enabled: boolean;
  workspaceId?: string | null;
  note?: string | null;
  actorId?: string | null;
};

/**
 * Enciende o apaga una funcion.
 *
 * Sin `workspaceId` el cambio es global. Siempre queda auditado: apagar la IA
 * de un cliente es una decision operativa que alguien tiene que poder explicar
 * despues.
 */
export async function setFlag(input: SetFlagInput) {
  const scope = input.workspaceId ?? GLOBAL_SCOPE;

  const flag = await prisma.featureFlag.upsert({
    where: { scope_key: { scope, key: input.key } },
    create: {
      scope,
      workspaceId: input.workspaceId ?? null,
      key: input.key,
      enabled: input.enabled,
      note: input.note ?? null,
      updatedById: input.actorId ?? null,
    },
    update: {
      enabled: input.enabled,
      note: input.note ?? null,
      updatedById: input.actorId ?? null,
    },
  });

  if (input.workspaceId) {
    await recordAudit({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: input.enabled ? 'feature.enabled' : 'feature.disabled',
      entity: 'FeatureFlag',
      entityId: flag.id,
      metadata: { key: input.key, note: input.note ?? null },
    });
  } else {
    // Un corte global no pertenece a ningun workspace: se registra en el log
    // del servidor, que es donde mira quien opera la plataforma.
    console.warn('feature_flag_global', {
      key: input.key,
      enabled: input.enabled,
      note: input.note,
      actorId: input.actorId,
    });
  }

  return flag;
}
