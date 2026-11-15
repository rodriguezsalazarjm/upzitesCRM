import { z } from 'zod';
import { parseBody } from '@/lib/http';
import { channelRoute } from '@/lib/whatsapp/channel-http';
import { assertCanConnect, recordChannelConnectFailure, saveVerifiedChannel } from '@/lib/whatsapp/channel-manager';
import { verifyAndSubscribeWhatsAppChannel } from '@/lib/whatsapp/meta';
import { canManageChannels } from '@/lib/conversations';

const connectSchema = z.object({
  wabaId: z.string().regex(/^\d+$/, 'WABA ID debe contener solo numeros.'),
  phoneNumberId: z.string().regex(/^\d+$/, 'Phone Number ID debe contener solo numeros.'),
  displayPhoneNumber: z.string().min(1),
  businessName: z.string().optional(),
  accessToken: z.string().min(20, 'El token de Meta no parece completo.').max(4096),
});

/**
 * Conexion manual de un numero (pilotos y entornos sin Embedded Signup).
 *
 * El camino preferido es Embedded Signup (Punto 8): el cliente autoriza en
 * Meta y nunca copia un token. Este formulario queda para pilotos asistidos;
 * el token viaja una vez, se guarda cifrado y nunca se devuelve.
 */
export async function POST(request: Request) {
  const parsed = await parseBody(request, connectSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  return channelRoute(async (actor) => {
    // `channels.max` y la propiedad del numero se deciden antes de hablar con Meta.
    await assertCanConnect(actor, input.phoneNumberId);
    try {
      const verified = await verifyAndSubscribeWhatsAppChannel(input);
      return await saveVerifiedChannel(actor, { wabaId: input.wabaId, accessToken: input.accessToken, businessName: input.businessName, method: 'MANUAL', verified });
    } catch (error) {
      await recordChannelConnectFailure(actor, input.phoneNumberId, error);
      throw error;
    }
  }, 201, (role) => canManageChannels(role));
}
