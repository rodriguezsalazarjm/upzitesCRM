import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  IntegrationProvider,
  IntegrationStatus,
  WhatsAppChannelStatus,
} from '../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';

const disconnectSchema = z.object({
  channelId: z.string().min(1),
});

/**
 * Desconecta el canal y BORRA el token cifrado. El historial de conversaciones
 * se conserva: desconectar no es lo mismo que borrar los datos del cliente.
 */
export async function POST(request: Request) {
  const user = await requireCurrentUser();

  if (!canManageChannels(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede desconectar un numero.' },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, disconnectSchema);
  if (!parsed.ok) return parsed.response;

  const channel = await prisma.whatsAppChannel.findFirst({
    where: { id: parsed.data.channelId, workspaceId: user.workspace.id },
    select: { id: true },
  });
  if (!channel) return NextResponse.json({ message: 'Canal no encontrado' }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.whatsAppChannel.update({
      where: { id: channel.id, workspaceId: user.workspace.id },
      data: {
        status: WhatsAppChannelStatus.DISCONNECTED,
        accessTokenEncrypted: null,
        webhookSubscribedAt: null,
        lastHealthCheckAt: null,
      },
    });

    const otherConnected = await tx.whatsAppChannel.count({
      where: {
        workspaceId: user.workspace.id,
        id: { not: channel.id },
        status: WhatsAppChannelStatus.CONNECTED,
      },
    });
    await tx.integration.updateMany({
      where: { workspaceId: user.workspace.id, provider: IntegrationProvider.WHATSAPP },
      data: {
        status: otherConnected > 0 ? IntegrationStatus.CONNECTED : IntegrationStatus.DISCONNECTED,
      },
    });

    await recordAudit(
      {
        workspaceId: user.workspace.id,
        actorId: user.id,
        action: 'whatsapp.channel_disconnected',
        entity: 'WhatsAppChannel',
        entityId: channel.id,
      },
      tx,
    );
  });

  return NextResponse.json({ ok: true });
}
