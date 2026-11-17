import { canManageChannels } from '@/lib/conversations';
import { channelRoute } from '@/lib/whatsapp/channel-http';
import { submitTemplate } from '@/lib/whatsapp/templates';

/** P26: registra una plantilla nueva en Meta (queda en revision). */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return channelRoute((actor) => submitTemplate(actor, body), 201, (role) => canManageChannels(role));
}
