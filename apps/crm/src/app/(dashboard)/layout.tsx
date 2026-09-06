import { Sidebar } from '@/components/layout/sidebar';
import { requireCurrentUser } from '@/lib/auth';
import { SubscriptionExpired } from '@/components/billing/subscription-expired';
import { DEV_DEMO_USER } from '@/lib/dev-demo';
import { getSubscriptionStatus } from '@/lib/subscription';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCurrentUser();
  const subscription = user.id === DEV_DEMO_USER.id
    ? { isActive: true, expiresAt: null }
    : await getSubscriptionStatus(user.workspace.id);

  if (!subscription.isActive) {
    return (
      <SubscriptionExpired
        workspaceName={user.workspace.name}
        expiresAt={subscription.expiresAt?.toISOString() ?? null}
      />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar user={user} />
      <main className="flex flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
