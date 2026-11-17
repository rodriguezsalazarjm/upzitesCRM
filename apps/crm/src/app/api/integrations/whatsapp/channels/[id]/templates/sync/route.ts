import { canManageChannels } from '@/lib/conversations';
import { channelRoute } from '@/lib/whatsapp/channel-http';
import { syncTemplates } from '@/lib/whatsapp/templates';

type Params = { params: Promise<{ id: string }> };

/** P26: trae de Meta las plantillas del numero y su estado. */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  return channelRoute((actor) => syncTemplates(actor, id), 200, (role) => canManageChannels(role));
}
