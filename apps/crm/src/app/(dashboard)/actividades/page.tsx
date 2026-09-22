import { Header } from '@/components/layout/header';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { StatusBadge } from '@/components/ui/status-badge';
import { Calendar, CheckCircle, FileText, Mail, Phone } from 'lucide-react';
import { getActivities } from '@/lib/crm-data';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const icons = { email: Mail, call: Phone, meeting: Calendar, note: FileText, deal: CheckCircle };
// Mismos tonos que el feed de actividad del Dashboard: un color por tipo, sin inventar otros.
const colors = {
  email: 'bg-electric/10 text-electric',
  call: 'bg-ink/10 text-ink',
  meeting: 'bg-solar/30 text-warning-ink',
  note: 'bg-ivory text-graphite',
  deal: 'bg-lime/40 text-success-ink',
};
const labels = { email: 'Email', call: 'Llamada', meeting: 'Reunion', note: 'Nota', deal: 'Cierre' };

export default async function ActividadesPage() {
  const activities = await getActivities(24);
  const pending = activities.filter((activity) => activity.dueAt && !activity.completedAt);
  const history = activities.filter((activity) => !activity.dueAt || activity.completedAt);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Actividades"
        subtitle="Historial de todas las interacciones"
        action={{ label: 'Registrar actividad', href: '#' }}
      />
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {pending.length > 0 && (
          <section>
            <Eyebrow className="mb-2">Tareas pendientes</Eyebrow>
            <Card className="divide-y divide-line">
              {pending.map((act) => {
                const Icon = icons[act.type];
                return (
                  <div key={act.id} className="flex items-start gap-4 p-4">
                    <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', colors[act.type])}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-center gap-2">
                        <StatusBadge tone="warning">Pendiente</StatusBadge>
                        <span className="text-[10px] text-soft">
                          Vence {new Date(act.dueAt!).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                        </span>
                      </div>
                      <p className="text-sm text-carbon">{act.description}</p>
                      <p className="mt-0.5 text-xs text-soft">{act.contactName}</p>
                    </div>
                  </div>
                );
              })}
            </Card>
          </section>
        )}
        <Card className="divide-y divide-line">
          {history.map((act) => {
            const Icon = icons[act.type];
            return (
              <div key={act.id} className="flex items-start gap-4 p-4">
                <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', colors[act.type])}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', colors[act.type])}>
                      {labels[act.type]}
                    </span>
                    <span className="text-[10px] text-soft">{act.time}</span>
                  </div>
                  <p className="text-sm text-carbon">{act.description}</p>
                  <p className="mt-0.5 text-xs text-soft">{act.contactName}</p>
                </div>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}
