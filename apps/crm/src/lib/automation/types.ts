import type { AutomationTrigger } from '../../../generated/prisma/client';
import type { EventContext } from './conditions';

/**
 * Hecho del dominio que puede disparar reglas.
 *
 * Vive en su propio archivo para que quien lo emite (rutas, servicios de
 * WhatsApp) no tenga que importar el motor, que a su vez importa esos mismos
 * servicios. Sin esta separacion habria un ciclo de imports.
 */
export type DomainEvent = {
  workspaceId: string;
  trigger: AutomationTrigger;
  /** Identifica el hecho. Es la base de "una ejecucion por evento". */
  dedupeKey: string;
  contactId?: string | null;
  conversationId?: string | null;
  opportunityId?: string | null;
  context?: EventContext;
};
