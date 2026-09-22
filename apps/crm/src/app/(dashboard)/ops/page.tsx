import { AlertTriangle, Database, Layers, PlugZap, PowerOff, ShieldCheck } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { StatCard } from '@/components/ui/stat-card';
import { requireCurrentUser } from '@/lib/auth';
import { getOpsSummary } from '@/lib/ops-data';
import { flagStates } from '@/lib/ops/flags';
import { FlagsClient } from './flags-client';

export const dynamic = 'force-dynamic';

export default async function OpsPage() {
  const user = await requireCurrentUser();

  const [summary, flags] = await Promise.all([
    getOpsSummary(),
    flagStates(user.workspace.id),
  ]);

  const { auditLogs, openInsights, disconnectedIntegrations, queue, deadJobs, failedOutbox } =
    summary;

  const apagadas = flags.filter((flag) => !flag.enabled).length;

  const cards = [
    { label: 'Cola pendiente', value: queue.pending, icon: Layers, alert: queue.pending > 100 },
    { label: 'En proceso', value: queue.processing, icon: Database, alert: false },
    { label: 'Trabajos muertos', value: queue.dead, icon: AlertTriangle, alert: queue.dead > 0 },
    { label: 'Envios fallidos', value: failedOutbox, icon: AlertTriangle, alert: failedOutbox > 0 },
    { label: 'Insights abiertos', value: openInsights, icon: ShieldCheck, alert: false },
    { label: 'Integraciones sin conectar', value: disconnectedIntegrations, icon: PlugZap, alert: false },
    { label: 'Funciones apagadas', value: apagadas, icon: PowerOff, alert: apagadas > 0 },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Ops" subtitle="Salud del sistema, cola de trabajos y auditoria" />
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <StatCard
              key={card.label}
              label={card.label}
              value={card.value}
              icon={card.icon}
              size="sm"
              accent={card.alert ? 'tomato' : undefined}
            />
          ))}
        </div>

        <section>
          <Eyebrow className="mb-2">Interruptores</Eyebrow>
          <FlagsClient flags={flags} canManage={user.role === 'OWNER'} />
        </section>

        {deadJobs.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-danger-ink">
                Trabajos que agotaron sus reintentos
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-line">
              {deadJobs.map((job) => (
                <div key={job.id} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-carbon">{job.type}</span>
                    <span className="text-[10px] text-soft">
                      {job.updatedAt.toLocaleString('es-CL')}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-danger-ink">{job.lastError}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Auditoria reciente</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-line">
            {auditLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-carbon">{log.action}</p>
                  <p className="text-[10px] text-soft">
                    {log.entity}
                    {log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ''}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {log.createdAt.toLocaleString('es-CL')}
                </Badge>
              </div>
            ))}
            {auditLogs.length === 0 && <p className="py-3 text-xs text-soft">Sin registros todavia.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
