import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CHANNEL_STATUS_LABEL } from '@/lib/whatsapp/channel-settings';
import { listChannels } from '@/lib/whatsapp/channel-manager';

/**
 * Resumen de WhatsApp en Integraciones. La administracion de numeros vive en
 * Canales → WhatsApp (Punto 8); aqui solo se muestra el estado y el acceso.
 */
export async function WhatsAppChannelsSummary({ workspaceId }: { workspaceId: string }) {
  const channels = await listChannels(workspaceId);
  const connected = channels.filter((channel) => channel.displayStatus === 'CONNECTED').length;
  const attention = channels.filter((channel) => channel.displayStatus === 'ERROR' || channel.displayStatus === 'PERMISSION').length;
  const tone = attention > 0 ? CHANNEL_STATUS_LABEL.ERROR : connected > 0 ? CHANNEL_STATUS_LABEL.CONNECTED : CHANNEL_STATUS_LABEL.DISCONNECTED;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>WhatsApp Business</CardTitle>
          <Badge variant={tone.tone}>{attention > 0 ? 'Requiere atención' : tone.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-[13px] text-ash">
        <p>
          {channels.length === 0
            ? 'Sin números conectados.'
            : `${connected} de ${channels.length} ${channels.length === 1 ? 'número conectado' : 'números conectados'}${attention ? ` · ${attention} con error` : ''}.`}
        </p>
        <Link href="/canales/whatsapp" className="inline-flex items-center gap-1 text-xs font-semibold text-carbon hover:underline">
          Administrar números <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
