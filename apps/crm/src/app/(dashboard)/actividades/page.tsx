import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, CheckCircle, FileText, Mail, Phone } from 'lucide-react';
import { getActivities } from '@/lib/crm-data';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const icons = { email: Mail, call: Phone, meeting: Calendar, note: FileText, deal: CheckCircle };
const colors = {
  email: 'bg-blue-100 text-blue-600',
  call: 'bg-violet-100 text-violet-600',
  meeting: 'bg-amber-100 text-amber-600',
  note: 'bg-slate-100 text-slate-600',
  deal: 'bg-emerald-100 text-emerald-600',
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
          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              <div className="border-b px-4 py-3">
                <p className="text-sm font-semibold text-slate-800">Tareas pendientes</p>
              </div>
              <div className="divide-y">
                {pending.map((act) => {
                  const Icon = icons[act.type];
                  return (
                    <div key={act.id} className="flex items-start gap-4 p-4 hover:bg-amber-50/40">
                      <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', colors[act.type])}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex items-center gap-2">
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            Pendiente
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Vence {new Date(act.dueAt!).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                          </span>
                        </div>
                        <p className="text-sm text-slate-800">{act.description}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{act.contactName}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <div className="divide-y">
              {history.map((act) => {
                const Icon = icons[act.type];
                return (
                  <div key={act.id} className="flex items-start gap-4 p-4 hover:bg-slate-50">
                    <div
                      className={cn(
                        'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                        colors[act.type],
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-center gap-2">
                        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', colors[act.type])}>
                          {labels[act.type]}
                        </span>
                        <span className="text-[10px] text-slate-400">{act.time}</span>
                      </div>
                      <p className="text-sm text-slate-800">{act.description}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{act.contactName}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
