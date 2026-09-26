import { prisma } from '../prisma';
import { resolveSubscriptionState, type SubscriptionState } from './subscription-state';

type Db = Pick<typeof prisma, 'workspaceSubscription'>;

/** Suscripcion vigente del workspace: la mas reciente. */
export function latestSubscription(workspaceId: string, db: Db = prisma) {
  return db.workspaceSubscription.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    include: { plan: true },
  });
}

export async function getSubscriptionState(workspaceId: string, db: Db = prisma, now = new Date()) {
  return resolveSubscriptionState(await latestSubscription(workspaceId, db), now);
}

export class SubscriptionInactiveError extends Error {
  constructor(readonly state: SubscriptionState) {
    super('La suscripcion del workspace no esta vigente: no se consumen servicios pagados.');
    this.name = 'SubscriptionInactiveError';
  }
}

/**
 * Freno de consumo para procesos en segundo plano. Se llama justo antes de
 * gastar (IA, envio por un canal, email): un workspace vencido no puede seguir
 * consumiendo aunque tenga trabajos encolados de antes de vencer.
 */
export async function canWorkspaceConsume(workspaceId: string, db: Db = prisma) {
  return (await getSubscriptionState(workspaceId, db)).canConsume;
}

export async function assertWorkspaceCanConsume(workspaceId: string, db: Db = prisma) {
  const state = await getSubscriptionState(workspaceId, db);
  if (!state.canConsume) throw new SubscriptionInactiveError(state.state);
  return state;
}
