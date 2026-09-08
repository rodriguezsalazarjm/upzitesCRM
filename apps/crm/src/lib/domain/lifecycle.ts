import {
  ContactStatus,
  LifecycleStatus,
  OpportunityStatus,
  ScheduledActionStatus,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { recordAudit, type Db } from './audit';

/**
 * Transiciones permitidas del ciclo de vida comercial.
 *
 * Un contacto perdido no se elimina: puede volver a LEAD si entra en una
 * recuperacion futura. Un cliente puede volverse recurrente o perderse, pero
 * nunca retrocede a LEAD sin pasar por LOST.
 */
const ALLOWED_TRANSITIONS: Record<LifecycleStatus, LifecycleStatus[]> = {
  [LifecycleStatus.LEAD]: [LifecycleStatus.QUALIFIED, LifecycleStatus.CUSTOMER, LifecycleStatus.LOST],
  [LifecycleStatus.QUALIFIED]: [LifecycleStatus.CUSTOMER, LifecycleStatus.LOST, LifecycleStatus.LEAD],
  [LifecycleStatus.CUSTOMER]: [LifecycleStatus.REPEAT_CUSTOMER, LifecycleStatus.LOST],
  [LifecycleStatus.REPEAT_CUSTOMER]: [LifecycleStatus.LOST],
  [LifecycleStatus.LOST]: [LifecycleStatus.LEAD, LifecycleStatus.QUALIFIED],
};

/**
 * Unicas razones que autorizan convertir a CUSTOMER.
 *
 * La spec es explicita: un contacto pasa a cliente solo tras un pago aprobado
 * o una confirmacion humana autorizada (ventas no electronicas). La IA nunca
 * puede provocar esta transicion por si misma.
 */
export const CUSTOMER_REASONS = ['PAYMENT_APPROVED', 'HUMAN_CONFIRMED'] as const;
export type CustomerReason = (typeof CUSTOMER_REASONS)[number];
export type TransitionReason = CustomerReason | 'QUALIFIED_BY_USER' | 'MARKED_LOST' | 'REACTIVATED' | 'REPEAT_PURCHASE';

/** Espejo del ciclo de vida sobre el `status` legado, que la UI aun consume. */
const LEGACY_STATUS: Record<LifecycleStatus, ContactStatus> = {
  [LifecycleStatus.LEAD]: ContactStatus.LEAD,
  [LifecycleStatus.QUALIFIED]: ContactStatus.ACTIVE,
  [LifecycleStatus.CUSTOMER]: ContactStatus.CUSTOMER,
  [LifecycleStatus.REPEAT_CUSTOMER]: ContactStatus.CUSTOMER,
  [LifecycleStatus.LOST]: ContactStatus.INACTIVE,
};

export class LifecycleTransitionError extends Error {
  constructor(
    message: string,
    readonly code: 'INVALID_TRANSITION' | 'REASON_REQUIRED' | 'NOT_FOUND',
  ) {
    super(message);
    this.name = 'LifecycleTransitionError';
  }
}

export function canTransition(from: LifecycleStatus, to: LifecycleStatus) {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isCustomerReason(reason: TransitionReason): reason is CustomerReason {
  return (CUSTOMER_REASONS as readonly string[]).includes(reason);
}

export type TransitionInput = {
  workspaceId: string;
  contactId: string;
  to: LifecycleStatus;
  reason: TransitionReason;
  actorId?: string | null;
};

/**
 * Cambia el ciclo de vida de un contacto validando la transicion, sincronizando
 * el `status` legado y dejando registro en el audit log.
 *
 * Lanza LifecycleTransitionError ante una transicion invalida en vez de
 * "arreglarla" en silencio: el estado comercial es la base de las
 * automatizaciones y una transicion ilegal indica un bug, no un caso borde.
 */
export async function transitionLifecycle(input: TransitionInput, db: Db = prisma) {
  const contact = await db.contact.findFirst({
    where: { id: input.contactId, workspaceId: input.workspaceId },
    select: { id: true, lifecycleStatus: true },
  });

  if (!contact) {
    throw new LifecycleTransitionError('Contacto no encontrado en este workspace.', 'NOT_FOUND');
  }

  const from = contact.lifecycleStatus;

  if (!canTransition(from, input.to)) {
    throw new LifecycleTransitionError(
      `Transicion invalida: ${from} -> ${input.to}.`,
      'INVALID_TRANSITION',
    );
  }

  const becomesCustomer =
    input.to === LifecycleStatus.CUSTOMER || input.to === LifecycleStatus.REPEAT_CUSTOMER;

  if (becomesCustomer && !isCustomerReason(input.reason) && input.reason !== 'REPEAT_PURCHASE') {
    throw new LifecycleTransitionError(
      'Solo un pago aprobado o una confirmacion humana autorizada convierten a CUSTOMER.',
      'REASON_REQUIRED',
    );
  }

  const updated = await db.contact.update({
    where: { id: contact.id },
    data: {
      lifecycleStatus: input.to,
      status: LEGACY_STATUS[input.to],
    },
  });

  await recordAudit(
    {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: 'contact.lifecycle_changed',
      entity: 'Contact',
      entityId: contact.id,
      metadata: { from, to: input.to, reason: input.reason },
    },
    db,
  );

  return updated;
}

export type ApprovedPaymentInput = {
  workspaceId: string;
  contactId: string;
  paymentId: string;
  amount?: number;
  actorId?: string | null;
};

/**
 * Efectos de un pago aprobado sobre el dominio comercial:
 *
 *   1. El contacto pasa a CUSTOMER (o REPEAT_CUSTOMER si ya lo era).
 *   2. Se cancelan las recuperaciones de checkout pendientes.
 *   3. Sus oportunidades abiertas se marcan como ganadas.
 *
 * Solo debe invocarse desde un webhook verificado que ya re-consulto el pago
 * contra el proveedor. Nunca desde la IA ni desde una afirmacion del usuario.
 */
export async function applyApprovedPayment(input: ApprovedPaymentInput) {
  return prisma.$transaction(async (tx) => {
    const contact = await tx.contact.findFirst({
      where: { id: input.contactId, workspaceId: input.workspaceId },
      select: { id: true, lifecycleStatus: true },
    });

    if (!contact) {
      throw new LifecycleTransitionError('Contacto no encontrado en este workspace.', 'NOT_FOUND');
    }

    const alreadyCustomer =
      contact.lifecycleStatus === LifecycleStatus.CUSTOMER ||
      contact.lifecycleStatus === LifecycleStatus.REPEAT_CUSTOMER;

    const target = alreadyCustomer ? LifecycleStatus.REPEAT_CUSTOMER : LifecycleStatus.CUSTOMER;

    // De CUSTOMER a CUSTOMER no hay transicion que validar (una segunda compra
    // de quien ya es cliente recurrente no cambia su estado).
    if (contact.lifecycleStatus !== target) {
      await transitionLifecycle(
        {
          workspaceId: input.workspaceId,
          contactId: contact.id,
          to: target,
          reason: alreadyCustomer ? 'REPEAT_PURCHASE' : 'PAYMENT_APPROVED',
          actorId: input.actorId,
        },
        tx,
      );
    }

    const canceled = await tx.scheduledAction.updateMany({
      where: {
        workspaceId: input.workspaceId,
        contactId: contact.id,
        status: ScheduledActionStatus.PENDING,
        type: { in: ['CHECKOUT_RECOVERY', 'FOLLOW_UP'] },
      },
      data: { status: ScheduledActionStatus.CANCELED, canceledAt: new Date() },
    });

    const wonStage = await tx.pipelineStage.findFirst({
      where: { workspaceId: input.workspaceId, isWon: true },
      select: { id: true, probability: true },
    });

    let opportunitiesWon = 0;
    if (wonStage) {
      const result = await tx.opportunity.updateMany({
        where: {
          workspaceId: input.workspaceId,
          contactId: contact.id,
          status: OpportunityStatus.OPEN,
        },
        data: {
          status: OpportunityStatus.WON,
          stageId: wonStage.id,
          probability: wonStage.probability,
        },
      });
      opportunitiesWon = result.count;
    }

    await recordAudit(
      {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: 'contact.payment_applied',
        entity: 'Contact',
        entityId: contact.id,
        metadata: {
          paymentId: input.paymentId,
          amount: input.amount ?? null,
          lifecycleStatus: target,
          canceledActions: canceled.count,
          opportunitiesWon,
        },
      },
      tx,
    );

    return { lifecycleStatus: target, canceledActions: canceled.count, opportunitiesWon };
  });
}
