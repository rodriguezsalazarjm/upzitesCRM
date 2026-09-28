import { prisma } from '../prisma';
import type { LimitKey } from './config';
import { assertCanGrow, type Db } from './index';

/**
 * Serializacion de cupos (P0-C): "leer el uso actual + persistir el recurso"
 * ocurre bajo un advisory lock TRANSACCIONAL de PostgreSQL por
 * `workspaceId + limite`. Dos requests concurrentes que compiten por el
 * ultimo lugar se ordenan: la segunda ve el uso ya actualizado y falla. No
 * depende de que la reconciliacion lo arregle despues.
 *
 * Reglas:
 *  - El lock vive solo lo que dura la transaccion (se libera en commit o
 *    rollback); no hay que soltarlo a mano.
 *  - NUNCA hacer llamadas externas (Meta, Mercado Pago, OpenAI) dentro de
 *    `withEntitlementLock`: verificar con el proveedor ANTES y entrar al lock
 *    solo para el chequeo final y la escritura local.
 *  - Una sola clave por transaccion. Si alguna vez hiciera falta mas de una,
 *    tomarlas en orden alfabetico para no crear deadlocks.
 */

export function entitlementLockKey(workspaceId: string, key: LimitKey) {
  return `entitlement:${workspaceId}:${key}`;
}

/** Toma el lock dentro de una transaccion ya abierta (p. ej. la de saveFlow). */
export async function lockEntitlement(tx: Db, workspaceId: string, key: LimitKey) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${entitlementLockKey(workspaceId, key)}, 0))`;
}

export type GrowthGuard = {
  /** Chequeo final del limite, con el uso visto DENTRO del lock. */
  assertCanGrow(amount?: number): Promise<void>;
};

/**
 * Abre una transaccion, toma el lock del limite y ejecuta `run`. Dentro,
 * `guard.assertCanGrow()` cuenta con la misma transaccion y `run` persiste con
 * `tx`, asi el recurso nuevo queda visible para el siguiente en la fila.
 */
export async function withEntitlementLock<T>(
  workspaceId: string,
  key: LimitKey,
  run: (tx: Db, guard: GrowthGuard) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await lockEntitlement(tx, workspaceId, key);
    const guard: GrowthGuard = {
      assertCanGrow: async (amount = 1) => {
        await assertCanGrow(workspaceId, key, amount, tx);
      },
    };
    return run(tx, guard);
  });
}
