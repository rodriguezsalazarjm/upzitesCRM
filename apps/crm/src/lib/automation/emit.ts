import { JobType } from '../../../generated/prisma/client';
import { enqueue } from '../jobs/queue';
import type { DomainEvent } from './types';

/**
 * Unico punto de entrada para anunciar un hecho del dominio.
 *
 * No ejecuta nada: encola. Quien emite no espera a que las reglas corran, y un
 * fallo en una automatizacion no puede romper la operacion que lo origino.
 */
export async function emitDomainEvent(event: DomainEvent) {
  return enqueue({
    type: JobType.EVALUATE_TRIGGER,
    workspaceId: event.workspaceId,
    payload: event as never,
    // Un mismo hecho no se evalua dos veces aunque se emita dos veces.
    dedupeKey: `trigger:${event.trigger}:${event.dedupeKey}`,
    priority: 50,
  });
}
