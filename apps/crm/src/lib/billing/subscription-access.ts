import type { Prisma, PrismaClient } from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { resolveLifecycle, type SubscriptionSnapshot, type SubscriptionState } from './subscription-state';

type Db = Pick<PrismaClient, 'workspaceSubscription'> | Pick<Prisma.TransactionClient, 'workspaceSubscription'>;

/** La suscripcion del workspace (una por workspace desde P0-B). */
export function currentSubscription(workspaceId: string, db: Db = prisma) {
  return db.workspaceSubscription.findUnique({
    where: { workspaceId },
    include: { plan: true, price: { select: { interval: true } } },
  });
}

/** @deprecated Nombre de P0-A; usar `currentSubscription`. */
export const latestSubscription = currentSubscription;

/**
 * Contrato unico de P0-B: plan configurado, plan efectivo, medio de pago,
 * estado, periodo, gracia, renovacion y precio. Lo consumen la UI, la API, los
 * workers y (en P0-C) los entitlements. Nadie mas interpreta estados.
 */
export async function resolveSubscription(
  workspaceId: string,
  db: Db = prisma,
  now = new Date(),
): Promise<SubscriptionSnapshot> {
  return resolveLifecycle(await currentSubscription(workspaceId, db), now);
}

/** @deprecated Nombre de P0-A; usar `resolveSubscription`. */
export const getSubscriptionState = resolveSubscription;

export class SubscriptionInactiveError extends Error {
  constructor(readonly state: SubscriptionState) {
    super('La suscripcion del workspace no permite consumir servicios pagados.');
    this.name = 'SubscriptionInactiveError';
  }
}

/**
 * Freno de consumo para procesos en segundo plano. Se llama justo antes de
 * gastar (IA, envio por un canal, email). FREE, EXPIRED y SUSPENDED no gastan,
 * aunque tengan trabajos encolados de antes.
 */
export async function canWorkspaceConsume(workspaceId: string, db: Db = prisma) {
  return (await resolveSubscription(workspaceId, db)).canConsume;
}

export async function assertWorkspaceCanConsume(workspaceId: string, db: Db = prisma) {
  const state = await resolveSubscription(workspaceId, db);
  if (!state.canConsume) throw new SubscriptionInactiveError(state.state);
  return state;
}
