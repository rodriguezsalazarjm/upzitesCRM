import { NextResponse } from 'next/server';
import { ConversationStatus } from '../../../../generated/prisma/client';
import { listConversations } from '@/lib/conversations';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const assignedUserId = searchParams.get('assignedUserId');

  const data = await listConversations({
    status: status && status in ConversationStatus ? (status as ConversationStatus) : undefined,
    assignedUserId: assignedUserId ?? undefined,
    onlyUnread: searchParams.get('unread') === 'true',
  });

  return NextResponse.json({ data });
}
