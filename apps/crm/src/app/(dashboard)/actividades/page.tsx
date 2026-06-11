import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Mail, Phone, Calendar, FileText, CheckCircle } from 'lucide-react';
import { mockActivities } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

const icons = { email: Mail, call: Phone, meeting: Calendar, note: FileText, deal: CheckCircle };
const colors = {
  email: 'bg-blue-100 text-blue-600',
  call: 'bg-violet-100 text-violet-600',
  meeting: 'bg-amber-100 text-amber-600',
  note: 'bg-slate-100 text-slate-600',
  deal: 'bg-emerald-100 text-emerald-600',
};
const labels = { email: 'Email', call: 'Llamada', meeting: 'Reunión', note: 'Nota', deal: 'Cierre' };

export default function ActividadesPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Actividades" subtitle="Historial de todas las interacciones" action={{ label: 'Registrar actividad', href: '#' }} />
      <div className="flex-1 overflow-y-auto p-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <div className="divide-y">
              {[...mockActivities, ...mockActivities].map((act, i) => {
                const Icon = icons[act.type];
                return (
                  <div key={`${act.id}-${i}`} className="flex items-start gap-4 p-4 hover:bg-slate-50">
                    <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', colors[act.type])}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', colors[act.type])}>
                          {labels[act.type]}
                        </span>
                        <span className="text-[10px] text-slate-400">{act.time}</span>
                      </div>
                      <p className="text-sm text-slate-800">{act.description}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{act.contactName}</p>
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
