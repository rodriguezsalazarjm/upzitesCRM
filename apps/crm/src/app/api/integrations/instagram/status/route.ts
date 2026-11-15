import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { isEncryptionConfigured } from '@/lib/crypto';
import { prisma } from '@/lib/prisma';
import { getInstagramOAuthConfig } from '@/lib/instagram/oauth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireCurrentUser();
  const accounts = await prisma.channelAccount.findMany({
    where: { workspaceId: user.workspace.id, channel: 'INSTAGRAM' },
    select: { id: true, externalAccountId: true, displayName: true, status: true, capabilities: true, connectedAt: true, lastVerifiedAt: true, scopes: true, metadata: true },
  });
  return NextResponse.json({
    data: accounts.filter((a) => !(a.metadata as { fake?: boolean } | null)?.fake),
    canManage: canManageChannels(user.role),
    configured: Boolean(getInstagramOAuthConfig()) && isEncryptionConfigured() && Boolean(process.env.INSTAGRAM_VERIFY_TOKEN),
  });
}
