import { Sidebar } from '@/components/layout/sidebar';
import { SupportBanner } from '@/components/layout/support-banner';
import { WorkspaceSync } from '@/components/layout/workspace-sync';
import { requireCurrentUser } from '@/lib/auth';
import { ExpiredBanner } from '@/components/billing/expired-banner';
import { GraceBanner } from '@/components/billing/grace-banner';
import { SubscriptionSuspended } from '@/components/billing/subscription-suspended';
import { PLAN_CATALOG } from '@/lib/billing/plan-catalog';
import { DEV_DEMO_USER } from '@/lib/dev-demo';
import { listMyWorkspaces } from '@/lib/membership';
import { isPlatformAdmin } from '@/lib/platform-admin';
import { getSubscriptionStatus } from '@/lib/subscription';
import { requireWorkspaceContext } from '@/lib/workspace-context';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCurrentUser();
  const ctx = await requireWorkspaceContext();
  const isDemo = user.id === DEV_DEMO_USER.id;
  const [subscription, platformAdmin, workspaces] = await Promise.all([
    isDemo
      ? { isActive: true, state: 'ACTIVE' as const, expiresAt: null, graceEndsAt: null, snapshot: null }
      : getSubscriptionStatus(user.workspace.id),
    isDemo ? false : isPlatformAdmin(user.id),
    isDemo ? [] : listMyWorkspaces(user.id),
  ]);

  const supportBanner = ctx.supportSession && (
    <SupportBanner
      workspaceName={ctx.workspace.name}
      mode={ctx.supportSession.mode}
      expiresAt={ctx.supportSession.expiresAt.toISOString()}
    />
  );

  // Solo la suspension administrativa bloquea la app. Un plan vencido sigue
  // funcionando con los limites de FREE (P0-B).
  if (!subscription.isActive) {
    return (
      <>
        {supportBanner}
        <SubscriptionSuspended workspaceName={user.workspace.name} />
      </>
    );
  }

  const configuredPlan = subscription.snapshot?.configuredPlan;
  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <WorkspaceSync workspaceId={user.workspace.id} />
      <Sidebar user={user} isPlatformAdmin={platformAdmin} workspaces={workspaces} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {supportBanner}
        {subscription.state === 'GRACE' && subscription.graceEndsAt && (
          <GraceBanner graceEndsAt={subscription.graceEndsAt.toISOString()} />
        )}
        {subscription.state === 'EXPIRED' && (
          <ExpiredBanner planName={configuredPlan ? PLAN_CATALOG[configuredPlan].name : null} />
        )}
        {children}
      </main>
    </div>
  );
}
