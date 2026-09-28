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
import { entitlementSnapshot, usageFor } from '@/lib/entitlements';
import { ContactsLimitBanner } from '@/components/billing/contacts-limit-banner';
import type { FeatureKey } from '@/lib/entitlements/config';
import { requireWorkspaceContext } from '@/lib/workspace-context';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCurrentUser();
  const ctx = await requireWorkspaceContext();
  const isDemo = user.id === DEV_DEMO_USER.id;
  const [subscription, platformAdmin, workspaces, entitlements, contactsUsage] = await Promise.all([
    isDemo
      ? { isActive: true, state: 'ACTIVE' as const, expiresAt: null, graceEndsAt: null, snapshot: null }
      : getSubscriptionStatus(user.workspace.id),
    isDemo ? false : isPlatformAdmin(user.id),
    isDemo ? [] : listMyWorkspaces(user.id),
    isDemo ? null : entitlementSnapshot(user.workspace.id),
    isDemo ? null : usageFor(user.workspace.id, 'contacts'),
  ]);
  const contactsLimit = entitlements?.limits['contacts.max'] ?? null;

  // D6: lo que el PLAN no incluye se muestra bloqueado ("Disponible en Pro").
  const lockedFeatures: Partial<Record<FeatureKey, string>> = {};
  for (const [key, feature] of Object.entries(entitlements?.features ?? {}) as [FeatureKey, { allowed: boolean; requiredPlan: keyof typeof PLAN_CATALOG | null }][]) {
    if (!feature.allowed && feature.requiredPlan) lockedFeatures[key] = PLAN_CATALOG[feature.requiredPlan].name;
  }

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
      <Sidebar user={user} isPlatformAdmin={platformAdmin} workspaces={workspaces} lockedFeatures={lockedFeatures} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {supportBanner}
        {subscription.state === 'GRACE' && subscription.graceEndsAt && (
          <GraceBanner graceEndsAt={subscription.graceEndsAt.toISOString()} />
        )}
        {contactsUsage !== null && contactsLimit !== null && entitlements?.state !== 'SUSPENDED' && contactsUsage >= contactsLimit && (
          <ContactsLimitBanner usage={contactsUsage} limit={contactsLimit} />
        )}
        {subscription.state === 'EXPIRED' && (
          <ExpiredBanner planName={configuredPlan ? PLAN_CATALOG[configuredPlan].name : null} />
        )}
        {children}
      </main>
    </div>
  );
}
