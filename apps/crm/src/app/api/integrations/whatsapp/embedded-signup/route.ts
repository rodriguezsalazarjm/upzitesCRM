import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { channelRoute } from '@/lib/whatsapp/channel-http';
import { assertCanConnect, recordChannelConnectFailure, saveVerifiedChannel } from '@/lib/whatsapp/channel-manager';
import { embeddedSignupConfig, exchangeEmbeddedSignupCode, registerPhoneNumber } from '@/lib/whatsapp/embedded-signup';
import { verifyAndSubscribeWhatsAppChannel } from '@/lib/whatsapp/meta';
import { canManageChannels } from '@/lib/conversations';

export const dynamic = 'force-dynamic';

/** Datos publicos para abrir Embedded Signup (o que falta para poder hacerlo). */
export async function GET() {
  await requireCurrentUser();
  return NextResponse.json({ data: embeddedSignupConfig() });
}

const signupSchema = z
  .object({
    code: z.string().min(10).max(2048),
    wabaId: z.string().regex(/^\d+$/),
    phoneNumberId: z.string().regex(/^\d+$/),
    /** PIN de verificacion en dos pasos para registrar un numero nuevo. */
    pin: z.string().regex(/^\d{6}$/, 'El PIN debe tener 6 dígitos.').optional(),
  })
  .strict();

/**
 * Cierre de Embedded Signup: el servidor cambia el code por un token de
 * negocio, comprueba contra Meta que el numero pertenece a la WABA autorizada
 * (los ids del navegador no se creen), suscribe la app y guarda el canal.
 */
export async function POST(request: Request) {
  const config = embeddedSignupConfig();
  if (!config.enabled) {
    return NextResponse.json({ message: 'La conexión con Meta no está configurada en este entorno.', missing: config.missing }, { status: 503 });
  }
  const parsed = await parseBody(request, signupSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  return channelRoute(async (actor) => {
    await assertCanConnect(actor, input.phoneNumberId);
    try {
      const accessToken = await exchangeEmbeddedSignupCode(input.code);
      if (input.pin) await registerPhoneNumber({ phoneNumberId: input.phoneNumberId, accessToken, pin: input.pin });
      const verified = await verifyAndSubscribeWhatsAppChannel({ wabaId: input.wabaId, phoneNumberId: input.phoneNumberId, accessToken });
      return await saveVerifiedChannel(actor, { wabaId: input.wabaId, accessToken, method: 'EMBEDDED_SIGNUP', verified });
    } catch (error) {
      await recordChannelConnectFailure(actor, input.phoneNumberId, error);
      throw error;
    }
  }, 201, (role) => canManageChannels(role));
}
