import { Sidebar } from '@/components/layout/sidebar';
import { requireCurrentUser } from '@/lib/auth';
import { GraceBanner } from '@/components/billing/grace-banner';
import { SubscriptionExpired } from '@/components/billing/subscription-expired';
import { DEV_DEMO_USER } from '@/lib/dev-demo';
import { isPlatformAdmin } from '@/lib/platform-admin';
import { getSubscriptionStatus } from '@/lib/subscription';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCurrentUser();
  const isDemo = user.id === DEV_DEMO_USER.id;
  const [subscription, platformAdmin] = await Promise.all([
    isDemo
      ? { isActive: true, state: 'ACTIVE' as const, expiresAt: null, graceEndsAt: null }
      : getSubscriptionStatus(user.workspace.id),
    isDemo ? false : isPlatformAdmin(user.id),
  ]);

  if (!subscription.isActive) {
    return (
      <SubscriptionExpired
        workspaceName={user.workspace.name}
        expiresAt={subscription.expiresAt?.toISOString() ?? null}
      />
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <Sidebar user={user} isPlatformAdmin={platformAdmin} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {subscription.state === 'GRACE' && subscription.graceEndsAt && (
          <GraceBanner graceEndsAt={subscription.graceEndsAt.toISOString()} />
        )}
        {children}
      </main>
    </div>
  );
}
