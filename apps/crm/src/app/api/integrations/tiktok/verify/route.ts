import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { prisma } from '@/lib/prisma';
import { fetchTikTokProfile, getValidTikTokAccessToken } from '@/lib/tiktok/oauth';

export const dynamic = 'force-dynamic';

/** "Verificar ahora": refresca el token si hace falta y confirma la identidad contra TikTok. Nunca devuelve el token. */
export async function POST(request: Request) {
  const user = await requireCurrentUser();
  if (!canManageChannels(user.role)) return NextResponse.json({ message: 'Solo el owner o un admin puede verificar TikTok.' }, { status: 403 });
  const { channelAccountId } = (await request.json().catch(() => ({}))) as { channelAccountId?: string };
  const account = await prisma.channelAccount.findFirst({ where: { id: channelAccountId ?? '', workspaceId: user.workspace.id, channel: 'TIKTOK' } });
  if (!account) return NextResponse.json({ message: 'Cuenta no encontrada.' }, { status: 404 });

  const token = await getValidTikTokAccessToken(account.id);
  if (!token.ok) return NextResponse.json({ ok: false, message: token.reason });
  try {
    const profile = await fetchTikTokProfile(token.accessToken);
    if (profile.openId !== account.externalAccountId) throw new Error('TikTok devolvió otra cuenta: reconecta.');
    await prisma.channelAccount.update({ where: { id: account.id }, data: { displayName: profile.displayName, status: 'CONNECTED', lastVerifiedAt: new Date(), lastErrorCode: null, lastError: null } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'error de red';
    await prisma.channelAccount.update({ where: { id: account.id }, data: { status: 'NEEDS_ATTENTION', lastErrorCode: 'VERIFY_FAILED', lastError: reason } });
    return NextResponse.json({ ok: false, message: reason });
  }
}
