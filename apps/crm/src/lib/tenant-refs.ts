import { NextResponse } from 'next/server';
import { prisma } from './prisma';
import { isActiveMember } from './membership';

/**
 * Validacion de referencias recibidas desde el cliente (P0-FOUNDATION).
 *
 * Un id que llega en el body (contactId, ownerId, ...) nunca se persiste sin
 * comprobar que pertenezca al workspace activo. Sin esto, un usuario de A podia
 * enlazar su oportunidad a un contacto o usuario de B: no expone datos por si
 * solo, pero rompe el aislamiento y deja FKs que cruzan tenants.
 *
 * `null` significa "desvincular" y siempre es valido; `undefined`, "no tocar".
 */
export type TenantRefs = {
  contactId?: string | null;
  companyId?: string | null;
  opportunityId?: string | null;
  conversationId?: string | null;
  formId?: string | null;
  /** Usuario: debe ser miembro ACTIVE del workspace. */
  ownerId?: string | null;
};

type Checker = (workspaceId: string, id: string) => Promise<boolean>;

const exists = (count: Promise<number>) => count.then((n) => n > 0);

const CHECKERS: Record<keyof TenantRefs, Checker> = {
  contactId: (workspaceId, id) => exists(prisma.contact.count({ where: { id, workspaceId } })),
  companyId: (workspaceId, id) => exists(prisma.company.count({ where: { id, workspaceId } })),
  opportunityId: (workspaceId, id) => exists(prisma.opportunity.count({ where: { id, workspaceId } })),
  conversationId: (workspaceId, id) => exists(prisma.conversation.count({ where: { id, workspaceId } })),
  formId: (workspaceId, id) => exists(prisma.form.count({ where: { id, workspaceId } })),
  ownerId: (workspaceId, id) => isActiveMember(workspaceId, id),
};

/** Campos cuyas referencias NO pertenecen al workspace. Vacio = todo en orden. */
export async function foreignRefs(workspaceId: string, refs: TenantRefs): Promise<(keyof TenantRefs)[]> {
  const entries = (Object.entries(refs) as [keyof TenantRefs, string | null | undefined][]).filter(
    (entry): entry is [keyof TenantRefs, string] => typeof entry[1] === 'string',
  );
  const results = await Promise.all(entries.map(([field, id]) => CHECKERS[field](workspaceId, id)));
  return entries.filter((_, index) => !results[index]).map(([field]) => field);
}

/**
 * Para route handlers: 404 si alguna referencia no es del workspace. Mismo
 * status que "no existe" a proposito: no se confirma la existencia de ids de
 * otros tenants.
 */
export async function rejectForeignRefs(workspaceId: string, refs: TenantRefs) {
  const invalid = await foreignRefs(workspaceId, refs);
  if (invalid.length === 0) return null;
  return NextResponse.json(
    { message: 'Referencia no encontrada en este workspace.', code: 'FOREIGN_REFERENCE', fields: invalid },
    { status: 404 },
  );
}
