import { Header } from '@/components/layout/header';
import { PlanLockedNotice } from '@/components/billing/plan-locked-notice';
import { TutorialHint } from '@/components/tutorials/tutorial-hint';
import { requireCurrentUser } from '@/lib/auth';
import { canManageMarketing } from '@/lib/marketing/roles';
import { prisma } from '@/lib/prisma';
import { INSTAGRAM_PUBLISH_SCOPE } from '@/lib/social/instagram-publish';
import { SocialPublisher, type PostRow } from './social-publisher';

export const dynamic = 'force-dynamic';

export default async function SocialPage() {
  const user = await requireCurrentUser();
  const workspaceId = user.workspace.id;
  const [accounts, posts] = await Promise.all([
    prisma.channelAccount.findMany({
      where: { workspaceId, channel: 'INSTAGRAM' },
      select: { id: true, displayName: true, externalAccountId: true, status: true, scopes: true, planLimitedAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.socialPost.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { channelAccount: { select: { displayName: true } } },
    }),
  ]);

  const rows: PostRow[] = posts.map((post) => ({
    id: post.id,
    network: post.network,
    channelAccountId: post.channelAccountId,
    accountName: post.channelAccount?.displayName ?? null,
    caption: post.caption,
    hashtags: post.hashtags,
    mediaUrl: post.mediaUrl,
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
        <SocialPublisher
          canManage={canManageMarketing(user.role)}
          accounts={accounts.map((account) => ({
            id: account.id,
            name: account.displayName ?? account.externalAccountId,
            ready: account.status === 'CONNECTED' && !account.planLimitedAt,
            canPublish: Boolean(account.scopes?.split(',').includes(INSTAGRAM_PUBLISH_SCOPE)),
          }))}
          posts={rows}
        />
      </div>
    </div>
  );
}
