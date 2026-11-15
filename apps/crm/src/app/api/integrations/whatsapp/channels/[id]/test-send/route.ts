import { z } from 'zod';
import { channelRoute } from '@/lib/whatsapp/channel-http';
import { testRecipients, testSend } from '@/lib/whatsapp/channel-manager';
import { parseBody } from '@/lib/http';
import { canManageChannels } from '@/lib/conversations';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const testSendSchema = z.object({ conversationId: z.string().min(1).max(64), text: z.string().trim().min(1).max(1000) }).strict();

/** Destinatarios validos: contactos que escribieron a este numero y siguen en ventana. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  return channelRoute(async (actor) => testRecipients(actor.workspaceId, id), 200, (role) => canManageChannels(role));
}

/** Envio de prueba autorizado, por el outbox normal. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const parsed = await parseBody(request, testSendSchema);
  if (!parsed.ok) return parsed.response;
  return channelRoute((actor) => testSend(actor, id, parsed.data), 202, (role) => canManageChannels(role));
}
