import { prisma } from '../prisma';
import { recordAudit } from '../domain/audit';
import { getWorkspaceEntitlements, type Db } from './index';

/**
 * Contactos ENTRANTES (P0-C): un lead real que llega por WhatsApp,
 * Instagram/Messenger o un formulario publico nunca se pierde por
 * `contacts.max`. Se crea aunque el uso quede sobre el limite y se deja
 * constancia auditable (`contacts.inbound_over_limit`).
 *
 * Lo que SI se bloquea en el limite son las altas proactivas del negocio
 * (crear a mano, importar, duplicar): ver `withEntitlementLock`.
 */
export type InboundSource = 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | 'TIKTOK' | 'FORM' | 'CHECKOUT';

export async function noteInboundContact(
  input: { workspaceId: string; contactId: string; source: InboundSource },
  db: Db = prisma,
) {
  const entitlements = await getWorkspaceEntitlements(input.workspaceId, db);
  const limit = entitlements.limit('contacts.max');
  const usage = await entitlements.usage('contacts');
  if (usage <= limit) return { overLimit: false as const, usage, limit };

  await recordAudit(
    {
      workspaceId: input.workspaceId,
      action: 'contacts.inbound_over_limit',
      entity: 'Contact',
      entityId: input.contactId,
      metadata: { source: input.source, usage, limit },
    },
    db,
  );
  return { overLimit: true as const, usage, limit };
}
