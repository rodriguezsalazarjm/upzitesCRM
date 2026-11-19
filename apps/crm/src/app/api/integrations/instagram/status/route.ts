import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { isEncryptionConfigured } from '@/lib/crypto';
import { prisma } from '@/lib/prisma';
import { getInstagramOAuthConfig, missingInstagramScopes } from '@/lib/instagram/oauth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireCurrentUser();
  const accounts = await prisma.channelAccount.findMany({
    where: { workspaceId: user.workspace.id, channel: 'INSTAGRAM' },
    select: { id: true, externalAccountId: true, displayName: true, status: true, capabilities: true, connectedAt: true, lastVerifiedAt: true, scopes: true, metadata: true, lastError: true },
  });
  const real = accounts.filter((a) => !(a.metadata as { fake?: boolean } | null)?.fake);
  // P28: evidencia de que el canal funciona de verdad, no solo que hay token.
  const data = await Promise.all(
    real.map(async ({ metadata: _metadata, ...account }) => {
      const lastEvent = (types: ('DM_RECEIVED' | 'COMMENT')[]) =>
        prisma.channelEvent.findFirst({ where: { channelAccountId: account.id, type: { in: types } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
      const [dm, comment, reply] = await Promise.all([
        lastEvent(['DM_RECEIVED']),
        lastEvent(['COMMENT']),
        prisma.message.findFirst({
          where: { conversation: { channelAccountId: account.id }, direction: 'OUTBOUND', status: { in: ['SENT', 'DELIVERED', 'READ'] } },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
      ]);
      return {
        ...account,
        missingScopes: missingInstagramScopes(account.scopes),
        lastDmAt: dm?.createdAt ?? null,
        lastCommentAt: comment?.createdAt ?? null,
        lastReplyAt: reply?.createdAt ?? null,
      };
    }),
  );
  return NextResponse.json({
    data,
    canManage: canManageChannels(user.role),
    configured: Boolean(getInstagramOAuthConfig()) && isEncryptionConfigured() && Boolean(process.env.INSTAGRAM_VERIFY_TOKEN),
  });
}
