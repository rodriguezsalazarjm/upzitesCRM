import { AlertTriangle, Building2, Database, Layers } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { getPlatformOpsSummary } from '@/lib/ops-data';
import { requirePlatformAdmin } from '@/lib/platform-admin';

export const dynamic = 'force-dynamic';

/**
 * Salud global de la plataforma. Muestra datos de TODOS los tenants, asi que
 * solo la ve un operador de plataforma (404 para cualquier otro usuario, incluido
 * el owner de un workspace). Lo propio de cada workspace —interruptores y
 * auditoria— vive en Configuracion.
 */
export default async function OpsPage() {
  await requirePlatformAdmin();

  const { queue, deadJobs, failedOutbox, workspaces } = await getPlatformOpsSummary();

  const cards = [
    { label: 'Workspaces', value: workspaces, icon: Building2, alert: false },
    { label: 'Cola pendiente', value: queue.pending, icon: Layers, alert: queue.pending > 100 },
    { label: 'En proceso', value: queue.processing, icon: Database, alert: false },
    { label: 'Trabajos muertos', value: queue.dead, icon: AlertTriangle, alert: queue.dead > 0 },
    { label: 'Envíos fallidos', value: failedOutbox, icon: AlertTriangle, alert: failedOutbox > 0 },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Ops plataforma" subtitle="Salud global del sistema: cola de trabajos de todos los workspaces" />
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
                    <span className="text-xs font-semibold text-carbon">
                      {job.type}
                      <span className="ml-2 font-normal text-soft">{job.workspace?.name ?? 'Sistema'}</span>
                    </span>
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
      </div>
    </div>
  );
}
