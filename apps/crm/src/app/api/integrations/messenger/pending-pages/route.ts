import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { MESSENGER_PENDING_COOKIE, decodeMessengerPendingSelection } from '@/lib/messenger/pending-selection';

export const dynamic = 'force-dynamic';

/** Lista las Pages pendientes de elegir. Nunca expone el access_token. */
export async function GET() {
  const user = await requireCurrentUser();
  const cookieStore = await cookies();
  const raw = cookieStore.get(MESSENGER_PENDING_COOKIE)?.value;
  const pending = raw ? decodeMessengerPendingSelection(raw) : null;

  if (!pending || pending.userId !== user.id || pending.workspaceId !== user.workspace.id) {
    return NextResponse.json({ pages: [] });
  }

  const connected = await prisma.channelAccount.findMany({
    where: { channel: 'MESSENGER', externalAccountId: { in: pending.pages.map((p) => p.id) } },
    select: { externalAccountId: true, workspaceId: true },
  });
  const connectedElsewhere = new Set(connected.filter((c) => c.workspaceId !== user.workspace.id).map((c) => c.externalAccountId));

  return NextResponse.json({
    pages: pending.pages.map((page) => ({ id: page.id, name: page.name, connectedElsewhere: connectedElsewhere.has(page.id) })),
  });
}
