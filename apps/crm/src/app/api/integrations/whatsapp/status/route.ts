import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { decryptSecret, isEncryptionConfigured } from '@/lib/crypto';
import { recordAudit } from '@/lib/domain/audit';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import {
  IntegrationProvider,
  IntegrationStatus,
  WhatsAppChannelStatus,
} from '../../../../../../generated/prisma/client';
import { parseBody } from '@/lib/http';
import { MetaWhatsAppError, verifyAndSubscribeWhatsAppChannel } from '@/lib/whatsapp/meta';

export const dynamic = 'force-dynamic';

/** Estado del canal. Nunca devuelve el token, ni cifrado. */
export async function GET() {
  const user = await requireCurrentUser();

  const [channels, inboundByChannel] = await Promise.all([
    prisma.whatsAppChannel.findMany({
      where: { workspaceId: user.workspace.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        wabaId: true,
        phoneNumberId: true,
        displayPhoneNumber: true,
        businessName: true,
        status: true,
        qualityRating: true,
        messagingLimit: true,
        webhookSubscribedAt: true,
        lastHealthCheckAt: true,
        accessTokenEncrypted: true,
      },
    }),
    prisma.conversation.groupBy({
      by: ['channelId'],
      where: { workspaceId: user.workspace.id, lastInboundAt: { not: null } },
      _max: { lastInboundAt: true },
    }),
  ]);
  const inbound = new Map(inboundByChannel.map((row) => [row.channelId, row._max.lastInboundAt]));

  return NextResponse.json({
    data: channels.map(({ accessTokenEncrypted, ...channel }) => ({
      ...channel,
      saved: true,
      hasToken: Boolean(accessTokenEncrypted),
      credentialsVerified: channel.lastHealthCheckAt !== null,
      webhookSubscribed: channel.webhookSubscribedAt !== null,
      lastInboundAt: inbound.get(channel.id) ?? null,
    })),
    canManage: canManageChannels(user.role),
    encryptionConfigured: isEncryptionConfigured(),
    verifyTokenConfigured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
    appSecretConfigured: Boolean(process.env.META_APP_SECRET),
  });
}

const verifySchema = z.object({ channelId: z.string().min(1) });

/** Vuelve a comprobar credenciales y suscripcion usando el token cifrado. */
export async function POST(request: Request) {
  const user = await requireCurrentUser();
  if (!canManageChannels(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede verificar el canal.' },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, verifySchema);
  if (!parsed.ok) return parsed.response;

  const channel = await prisma.whatsAppChannel.findFirst({
    where: { id: parsed.data.channelId, workspaceId: user.workspace.id },
    select: { id: true, wabaId: true, phoneNumberId: true, accessTokenEncrypted: true },
  });
  if (!channel) return NextResponse.json({ message: 'Canal no encontrado.' }, { status: 404 });
  if (!channel.accessTokenEncrypted) {
    return NextResponse.json({ message: 'El canal no tiene un token guardado.' }, { status: 409 });
  }

  let accessToken: string;
  try {
    accessToken = decryptSecret(channel.accessTokenEncrypted);
  } catch {
    return NextResponse.json(
      { message: 'No se pudo abrir el token guardado. Reemplazalo con una credencial nueva.' },
      { status: 503 },
    );
  }

  let verified;
  try {
    verified = await verifyAndSubscribeWhatsAppChannel({
      wabaId: channel.wabaId,
      phoneNumberId: channel.phoneNumberId,
      accessToken,
    });
  } catch (error) {
    if (error instanceof MetaWhatsAppError) {
      if (error.code !== 'META_UNAVAILABLE') {
        await prisma.$transaction(async (tx) => {
          await tx.whatsAppChannel.updateMany({
            where: { id: channel.id, workspaceId: user.workspace.id },
            data: { status: WhatsAppChannelStatus.NEEDS_ATTENTION },
          });
          await tx.integration.updateMany({
            where: { workspaceId: user.workspace.id, provider: IntegrationProvider.WHATSAPP },
            data: { status: IntegrationStatus.NEEDS_ATTENTION },
          });
          await recordAudit(
            {
              workspaceId: user.workspace.id,
              actorId: user.id,
              action: 'whatsapp.verification_failed',
              entity: 'WhatsAppChannel',
              entityId: channel.id,
              metadata: { code: error.code },
            },
            tx,
          );
        });
      }
      return NextResponse.json(
        { message: error.message, code: error.code },
        { status: error.httpStatus },
      );
    }
    throw error;
  }

  await prisma.$transaction(async (tx) => {
    await tx.whatsAppChannel.update({
      where: { id: channel.id, workspaceId: user.workspace.id },
      data: {
        displayPhoneNumber: verified.displayPhoneNumber,
        businessName: verified.verifiedName ?? undefined,
        qualityRating: verified.qualityRating,
        status: WhatsAppChannelStatus.CONNECTED,
        lastHealthCheckAt: verified.verifiedAt,
        webhookSubscribedAt: verified.subscribedAt,
      },
    });
    await tx.integration.updateMany({
      where: { workspaceId: user.workspace.id, provider: IntegrationProvider.WHATSAPP },
      data: { status: IntegrationStatus.CONNECTED, lastSyncAt: verified.verifiedAt },
    });
    await recordAudit(
      {
        workspaceId: user.workspace.id,
        actorId: user.id,
        action: 'whatsapp.credentials_verified',
        entity: 'WhatsAppChannel',
        entityId: channel.id,
        metadata: { phoneNumberId: channel.phoneNumberId, wabaId: channel.wabaId },
      },
      tx,
    );
  });

  return NextResponse.json({ ok: true });
}
