import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Channel, ChannelAccountStatus } from '../../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';

const disconnectSchema = z.object({ channelAccountId: z.string().min(1) });

/**
 * Desconecta una cuenta y BORRA sus credenciales cifradas. Las conversaciones
 * y mensajes ya recibidos se conservan: desconectar no borra historial, solo
 * impide seguir enviando/recibiendo hasta reconectar.
 */
export async function POST(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  const { channel: channelParam } = await params;
  const channel = channelParam?.toUpperCase();
  if (!Object.values(Channel).includes(channel as Channel)) {
    return NextResponse.json({ message: 'Canal no reconocido.' }, { status: 400 });
  }

  const user = await requireCurrentUser();
  if (!canManageChannels(user.role)) {
    return NextResponse.json({ message: 'Solo el owner o un admin puede desconectar un canal.' }, { status: 403 });
  }

  const parsed = await parseBody(request, disconnectSchema);
  if (!parsed.ok) return parsed.response;

  const account = await prisma.channelAccount.findFirst({
    where: { id: parsed.data.channelAccountId, workspaceId: user.workspace.id, channel: channel as Channel },
    select: { id: true },
  });
  if (!account) return NextResponse.json({ message: 'Cuenta no encontrada.' }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.channelAccount.update({
      where: { id: account.id },
      data: {
        status: ChannelAccountStatus.DISCONNECTED,
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        accessTokenExpiresAt: null,
        lastErrorCode: null,
        lastError: null,
      },
    });
    await recordAudit(
      { workspaceId: user.workspace.id, actorId: user.id, action: 'channel.disconnected', entity: 'ChannelAccount', entityId: account.id },
      tx,
    );
  });

  return NextResponse.json({ ok: true });
}
