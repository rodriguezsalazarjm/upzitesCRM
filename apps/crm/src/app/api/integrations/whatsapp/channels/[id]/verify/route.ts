import { channelRoute } from '@/lib/whatsapp/channel-http';
import { verifyChannel } from '@/lib/whatsapp/channel-manager';
import { canManageChannels } from '@/lib/conversations';

type Params = { params: Promise<{ id: string }> };

/** Vuelve a verificar contra Meta con la credencial guardada (reconectar). */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  return channelRoute((actor) => verifyChannel(actor, id), 200, (role) => canManageChannels(role));
}
