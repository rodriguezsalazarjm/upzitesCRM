import { NextResponse } from 'next/server';
import { Channel } from '../../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** Estado de las cuentas conectadas de un canal. Nunca devuelve el token. */
export async function GET(_request: Request, { params }: { params: Promise<{ channel: string }> }) {
  const { channel: channelParam } = await params;
  const channel = channelParam?.toUpperCase();
  if (!Object.values(Channel).includes(channel as Channel)) {
    return NextResponse.json({ message: 'Canal no reconocido.' }, { status: 400 });
  }

  const user = await requireCurrentUser();

  const accounts = await prisma.channelAccount.findMany({
    where: { workspaceId: user.workspace.id, channel: channel as Channel },
    select: {
      id: true,
      connectionMethod: true,
      externalAccountId: true,
      displayName: true,
      capabilities: true,
      status: true,
      connectedAt: true,
      lastVerifiedAt: true,
      lastErrorCode: true,
      lastError: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ data: accounts, canManage: canManageChannels(user.role) });
}
