import { computeSaasMetrics, type SaasMetrics } from '../billing/saas-metrics-calc';
import { crossTenantPrisma } from '../prisma';

export type { SaasMetrics } from '../billing/saas-metrics-calc';

/**
 * Metricas SaaS de Upzites Flow (P0-B). Cross-tenant por definicion: el
 * llamador DEBE haber pasado por `requirePlatformRole`. Las reglas (que
 * cuenta como MRR, internos excluidos) viven en `computeSaasMetrics`.
 *
 * Las ventas de commerce de cada workspace (Payment/CustomerOrder) no
 * participan: solo se lee la suscripcion SaaS.
 */
export async function getSaasMetrics(now = new Date()): Promise<SaasMetrics> {
  const rows = await crossTenantPrisma.workspaceSubscription.findMany({
    include: {
      plan: { select: { code: true, key: true } },
      price: { select: { interval: true } },
      workspace: { select: { id: true, isInternal: true } },
    },
  });
  return computeSaasMetrics(rows, now);
}
