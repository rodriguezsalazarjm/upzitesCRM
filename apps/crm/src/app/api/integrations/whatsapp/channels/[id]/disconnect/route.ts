import { channelRoute } from '@/lib/whatsapp/channel-http';
import { disconnectChannel } from '@/lib/whatsapp/channel-manager';
import { canManageChannels } from '@/lib/conversations';

type Params = { params: Promise<{ id: string }> };

/** Desconecta el numero: borra el token, conserva historial y configuracion. */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  return channelRoute((actor) => disconnectChannel(actor, id), 200, (role) => canManageChannels(role));
}
