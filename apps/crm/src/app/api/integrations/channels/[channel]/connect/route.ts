import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Channel, ChannelAccountStatus, ChannelConnectionMethod } from '../../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { EncryptionKeyMissingError, encryptSecret } from '@/lib/crypto';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';

const connectSchema = z.object({
  externalAccountId: z.string().min(1),
  displayName: z.string().max(200).optional(),
  accessToken: z.string().min(10).max(4096),
});

/**
 * Conecta una cuenta de Instagram/Messenger/TikTok — MODO MANUAL/DEV: pegar
 * el id de cuenta y el token, igual que WhatsApp antes de tener Embedded
 * Signup. No hay una app de Meta/TikTok real todavia (ver informe: "ACCION
 * MANUAL META/TIKTOK REQUERIDA"), asi que no se intenta verificar el token
 * contra la API real — eso es lo primero que hay que endurecer en cuanto
 * exista una app de verdad.
 */
export async function POST(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  const { channel: channelParam } = await params;
  const channel = channelParam?.toUpperCase();
  if (!Object.values(Channel).includes(channel as Channel) || channel === Channel.WHATSAPP) {
    return NextResponse.json({ message: 'Canal no reconocido.' }, { status: 400 });
  }

  const user = await requireCurrentUser();
  if (!canManageChannels(user.role)) {
    return NextResponse.json({ message: 'Solo el owner o un admin puede conectar un canal.' }, { status: 403 });
  }

  const parsed = await parseBody(request, connectSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  let accessTokenEncrypted: string;
  try {
    accessTokenEncrypted = encryptSecret(input.accessToken);
  } catch (error) {
    if (error instanceof EncryptionKeyMissingError) {
      return NextResponse.json({ message: error.message }, { status: 503 });
    }
    throw error;
  }

  const taken = await prisma.channelAccount.findFirst({
    where: { channel: channel as Channel, externalAccountId: input.externalAccountId },
    select: { workspaceId: true },
  });
  if (taken && taken.workspaceId !== user.workspace.id) {
    return NextResponse.json({ message: 'Esa cuenta ya está conectada a otro workspace.' }, { status: 409 });
  }

  const account = await prisma.$transaction(async (tx) => {
    const saved = await tx.channelAccount.upsert({
      where: { channel_externalAccountId: { channel: channel as Channel, externalAccountId: input.externalAccountId } },
      create: {
        workspaceId: user.workspace.id,
        channel: channel as Channel,
        connectionMethod: ChannelConnectionMethod.MANUAL,
        externalAccountId: input.externalAccountId,
        displayName: input.displayName ?? null,
        accessTokenEncrypted,
        status: ChannelAccountStatus.CONNECTED,
        connectedAt: new Date(),
        lastVerifiedAt: new Date(),
      },
      update: {
        displayName: input.displayName ?? null,
        accessTokenEncrypted,
        status: ChannelAccountStatus.CONNECTED,
        lastVerifiedAt: new Date(),
        lastErrorCode: null,
        lastError: null,
      },
      select: { id: true, channel: true, displayName: true, externalAccountId: true, status: true, connectedAt: true },
    });

    await recordAudit(
      {
        workspaceId: user.workspace.id,
        actorId: user.id,
        action: taken ? 'channel.credentials_updated' : 'channel.connected',
        entity: 'ChannelAccount',
        entityId: saved.id,
        metadata: { channel, externalAccountId: input.externalAccountId },
      },
      tx,
    );

    return saved;
  });

  return NextResponse.json({ data: account }, { status: 201 });
}
