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

  const updated = await prisma.whatsAppChannel.updateMany({
    where: { id: parsed.data.channelId, workspaceId: user.workspace.id },
    data: {
      status: WhatsAppChannelStatus.DISCONNECTED,
      accessTokenEncrypted: null,
      webhookSubscribedAt: null,
    },
  });

  if (updated.count === 0) {
    return NextResponse.json({ message: 'Canal no encontrado' }, { status: 404 });
  }

  await prisma.integration.updateMany({
    where: { workspaceId: user.workspace.id, provider: IntegrationProvider.WHATSAPP },
    data: { status: IntegrationStatus.DISCONNECTED },
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'whatsapp.channel_disconnected',
    entity: 'WhatsAppChannel',
    entityId: parsed.data.channelId,
  });

  return NextResponse.json({ ok: true });
}
