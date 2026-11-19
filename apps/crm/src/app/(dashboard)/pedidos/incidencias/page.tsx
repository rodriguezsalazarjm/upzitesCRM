import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { IncidentResolveForm } from '@/components/orders/incident-resolve-form';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { requireCurrentUser } from '@/lib/auth';
import { formatMinor } from '@/lib/commerce/money';
import { evidenceRows, INCIDENT_KIND, INCIDENT_STATUS_LABEL } from '@/lib/commerce/payment-incident-kinds';
import { canManageChannels } from '@/lib/conversations';
import { prisma } from '@/lib/prisma';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const when = (date: Date) => date.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' });

/** P31: cola de incidencias de pago. Abiertas primero; las cerradas guardan su nota. */
export default async function IncidenciasPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const user = await requireCurrentUser();
  const workspaceId = user.workspace.id;
  const closed = (await searchParams).estado === 'cerradas';
  const canResolve = canManageChannels(user.role);

  const [incidents, openCount] = await Promise.all([
    prisma.paymentIncident.findMany({
      where: { workspaceId, status: closed ? { not: 'OPEN' } : 'OPEN' },
      orderBy: closed ? { resolvedAt: 'desc' } : { createdAt: 'desc' },
      take: 100,
      include: { order: { select: { id: true, customerName: true, contact: { select: { firstName: true, lastName: true } } } } },
    }),
    prisma.paymentIncident.count({ where: { workspaceId, status: 'OPEN' } }),
  ]);
  const resolverIds = [...new Set(incidents.map((i) => i.resolvedById).filter((id): id is string => Boolean(id)))];
  const resolvers = resolverIds.length
    ? await prisma.user.findMany({ where: { id: { in: resolverIds } }, select: { id: true, name: true, email: true } })
    : [];
  const resolverName = (id: string | null) => {
    const u = resolvers.find((r) => r.id === id);
    return u ? u.name || u.email : 'un operador';
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Incidencias de pago" subtitle="Pagos que el sistema no pudo conciliar solo" />
      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Estado">
          <Link href="/pedidos/incidencias" aria-current={!closed ? 'page' : undefined} className={cn('rounded-md px-3 py-1 text-sm', !closed ? 'bg-carbon text-canvas' : 'text-graphite hover:bg-ivory')}>
            Abiertas ({openCount})
          </Link>
          <Link href="/pedidos/incidencias?estado=cerradas" aria-current={closed ? 'page' : undefined} className={cn('rounded-md px-3 py-1 text-sm', closed ? 'bg-carbon text-canvas' : 'text-graphite hover:bg-ivory')}>
            Cerradas
          </Link>
          <Link href="/pedidos" className="ml-auto text-sm font-semibold text-electric hover:underline">Volver a pedidos</Link>
        </div>

        {incidents.length === 0 ? (
          <EmptyState icon={ShieldCheck} title={closed ? 'Aún no hay incidencias cerradas' : 'Sin incidencias abiertas'} description="Cuando un pago no coincida con su pedido, llegue duplicado, sin pedido, o se devuelva, aparecerá aquí." />
        ) : (
          <ul className="space-y-3">
            {incidents.map((incident) => {
              const kind = INCIDENT_KIND[incident.kind];
              const customer = [incident.order?.contact?.firstName, incident.order?.contact?.lastName].filter(Boolean).join(' ') || incident.order?.customerName;
              const rows = evidenceRows(incident.evidence, formatMinor);
              return (
                <li key={incident.id}>
                  <Card className="space-y-3 p-4 sm:p-5" data-incident={incident.id} data-incident-kind={incident.kind} data-incident-status={incident.status}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-carbon">{kind.label}</p>
                        <p className="text-xs text-soft">
                          {when(incident.createdAt)} · pago <span className="break-all font-mono">{incident.externalPaymentId}</span>
                          {incident.amount !== null && incident.currency ? ` · ${formatMinor(incident.amount, incident.currency)}` : ''}
                        </p>
                      </div>
                      <StatusBadge tone={incident.status === 'OPEN' ? 'warning' : incident.status === 'RESOLVED' ? 'success' : 'neutral'}>
                        {INCIDENT_STATUS_LABEL[incident.status]}
                      </StatusBadge>
                    </div>

                    {incident.order && (
                      <p className="text-sm text-graphite">
                        Pedido de {customer || 'cliente sin nombre'} ·{' '}
                        <Link href={`/pedidos/${incident.order.id}`} className="font-semibold text-electric hover:underline">Ver pedido</Link>
                      </p>
                    )}

                    {rows.length > 0 && (
                      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2" data-incident-evidence>
                        {rows.map((row) => (
                          <div key={row.key} className="flex min-w-0 justify-between gap-3 border-b border-line py-1">
                            <dt className="shrink-0 text-soft">{row.label}</dt>
                            <dd className="min-w-0 break-all text-right text-carbon">{row.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}

                    {incident.status === 'OPEN' ? (
                      <>
                        <p className="rounded-md bg-ivory px-3 py-2 text-sm text-carbon"><span className="font-semibold">Acción requerida:</span> {kind.action}</p>
                        {canResolve ? <IncidentResolveForm incidentId={incident.id} /> : <p className="text-xs text-soft">Solo el owner o un admin puede cerrarla.</p>}
                      </>
                    ) : (
                      <p className="text-sm text-graphite" data-incident-note>
                        {INCIDENT_STATUS_LABEL[incident.status]} por {resolverName(incident.resolvedById)}
                        {incident.resolvedAt ? ` el ${when(incident.resolvedAt)}` : ''}: {incident.resolutionNote}
                      </p>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-soft">El reembolso se hace hoy en Mercado Pago; cuando llega su aviso, el pedido se marca reembolsado y queda aquí.</p>
      </div>
    </div>
  );
}
