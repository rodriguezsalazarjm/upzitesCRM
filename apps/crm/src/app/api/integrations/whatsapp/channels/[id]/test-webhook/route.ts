import { channelRoute } from '@/lib/whatsapp/channel-http';
import { testWebhook } from '@/lib/whatsapp/channel-manager';
import { canManageChannels } from '@/lib/conversations';

type Params = { params: Promise<{ id: string }> };

/** Consulta a Meta la suscripcion de la WABA y devuelve el ultimo evento real recibido. */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  return channelRoute((actor) => testWebhook(actor, id), 200, (role) => canManageChannels(role));
}
