import { Header } from '@/components/layout/header';
import { PlanLockedNotice } from '@/components/billing/plan-locked-notice';
import { TutorialHint } from '@/components/tutorials/tutorial-hint';
import { requireCurrentUser } from '@/lib/auth';
import { canManageMarketing } from '@/lib/marketing/roles';
import { prisma } from '@/lib/prisma';
import { INSTAGRAM_PUBLISH_SCOPE } from '@/lib/social/instagram-publish';
import { TIKTOK_PUBLISH_SCOPE } from '@/lib/social/tiktok-publish';
import { assetFilePath } from '@/lib/social/library';
import { getSessionSecret } from '@/lib/session-token';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SocialPublisher, type PostRow } from './social-publisher';

export const dynamic = 'force-dynamic';

export default async function SocialPage({ searchParams }: { searchParams: Promise<{ pieza?: string }> }) {
  const user = await requireCurrentUser();
  const workspaceId = user.workspace.id;
  const { pieza } = await searchParams;
  const secret = getSessionSecret();
  const [accounts, tiktokAccounts, posts, assets] = await Promise.all([
    prisma.channelAccount.findMany({
      where: { workspaceId, channel: 'INSTAGRAM' },
      select: { id: true, displayName: true, externalAccountId: true, status: true, scopes: true, planLimitedAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    // P29: cuentas de creador (Login Kit), no las de mensajería.
    prisma.channelAccount.findMany({
      where: { workspaceId, channel: 'TIKTOK', connectionMethod: 'OAUTH', status: { not: 'DISCONNECTED' } },
      select: { id: true, displayName: true, externalAccountId: true, status: true, scopes: true, planLimitedAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.socialPost.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      // shortcut: los 300 más recientes alcanzan para meses de calendario; paginar por rango si un negocio publica mucho más.
      take: 300,
      include: { channelAccount: { select: { displayName: true } }, contentAsset: { select: { tags: true } } },
    }),
    prisma.contentAsset.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, name: true, kind: true, caption: true, hashtags: true } }),
  ]);

  const rows: PostRow[] = posts.map((post) => ({
    id: post.id,
    network: post.network,
    channelAccountId: post.channelAccountId,
    accountName: post.channelAccount?.displayName ?? null,
    caption: post.caption,
    hashtags: post.hashtags,
    // Con pieza de la biblioteca se muestra por la ruta firmada relativa (mismo origen).
    mediaUrl: post.contentAssetId ? assetFilePath(post.contentAssetId, secret) : post.mediaUrl,
    contentAssetId: post.contentAssetId,
    assetTags: post.contentAsset?.tags ?? [],
    mediaType: post.mediaType,
    status: post.status,
    scheduledAt: post.scheduledAt?.toISOString() ?? null,
    nextAttemptAt: post.nextAttemptAt?.toISOString() ?? null,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    permalink: post.permalink,
    attempts: post.attempts,
    lastError: post.lastError,
    history: Array.isArray(post.history) ? (post.history as PostRow['history']) : [],
  }));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Social" subtitle="Prepara, programa y publica contenido en tus redes" />
      <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
        <TutorialHint tutorialKey="social.first_visit" />
        <PlanLockedNotice workspaceId={workspaceId} feature="channels.messaging" />
        <Button variant="outline" size="sm" asChild>
          <Link href="/social/biblioteca">Biblioteca de contenido</Link>
        </Button>
        <SocialPublisher
          canManage={canManageMarketing(user.role)}
          accounts={accounts.map((account) => ({
            id: account.id,
            name: account.displayName ?? account.externalAccountId,
            ready: account.status === 'CONNECTED' && !account.planLimitedAt,
            canPublish: Boolean(account.scopes?.split(',').includes(INSTAGRAM_PUBLISH_SCOPE)),
          }))}
          tiktokAccounts={tiktokAccounts.map((account) => ({
            id: account.id,
            name: account.displayName ?? 'TikTok',
            ready: account.status === 'CONNECTED' && !account.planLimitedAt,
            canPublish: Boolean(account.scopes?.split(',').includes(TIKTOK_PUBLISH_SCOPE)),
          }))}
          posts={rows}
          assets={assets.map((asset) => ({ ...asset, url: assetFilePath(asset.id, secret) }))}
          initialAssetId={pieza}
        />
      </div>
    </div>
  );
}
