import { ChannelAccountStatus, Channel, JourneyStatus, JourneyTrigger, AutomationFlowStatus, MembershipStatus, WhatsAppChannelStatus, WorkspaceRole } from '../../generated/prisma/enums';
import { PLAN_CATALOG } from './billing/plan-catalog';
import { WIDGET_REGISTRY } from './dashboard/widgets/registry';
import { resolveDashboard, type ResolvedDashboard } from './dashboard/widgets/layout';
import type { WidgetData, WidgetId } from './dashboard/widgets/types';
import { entitlementSnapshot, type EntitlementSnapshot } from './entitlements';
import { FEATURE_KEYS, PLAN_ENTITLEMENTS, PLAN_ORDER, type FeatureKey, type LimitKey } from './entitlements/config';
import { resolveNavigation, type FeatureAccess, type ResolvedNavigation } from './navigation/resolve';
import { resolveChecklist, type ResolvedChecklist } from './onboarding-checklist/resolve';
import type { ChecklistRequirement, ChecklistTaskId } from './onboarding-checklist/tasks';
import { getPreference, type WorkspacePreference } from './preferences';
import { prisma } from './prisma';
import { reservingInvitationWhere } from './team/seats';
import { canonicalBusiness, type CanonicalBusiness } from './workspace-profile/business';
import { resolvePreset, type ResolvedPreset } from './workspace-presets';

/**
 * Experiencia adaptativa de UN usuario en UN workspace (P0-E). Junta las
 * cuatro dimensiones sin mezclarlas:
 *
 *   PLAN (entitlements)  → disponible / bloqueado  (autoridad final)
 *   ROL                  → visible / administrable
 *   PERFIL DE NEGOCIO    → preset: relevancia y prioridad
 *   PREFERENCIAS         → orden, ocultos, sidebar, dashboard (USUARIO x WORKSPACE)
 *
 * `workspaceId`, `userId` y `role` vienen del contexto verificado.
 */

export type ExperienceScope = { workspaceId: string; userId: string; role: WorkspaceRole };

export function featureAccessFrom(snapshot: Pick<EntitlementSnapshot, 'features'>): Record<FeatureKey, FeatureAccess> {
  return Object.fromEntries(
    FEATURE_KEYS.map((key) => {
      const feature = snapshot.features[key];
      return [key, { allowed: Boolean(feature?.allowed), requiredPlanName: feature?.requiredPlan ? PLAN_CATALOG[feature.requiredPlan].name : null }];
    }),
  ) as Record<FeatureKey, FeatureAccess>;
}

/** Primer plan a la venta cuyo limite alcanza `min`. */
export function requiredPlanNameForLimit(limit: LimitKey, min: number) {
  const plan = PLAN_ORDER.find((code) => PLAN_ENTITLEMENTS[code].limits[limit] >= min);
  return plan ? PLAN_CATALOG[plan].name : null;
}

export type WorkspaceExperience = {
  business: CanonicalBusiness;
  profile: {
    primaryGoal: string | null;
    teamSize: string | null;
    preferredChannels: string[];
    onboardingCompletedAt: Date | null;
  };
  preset: ResolvedPreset;
  features: Record<FeatureKey, FeatureAccess>;
  limits: EntitlementSnapshot['limits'];
  navigation: ResolvedNavigation;
  preference: WorkspacePreference;
};

export async function getWorkspaceExperience(scope: ExperienceScope): Promise<WorkspaceExperience> {
  const [profile, snapshot, preference] = await Promise.all([
    prisma.workspaceProfile.findUnique({ where: { workspaceId: scope.workspaceId } }),
    entitlementSnapshot(scope.workspaceId),
    getPreference({ userId: scope.userId, workspaceId: scope.workspaceId }),
  ]);
  const preset = resolvePreset(profile);
  const features = featureAccessFrom(snapshot);
  return {
    business: canonicalBusiness(profile),
    profile: {
      primaryGoal: profile?.primaryGoal ?? null,
      teamSize: profile?.teamSize ?? null,
      preferredChannels: profile?.preferredChannels ?? [],
      onboardingCompletedAt: profile?.onboardingCompletedAt ?? null,
    },
    preset,
    features,
    limits: snapshot.limits,
    navigation: resolveNavigation({ preset: preset.preset, features, role: scope.role, preference }),
    preference,
  };
}

// --- Checklist ------------------------------------------------------------------

/** Evidencia REAL de cada tarea (no casillas marcadas). */
export async function checklistEvidence(workspaceId: string): Promise<Record<ChecklistTaskId, boolean>> {
  const [profile, whatsapp, instagram, contacts, opportunities, quotes, products, recovery, rules, flows, members, invitations] = await Promise.all([
    prisma.workspaceProfile.findUnique({ where: { workspaceId }, select: { onboardingCompletedAt: true } }),
    prisma.whatsAppChannel.count({ where: { workspaceId, status: WhatsAppChannelStatus.CONNECTED } }),
    prisma.channelAccount.count({ where: { workspaceId, channel: Channel.INSTAGRAM, status: ChannelAccountStatus.CONNECTED } }),
    prisma.contact.count({ where: { workspaceId } }),
    prisma.opportunity.count({ where: { workspaceId } }),
    prisma.quote.count({ where: { workspaceId } }),
    prisma.product.count({ where: { workspaceId } }),
    prisma.journey.count({ where: { workspaceId, trigger: JourneyTrigger.CHECKOUT_ABANDONED, status: JourneyStatus.PUBLISHED } }),
    // Las reglas de sistema sembradas al crear el workspace no cuentan.
    prisma.automationRule.count({ where: { workspaceId, isActive: true, presetKey: null } }),
    prisma.automationFlow.count({ where: { workspaceId, status: AutomationFlowStatus.PUBLISHED } }),
    prisma.workspaceMembership.count({ where: { workspaceId, status: MembershipStatus.ACTIVE } }),
    // Solo invitaciones que aun reservan asiento (no vencidas): abrir la
    // pantalla o dejar vencer una invitacion no completa la tarea.
    prisma.workspaceInvitation.count({ where: reservingInvitationWhere(workspaceId, new Date()) }),
  ]);
  return {
    setup_profile: Boolean(profile?.onboardingCompletedAt),
    connect_whatsapp: whatsapp > 0,
    connect_instagram: instagram > 0,
    import_contacts: contacts > 0,
    create_opportunity: opportunities > 0,
    setup_quotes: quotes > 0,
    create_product: products > 0,
    setup_recovery: recovery > 0,
    create_automation: rules + flows > 0,
    invite_team: members > 1 || invitations > 0,
  };
}

export async function getChecklist(
  experience: Pick<WorkspaceExperience, 'preset' | 'features' | 'limits' | 'profile'>,
  scope: { workspaceId: string; role: WorkspaceRole },
): Promise<ResolvedChecklist> {
  const workspaceId = scope.workspaceId;
  const completed = await checklistEvidence(workspaceId);
  // Quien declaro trabajar solo no recibe "Invita a tu equipo" (queda notRelevant).
  const solo = experience.profile.teamSize === 'SOLO';
  return resolveChecklist({
    presetTasks: experience.preset.preset.onboardingChecklist.filter((id) => !(solo && id === 'invite_team')),
    completed,
    role: scope.role,
    access: (requirement: ChecklistRequirement) => {
      if ('feature' in requirement) return experience.features[requirement.feature];
      return {
        allowed: experience.limits[requirement.limit] >= requirement.min,
        requiredPlanName: requiredPlanNameForLimit(requirement.limit, requirement.min),
      };
    },
  });
}

// --- Dashboard ------------------------------------------------------------------

export type LoadedWidget = ResolvedDashboard['widgets'][number] & {
  title: string;
  description: string;
  emptyState: string;
  data: WidgetData | null;
  error: boolean;
};

/**
 * Carga SOLO los widgets visibles y desbloqueados. Un widget bloqueado por
 * plan no consulta nada. Un loader que falla no tumba el dashboard.
 */
export async function loadDashboard(experience: Pick<WorkspaceExperience, 'preset' | 'features' | 'preference' | 'business'>, workspaceId: string, now = new Date()) {
  const resolved = resolveDashboard({
    presetWidgets: experience.preset.preset.dashboardWidgets,
    layout: experience.preference.dashboardLayout,
    defs: WIDGET_REGISTRY,
    features: experience.features,
    businessType: experience.business.businessType,
  });
  const [profile, policy] = await Promise.all([
    prisma.workspaceProfile.findUnique({ where: { workspaceId }, select: { currency: true } }),
    prisma.messagingPolicy.findUnique({ where: { workspaceId }, select: { timezone: true } }),
  ]);
  const ctx = { workspaceId, now, currency: profile?.currency ?? 'CLP', timeZone: policy?.timezone ?? 'America/Santiago' };
  const widgets: LoadedWidget[] = await Promise.all(
    resolved.widgets.map(async (widget) => {
      const def = WIDGET_REGISTRY[widget.id as WidgetId];
      const meta = { title: def.title, description: def.description, emptyState: def.emptyState };
      if (widget.locked) return { ...widget, ...meta, data: null, error: false };
      try {
        return { ...widget, ...meta, data: await def.loader(ctx), error: false };
      } catch (error) {
        console.error('dashboard_widget_failed', { widget: widget.id, error });
        return { ...widget, ...meta, data: null, error: true };
      }
    }),
  );
  const available = resolved.available.map((widget) => ({ ...widget, title: WIDGET_REGISTRY[widget.id].title }));
  return { widgets, available, fromPreset: resolved.fromPreset, currency: ctx.currency };
}
