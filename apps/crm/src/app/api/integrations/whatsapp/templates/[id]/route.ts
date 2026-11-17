import { canManageChannels } from '@/lib/conversations';
import { channelRoute } from '@/lib/whatsapp/channel-http';
import { setTemplateVariables } from '@/lib/whatsapp/templates';

type Params = { params: Promise<{ id: string }> };

/** P26: asigna un dato del CRM a cada {{n}} de una plantilla sincronizada. */
export async function PATCH(request: Request, { params }: Params) {
  const [{ id }, body] = await Promise.all([params, request.json().catch(() => null)]);
  return channelRoute((actor) => setTemplateVariables(actor, id, body), 200, (role) => canManageChannels(role));
}
