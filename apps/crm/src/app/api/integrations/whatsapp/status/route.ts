import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { isEncryptionConfigured } from '@/lib/crypto';
import { parseBody } from '@/lib/http';
import { channelRoute } from '@/lib/whatsapp/channel-http';
import { listChannels, verifyChannel } from '@/lib/whatsapp/channel-manager';
import { embeddedSignupConfig } from '@/lib/whatsapp/embedded-signup';

export const dynamic = 'force-dynamic';

/** Numeros del workspace y lo que falta en el entorno. Nunca devuelve el token. */
export async function GET() {
  const user = await requireCurrentUser();
  const signup = embeddedSignupConfig();
  return NextResponse.json({
    data: await listChannels(user.workspace.id),
    canManage: canManageChannels(user.role),
    encryptionConfigured: isEncryptionConfigured(),
    verifyTokenConfigured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
    appSecretConfigured: Boolean(process.env.META_APP_SECRET),
    embeddedSignup: signup.enabled,
  });
}

const verifySchema = z.object({ channelId: z.string().min(1) });

/** Compatibilidad: vuelve a verificar un numero (ver /channels/[id]/verify). */
export async function POST(request: Request) {
  const parsed = await parseBody(request, verifySchema);
  if (!parsed.ok) return parsed.response;
  return channelRoute(async (actor) => {
    await verifyChannel(actor, parsed.data.channelId);
    return { ok: true };
  }, 200, (role) => canManageChannels(role));
}
