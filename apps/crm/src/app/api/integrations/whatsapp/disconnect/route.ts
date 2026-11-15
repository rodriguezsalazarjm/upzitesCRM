import { z } from 'zod';
import { parseBody } from '@/lib/http';
import { channelRoute } from '@/lib/whatsapp/channel-http';
import { disconnectChannel } from '@/lib/whatsapp/channel-manager';
import { canManageChannels } from '@/lib/conversations';

const disconnectSchema = z.object({
  channelId: z.string().min(1),
});

/**
 * Compatibilidad: la pantalla nueva usa /channels/[id]/disconnect. Misma
 * operacion (borra el token, conserva historial y configuracion).
 */
export async function POST(request: Request) {
  const parsed = await parseBody(request, disconnectSchema);
  if (!parsed.ok) return parsed.response;
  return channelRoute(async (actor) => {
    await disconnectChannel(actor, parsed.data.channelId);
    return { ok: true };
  }, 200, (role) => canManageChannels(role));
}
