import { JobType } from '../../../generated/prisma/client';
import { enqueue } from '../jobs/queue';

/** Ventana de agrupamiento de mensajes entrantes (spec, seccion 15: 2-4 s). */
const DEBOUNCE_MS = 3_000;

/**
 * Programa una ejecucion del agente con debounce.
 *
 * Vive aparte del runner para que quien dispara —el webhook, el motor de
 * automatizaciones— no importe toda la maquinaria del agente y se arme un ciclo
 * de imports.
 */
export async function scheduleAgentRun(input: {
  workspaceId: string;
  conversationId: string;
  trigger?: string;
  delayMs?: number;
}) {
  return enqueue({
    type: JobType.RUN_AGENT,
    workspaceId: input.workspaceId,
    payload: { conversationId: input.conversationId, trigger: input.trigger ?? null },
    // Una sola ejecucion pendiente por conversacion; los mensajes que lleguen
    // dentro de la ventana corren el reloj en vez de encolar otra.
    dedupeKey: `agent:${input.conversationId}`,
    runAt: new Date(Date.now() + (input.delayMs ?? DEBOUNCE_MS)),
    extendIfPending: true,
    priority: 30,
  });
}
