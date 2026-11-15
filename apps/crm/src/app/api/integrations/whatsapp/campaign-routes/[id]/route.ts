import { campaignRouteSchema } from '@/lib/whatsapp/campaign-routing';
import { deleteCampaignRoute, updateCampaignRoute } from '@/lib/whatsapp/campaign-routes';
import { channelRoute } from '@/lib/whatsapp/channel-http';
import { parseBody } from '@/lib/http';
import { canManageChannels } from '@/lib/conversations';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const parsed = await parseBody(request, campaignRouteSchema);
  if (!parsed.ok) return parsed.response;
  return channelRoute((actor) => updateCampaignRoute(actor, id, parsed.data), 200, (role) => canManageChannels(role));
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  return channelRoute((actor) => deleteCampaignRoute(actor, id), 200, (role) => canManageChannels(role));
}
