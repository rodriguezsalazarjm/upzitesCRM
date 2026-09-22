import { IntegrationCards } from '@/components/channels/integration-cards';
import { isLocalDemo } from '@/lib/testing/local-mode';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { prisma } from '@/lib/prisma';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getIntegrations, IntegrationStatus } from '@/lib/ops-data';
import { WhatsAppIntegrationCard } from './whatsapp-integration-card';
import { MercadoPagoIntegrationCard } from './mercado-pago-integration-card';

export const dynamic = 'force-dynamic';

const statusVariant = {
  [IntegrationStatus.CONNECTED]: 'success',
  [IntegrationStatus.NEEDS_ATTENTION]: 'warning',
  [IntegrationStatus.DISCONNECTED]: 'outline',
} as const;
const statusLabel = {
  [IntegrationStatus.CONNECTED]: 'Conectado',
  [IntegrationStatus.NEEDS_ATTENTION]: 'Requiere atención',
  [IntegrationStatus.DISCONNECTED]: 'No conectado',
} as const;

export default async function IntegracionesPage() {
  const user = await requireCurrentUser();
  const accounts = await prisma.channelAccount.findMany({ where: { workspaceId: user.workspace.id }, select: { id: true, channel: true, externalAccountId: true, displayName: true, status: true, metadata: true } });
  const integrations = await getIntegrations();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Integraciones" subtitle="Canales y servicios conectados al CRM" />
      <div className="grid flex-1 content-start gap-4 overflow-y-auto px-4 pb-8 pt-2 sm:px-8 lg:grid-cols-2">
        <IntegrationCards accounts={accounts} demo={isLocalDemo()} canManage={canManageChannels(user.role)} />
        <WhatsAppIntegrationCard />
        <MercadoPagoIntegrationCard />
        {integrations
          .filter((integration) => integration.provider !== 'WHATSAPP' && integration.provider !== 'MERCADO_PAGO')
          .map((integration) => (
            <Card key={integration.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>{integration.name}</CardTitle>
                  <Badge variant={statusVariant[integration.status]}>{statusLabel[integration.status]}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-[13px] text-ash">
                <p>
                  Última sincronización:{' '}
                  {integration.lastSyncAt
                    ? integration.lastSyncAt.toLocaleString('es-CL')
                    : 'Sin sincronizar'}
                </p>
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  );
}
