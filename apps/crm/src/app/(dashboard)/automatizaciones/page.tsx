import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getAutomationRules } from '@/lib/ops-data';

export const dynamic = 'force-dynamic';

export default async function AutomatizacionesPage() {
  const rules = await getAutomationRules();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Automatizaciones" subtitle="Reglas simples para reducir trabajo manual" />
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {rules.map((rule) => (
          <Card key={rule.id} className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{rule.name}</CardTitle>
                <Badge variant={rule.isActive ? 'success' : 'outline'}>
                  {rule.isActive ? 'Activa' : 'Pausada'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-2 text-xs text-slate-500 md:grid-cols-3">
              <p>Trigger: {rule.trigger}</p>
              <p>Accion: {rule.action}</p>
              <p>Ultima ejecucion: {rule.lastRunAt ? rule.lastRunAt.toLocaleString('es-CL') : 'Nunca'}</p>
              {rule.description && <p className="md:col-span-3">{rule.description}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
