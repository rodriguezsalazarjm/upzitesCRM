import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { isEncryptionConfigured } from '@/lib/crypto';
import { prisma } from '@/lib/prisma';
import { getTikTokOAuthConfig, missingTikTokScopes } from '@/lib/tiktok/oauth';

export const dynamic = 'force-dynamic';

/** P29: cuentas de creador conectadas por Login Kit (la mensajería de TikTok es otra cosa y sigue sin aprobación). */
export async function GET() {
  const user = await requireCurrentUser();
  const accounts = await prisma.channelAccount.findMany({
    where: { workspaceId: user.workspace.id, channel: 'TIKTOK', connectionMethod: 'OAUTH' },
    select: { id: true, externalAccountId: true, displayName: true, status: true, capabilities: true, connectedAt: true, lastVerifiedAt: true, scopes: true, lastError: true },
  });
  return NextResponse.json({
    data: accounts.map((account) => ({ ...account, missingScopes: missingTikTokScopes(account.scopes) })),
    canManage: canManageChannels(user.role),
    configured: Boolean(getTikTokOAuthConfig()) && isEncryptionConfigured(),
  });
}
