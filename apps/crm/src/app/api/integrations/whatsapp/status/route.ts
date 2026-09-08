import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { isEncryptionConfigured } from '@/lib/crypto';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** Estado del canal. Nunca devuelve el token, ni cifrado. */
export async function GET() {
  const user = await requireCurrentUser();

  const channels = await prisma.whatsAppChannel.findMany({
    where: { workspaceId: user.workspace.id },
    select: {
      id: true,
      displayPhoneNumber: true,
      businessName: true,
      status: true,
      qualityRating: true,
      messagingLimit: true,
      webhookSubscribedAt: true,
      lastHealthCheckAt: true,
      accessTokenEncrypted: true,
    },
  });

  return NextResponse.json({
    data: channels.map(({ accessTokenEncrypted, ...channel }) => ({
      ...channel,
      hasToken: Boolean(accessTokenEncrypted),
    })),
    encryptionConfigured: isEncryptionConfigured(),
    verifyTokenConfigured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
    appSecretConfigured: Boolean(process.env.META_APP_SECRET),
  });
}
