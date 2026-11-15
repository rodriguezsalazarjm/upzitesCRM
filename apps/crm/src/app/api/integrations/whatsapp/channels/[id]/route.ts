import { channelSettingsSchema } from '@/lib/whatsapp/channel-settings';
import { channelRoute } from '@/lib/whatsapp/channel-http';
import { getChannel, updateChannelSettings } from '@/lib/whatsapp/channel-manager';
import { parseBody } from '@/lib/http';
import { canManageChannels } from '@/lib/conversations';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Detalle de un numero del workspace. Nunca incluye el token. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  return channelRoute((actor) => getChannel(actor.workspaceId, id));
}

/** Configuracion por numero (OWNER/ADMIN). */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const parsed = await parseBody(request, channelSettingsSchema);
  if (!parsed.ok) return parsed.response;
  return channelRoute((actor) => updateChannelSettings(actor, id, parsed.data), 200, (role) => canManageChannels(role));
}
