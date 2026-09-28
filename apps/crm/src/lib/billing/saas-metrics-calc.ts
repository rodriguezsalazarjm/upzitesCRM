import { BillingInterval, BillingSource } from '../../../generated/prisma/enums';
import { resolveLifecycle, type SubscriptionRow, type SubscriptionState } from './subscription-state';

/**
 * Calculo puro de las metricas SaaS comerciales de Upzites Flow (P0-B).
 *
 * Reglas explicitas:
 *  - Un workspace interno (`isInternal`: negocios propios, QA) JAMAS entra en
 *    las metricas comerciales: ni clientes, ni MRR, ni churn, ni conteos por
 *    estado, aunque por error tenga un medio de pago. Solo suma a
 *    `internalWorkspaces`.
 *  - MRR: SOLO MANUAL o MERCADO_PAGO, en ACTIVE o GRACE (periodo pagado vigente
 *    o dentro de la gracia), por moneda, normalizado a mensual. Sin conversion.
 *  - NO son MRR: FREE, TRIAL, COMP (ni un pagado EXPIRED o SUSPENDED).
 *  - Churn: pagados (MANUAL / MERCADO_PAGO) que terminaron la gracia.
 */
export type SaasMetrics = {
  payingCustomers: number;
  mrrByCurrency: Record<string, number>;
  churned: number;
  trials: number;
  free: number;
  comp: number;
  internalWorkspaces: number;
  byState: Partial<Record<SubscriptionState, number>>;
  /** Workspaces que cuentan como clientes de pago (nunca internos). */
  payingWorkspaceIds: string[];
};

export type MetricsRow = SubscriptionRow & { workspace: { id: string; isInternal: boolean } };

const PAID = new Set<BillingSource>([BillingSource.MANUAL, BillingSource.MERCADO_PAGO]);

export function computeSaasMetrics(rows: MetricsRow[], now = new Date()): SaasMetrics {
  const metrics: SaasMetrics = {
    payingCustomers: 0,
    mrrByCurrency: {},
    churned: 0,
    trials: 0,
    free: 0,
    comp: 0,
    internalWorkspaces: 0,
    byState: {},
    payingWorkspaceIds: [],
  };

  for (const row of rows) {
    if (row.workspace.isInternal) {
      metrics.internalWorkspaces += 1;
      continue;
    }
    const snapshot = resolveLifecycle(row, now);
    metrics.byState[snapshot.state] = (metrics.byState[snapshot.state] ?? 0) + 1;

    const paid = PAID.has(snapshot.billingSource);
    if (paid && (snapshot.state === 'ACTIVE' || snapshot.state === 'GRACE')) {
      metrics.payingCustomers += 1;
      metrics.payingWorkspaceIds.push(row.workspace.id);
      if (snapshot.price) {
        const monthly =
          snapshot.price.interval === BillingInterval.YEAR
            ? Math.round(snapshot.price.amountMinor / 12)
            : snapshot.price.amountMinor;
        metrics.mrrByCurrency[snapshot.price.currency] = (metrics.mrrByCurrency[snapshot.price.currency] ?? 0) + monthly;
      }
    } else if (paid && snapshot.state === 'EXPIRED') {
      metrics.churned += 1;
    }
    if (snapshot.state === 'TRIAL') metrics.trials += 1;
    if (snapshot.state === 'FREE') metrics.free += 1;
    if (snapshot.billingSource === BillingSource.COMP) metrics.comp += 1;
  }

  return metrics;
}
