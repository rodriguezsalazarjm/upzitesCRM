import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getOpsSummary } from '@/lib/ops-data';

export const dynamic = 'force-dynamic';

export default async function OpsPage() {
  const { auditLogs, openInsights, disconnectedIntegrations } = await getOpsSummary();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Ops" subtitle="Auditoria y salud operacional del CRM" />
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <p className="text-xs text-slate-500">Insights abiertos</p>
              <p className="text-2xl font-bold text-slate-900">{openInsights}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <p className="text-xs text-slate-500">Integraciones pendientes</p>
              <p className="text-2xl font-bold text-slate-900">{disconnectedIntegrations}</p>
            </CardContent>
          </Card>
        </div>
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">Auditoria reciente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {auditLogs.map((log) => (
                <div key={log.id} className="py-3 text-xs">
                  <p className="font-semibold text-slate-800">{log.action}</p>
                  <p className="text-slate-400">
                    {log.entity} {log.entityId ?? ''} - {log.createdAt.toLocaleString('es-CL')}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
