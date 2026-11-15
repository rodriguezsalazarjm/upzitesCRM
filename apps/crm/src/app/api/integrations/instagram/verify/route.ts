import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { prisma } from '@/lib/prisma';
import { getValidInstagramAccessToken } from '@/lib/instagram/token-lifecycle';
import { verifyInstagramConnection } from '@/lib/instagram/webhook-subscription';

export const dynamic = 'force-dynamic';

/** "Verificar conexion": nunca devuelve el token, solo el resultado. */
export async function POST(request: Request) {
  const user = await requireCurrentUser();
  if (!canManageChannels(user.role)) {
    return NextResponse.json({ message: 'Solo el owner o un admin puede verificar Instagram.' }, { status: 403 });
  }

  const { channelAccountId } = (await request.json().catch(() => ({}))) as { channelAccountId?: string };
  const account = await prisma.channelAccount.findFirst({
    where: { id: channelAccountId ?? '', workspaceId: user.workspace.id, channel: 'INSTAGRAM' },
  });
  if (!account) return NextResponse.json({ message: 'Cuenta no encontrada.' }, { status: 404 });

  const token = await getValidInstagramAccessToken(account.id);
  if (!token.ok) return NextResponse.json({ ok: false, message: token.reason }, { status: 200 });

  const result = await verifyInstagramConnection({ channelAccountId: account.id, accessToken: token.accessToken });
  if (!result.ok) return NextResponse.json({ ok: false, message: result.reason });
  return NextResponse.json({ ok: true });
}
