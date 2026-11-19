import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { disconnectChannelAccount } from '@/lib/channels/lifecycle';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await requireCurrentUser();
  if (!canManageChannels(user.role)) {
    return NextResponse.json({ message: 'Solo el owner o un admin puede desconectar TikTok.' }, { status: 403 });
  }
  const { channelAccountId } = (await request.json().catch(() => ({}))) as { channelAccountId?: string };
  if (!channelAccountId) return NextResponse.json({ message: 'Falta channelAccountId.' }, { status: 400 });

  try {
    await disconnectChannelAccount({ workspaceId: user.workspace.id, channelAccountId, actorId: user.id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : 'error desconocido' }, { status: 404 });
  }
}
