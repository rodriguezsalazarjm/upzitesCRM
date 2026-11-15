import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { CampaignRoutesManager } from '@/components/whatsapp-channels/campaign-routes-manager';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { campaignRouteMetrics, listCampaignRoutes } from '@/lib/whatsapp/campaign-routes';
import { channelOptions } from '@/lib/whatsapp/channel-manager';

export const dynamic = 'force-dynamic';

/** Punto 9: reglas de campaña (anuncio → conjunto → campaña → número → workspace). */
export default async function CampaignRoutesPage() {
  const user = await requireCurrentUser();
  const workspaceId = user.workspace.id;
  const [routes, options, metrics] = await Promise.all([listCampaignRoutes(workspaceId), channelOptions(workspaceId), campaignRouteMetrics(workspaceId)]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Reglas de campaña" subtitle="Canales · WhatsApp" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-5">
          <Button variant="ghost" size="sm" asChild className="-ml-3">
            <Link href="/canales/whatsapp">
              <ArrowLeft strokeWidth={1.75} /> Volver a WhatsApp
            </Link>
          </Button>
          <p className="text-xs text-graphite">
            Cuando alguien escribe desde un anuncio Click-to-WhatsApp, Meta envía el ID del anuncio. Si coincide con una regla, la conversación
            carga su producto, agente y automatización. Meta no envía el conjunto ni la campaña: esas reglas solo aplican cuando ese dato
            esté disponible. Sin coincidencia se usa la configuración del número.
          </p>
          <CampaignRoutesManager
            routes={routes}
            metrics={metrics}
            options={{ agents: options.agents, products: options.products, flows: options.flows }}
            canManage={canManageChannels(user.role)}
          />
        </div>
      </div>
    </div>
  );
}
