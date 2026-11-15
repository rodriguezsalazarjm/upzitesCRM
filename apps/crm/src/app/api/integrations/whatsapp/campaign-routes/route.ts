import { campaignRouteSchema } from '@/lib/whatsapp/campaign-routing';
import { createCampaignRoute, listCampaignRoutes } from '@/lib/whatsapp/campaign-routes';
import { channelRoute } from '@/lib/whatsapp/channel-http';
import { parseBody } from '@/lib/http';
import { canManageChannels } from '@/lib/conversations';

export const dynamic = 'force-dynamic';

/** Punto 9: reglas de campaña del workspace. */
export async function GET() {
  return channelRoute((actor) => listCampaignRoutes(actor.workspaceId));
}

export async function POST(request: Request) {
  const parsed = await parseBody(request, campaignRouteSchema);
  if (!parsed.ok) return parsed.response;
  return channelRoute((actor) => createCampaignRoute(actor, parsed.data), 201, (role) => canManageChannels(role));
}
