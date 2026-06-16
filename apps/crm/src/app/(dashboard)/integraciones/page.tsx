import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getIntegrations, IntegrationStatus } from '@/lib/ops-data';

export const dynamic = 'force-dynamic';

const statusVariant = {
  [IntegrationStatus.CONNECTED]: 'success',
  [IntegrationStatus.NEEDS_ATTENTION]: 'warning',
  [IntegrationStatus.DISCONNECTED]: 'outline',
} as const;

export default async function IntegracionesPage() {
  const integrations = await getIntegrations();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Integraciones" subtitle="Canales y servicios conectados al CRM" />
      <div className="grid flex-1 gap-4 overflow-y-auto p-6 lg:grid-cols-2">
        {integrations.map((integration) => (
          <Card key={integration.id} className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm">{integration.name}</CardTitle>
                <Badge variant={statusVariant[integration.status]}>{integration.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-slate-500">
              <p>Proveedor: {integration.provider}</p>
              <p>
                Ultima sincronizacion:{' '}
                {integration.lastSyncAt ? integration.lastSyncAt.toLocaleString('es-CL') : 'Sin sincronizar'}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
