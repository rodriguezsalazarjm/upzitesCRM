import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { decryptSecret } from '@/lib/crypto';
import { prisma } from '@/lib/prisma';
import { verifyMessengerConnection } from '@/lib/messenger/webhook-subscription';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await requireCurrentUser();
  if (!canManageChannels(user.role)) {
    return NextResponse.json({ message: 'Solo el owner o un admin puede verificar Messenger.' }, { status: 403 });
  }

  const { channelAccountId } = (await request.json().catch(() => ({}))) as { channelAccountId?: string };
  const account = await prisma.channelAccount.findFirst({
    where: { id: channelAccountId ?? '', workspaceId: user.workspace.id, channel: 'MESSENGER' },
  });
  if (!account?.accessTokenEncrypted) return NextResponse.json({ message: 'Cuenta no encontrada.' }, { status: 404 });

  const result = await verifyMessengerConnection({
    channelAccountId: account.id,
    pageAccessToken: decryptSecret(account.accessTokenEncrypted),
  });
  if (!result.ok) return NextResponse.json({ ok: false, message: result.reason });
  return NextResponse.json({ ok: true });
}
