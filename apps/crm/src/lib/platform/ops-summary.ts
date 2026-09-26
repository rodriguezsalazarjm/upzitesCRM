import { crossTenantPrisma } from '../prisma';

/**
 * Salud GLOBAL del sistema: cola de todos los tenants, trabajos muertos y
 * envios fallidos. Cross-tenant por definicion: el llamador DEBE haber pasado
 * por `requirePlatformAdmin()`.
 */
export async function getPlatformOpsSummary() {
  const [queue, deadJobs, failedOutbox, workspaces] = await Promise.all([
    crossTenantPrisma.job.groupBy({ by: ['status'], _count: { _all: true } }),
    crossTenantPrisma.job.findMany({
      where: { status: 'DEAD' },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        type: true,
        lastError: true,
        updatedAt: true,
        workspace: { select: { name: true } },
      },
    }),
    crossTenantPrisma.outboxEvent.count({ where: { status: 'FAILED' } }),
    crossTenantPrisma.workspace.count(),
  ]);

  const queueByStatus = Object.fromEntries(queue.map((row) => [row.status, row._count._all]));

  return {
    queue: {
      pending: queueByStatus.PENDING ?? 0,
      processing: queueByStatus.PROCESSING ?? 0,
      done: queueByStatus.DONE ?? 0,
      dead: queueByStatus.DEAD ?? 0,
    },
    deadJobs,
    failedOutbox,
    workspaces,
  };
}
