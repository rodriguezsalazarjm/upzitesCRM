import {
  AgentVersionStatus,
  AutomationFlowStatus,
  ChannelAccountStatus,
  JourneyStatus,
  MembershipStatus,
  WhatsAppChannelStatus,
} from '../../../generated/prisma/enums';
import { prisma } from '../prisma';
import { flowGraphSchema } from '../automations/schema';
import type { EntitlementValues, FeatureKey } from './config';
import { getWorkspaceEntitlements } from './index';
import { byAge, decideByLimit, decideMemberships, type Decision } from './decide';
import { flowRequirements, journeyRequirements, missingFeatures, ruleActionsOf, ruleRequirements } from './requirements';

/**
 * Reconciliacion de entitlements (P0-C, D4): deja cada recurso del workspace
 * permitido o `planLimitedAt` segun el plan vigente.
 *
 *  - Determinista: se conservan los mas antiguos (createdAt ASC, id ASC); en
 *    memberships primero OWNER, luego ADMIN, luego MEMBER. Nunca queda un
 *    workspace sin OWNER habilitado.
 *  - Idempotente: correrla dos veces no cambia nada (ni la fecha original de
 *    la marca).
 *  - Reversible: solo escribe `planLimitedAt/planLimitedReason`. El estado de
 *    negocio (status, isActive) no se toca: subir de plan limpia la marca y un
 *    recurso que el usuario pauso sigue pausado. Nunca borra, nunca
 *    desconecta, nunca toca credenciales.
 *
 * Se ejecuta tras upgrade/downgrade/COMP/trial/suspension-reanudacion y en el
 * barrido periodico (el vencimiento se deriva por fecha, sin evento).
 * SUSPENDED no se reconcilia: el bloqueo es total por acceso. Un plan LEGACY
 * tampoco, hasta su clasificacion manual (P0-D).
 */

type Keyed = { id: string; createdAt: Date; planLimitedAt: Date | null; planLimitedReason: string | null };

export type CategoryReport = { allowed: number; limited: number; newlyLimited: number; released: number };

export type ReconcileReport =
  | { workspaceId: string; skipped: 'SUSPENDED' | 'LEGACY'; plan: string | null }
  | {
      workspaceId: string;
      skipped: null;
      plan: string | null;
      memberships: CategoryReport;
      channels: CategoryReport;
      automations: CategoryReport;
      journeys: CategoryReport;
      agents: CategoryReport;
    };

function featureReason(values: EntitlementValues, reqs: Parameters<typeof missingFeatures>[1]) {
  const missing = missingFeatures(values, reqs);
  return missing.length ? `feature:${missing[0].feature as FeatureKey}` : null;
}

type Model = 'workspaceMembership' | 'whatsAppChannel' | 'channelAccount' | 'automationFlow' | 'automationRule' | 'journey' | 'agentDefinition';

async function apply(
  model: Model,
  workspaceId: string,
  items: Keyed[],
  decision: Decision,
  inactive: Keyed[],
  now: Date,
): Promise<CategoryReport> {
  const current = new Map(items.map((item) => [item.id, item]));
  // Prisma no deja tipar un delegate generico; todos comparten la forma de
  // updateMany con planLimitedAt/planLimitedReason.
  const delegate = prisma[model] as unknown as {
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };

  let newlyLimited = 0;
  const byReason = new Map<string, string[]>();
  for (const { id, reason } of decision.limited) {
    const item = current.get(id);
    if (!item?.planLimitedAt) newlyLimited += 1;
    if (item?.planLimitedAt && item.planLimitedReason === reason) continue;
    byReason.set(reason, [...(byReason.get(reason) ?? []), id]);
  }
  for (const [reason, ids] of byReason) {
    // Conserva la fecha original si ya estaba limitado por otra razon.
    await delegate.updateMany({ where: { workspaceId, id: { in: ids }, planLimitedAt: null }, data: { planLimitedAt: now, planLimitedReason: reason } });
    await delegate.updateMany({ where: { workspaceId, id: { in: ids } }, data: { planLimitedReason: reason } });
  }

  // Liberar: lo permitido y lo que dejo de estar activo (un recurso pausado o
  // archivado no ocupa cupo; al reactivarlo pasa por el gate de crecimiento).
  const release = [
    ...decision.allowed.filter((id) => current.get(id)?.planLimitedAt),
    ...inactive.filter((item) => item.planLimitedAt).map((item) => item.id),
  ];
  const released = release.length
    ? (await delegate.updateMany({ where: { workspaceId, id: { in: release } }, data: { planLimitedAt: null, planLimitedReason: null } })).count
    : 0;

  return { allowed: decision.allowed.length, limited: decision.limited.length, newlyLimited, released };
}

const KEYED = { id: true, createdAt: true, planLimitedAt: true, planLimitedReason: true } as const;

export async function reconcileWorkspaceEntitlements(workspaceId: string, options: { now?: Date } = {}): Promise<ReconcileReport> {
  const now = options.now ?? new Date();
  const ent = await getWorkspaceEntitlements(workspaceId, prisma, now);
  const plan = ent.planCode;
  if (ent.state === 'SUSPENDED') return { workspaceId, skipped: 'SUSPENDED', plan };
  if (ent.source === 'LEGACY') return { workspaceId, skipped: 'LEGACY', plan };
  const values = ent.values;

  // --- Usuarios ---------------------------------------------------------------
  const members = await prisma.workspaceMembership.findMany({ where: { workspaceId }, select: { ...KEYED, role: true, status: true } });
  const activeMembers = members.filter((m) => m.status === MembershipStatus.ACTIVE);
  const memberships = await apply(
    'workspaceMembership',
    workspaceId,
    activeMembers,
    decideMemberships(activeMembers, values.limits['users.max']),
    members.filter((m) => m.status !== MembershipStatus.ACTIVE),
    now,
  );

  // --- Canales (agnostico de proveedor) ---------------------------------------
  const [wa, accounts] = await Promise.all([
    prisma.whatsAppChannel.findMany({ where: { workspaceId }, select: { ...KEYED, status: true } }),
    prisma.channelAccount.findMany({ where: { workspaceId }, select: { ...KEYED, status: true } }),
  ]);
  const connectedWa = wa.filter((c) => c.status !== WhatsAppChannelStatus.DISCONNECTED);
  const connectedAccounts = accounts.filter((c) => c.status !== ChannelAccountStatus.DISCONNECTED);
  const channelDecision = decideByLimit([...connectedWa, ...connectedAccounts].sort(byAge), values.limits['channels.max'], 'channels.max');
  const waIds = new Set(wa.map((c) => c.id));
  const split = (d: Decision, ids: Set<string>, keep: boolean): Decision => ({
    allowed: d.allowed.filter((id) => ids.has(id) === keep),
    limited: d.limited.filter((l) => ids.has(l.id) === keep),
  });
  const waReport = await apply('whatsAppChannel', workspaceId, connectedWa, split(channelDecision, waIds, true), wa.filter((c) => c.status === WhatsAppChannelStatus.DISCONNECTED), now);
  const accReport = await apply('channelAccount', workspaceId, connectedAccounts, split(channelDecision, waIds, false), accounts.filter((c) => c.status === ChannelAccountStatus.DISCONNECTED), now);
  const channels = sum(waReport, accReport);

  // --- Automatizaciones (flujos publicados + reglas activas) -------------------
  const [flows, rules] = await Promise.all([
    prisma.automationFlow.findMany({
      where: { workspaceId },
      select: { ...KEYED, status: true, versions: { where: { status: AutomationFlowStatus.PUBLISHED }, take: 1, select: { trigger: true, nodes: true, edges: true } } },
    }),
    prisma.automationRule.findMany({ where: { workspaceId }, select: { ...KEYED, isActive: true, presetKey: true, actions: true, action: true } }),
  ]);
  const activeFlows = flows.filter((f) => f.status === AutomationFlowStatus.PUBLISHED);
  const activeRules = rules.filter((r) => r.isActive);
  const blocked = new Map<string, string>();
  for (const flow of activeFlows) {
    const version = flow.versions[0];
    const graph = version ? flowGraphSchema.safeParse({ trigger: version.trigger, nodes: version.nodes, edges: version.edges }) : null;
    const reason = graph?.success ? featureReason(values, flowRequirements(graph.data)) : null;
    if (reason) blocked.set(flow.id, reason);
  }
  for (const rule of activeRules) {
    const reason = featureReason(values, ruleRequirementsOf(rule));
    if (reason) blocked.set(rule.id, reason);
  }
  // Las reglas de sistema (presetKey) no ocupan cupo: solo se validan sus acciones.
  const counted = [...activeFlows, ...activeRules.filter((r) => !r.presetKey)].sort(byAge);
  const autoDecision = decideByLimit(counted, values.limits['automations.active.max'], 'automations.active.max', blocked);
  for (const rule of activeRules.filter((r) => r.presetKey)) {
    const reason = blocked.get(rule.id);
    if (reason) autoDecision.limited.push({ id: rule.id, reason });
    else autoDecision.allowed.push(rule.id);
  }
  const flowIds = new Set(flows.map((f) => f.id));
  const flowReport = await apply('automationFlow', workspaceId, activeFlows, split(autoDecision, flowIds, true), flows.filter((f) => f.status !== AutomationFlowStatus.PUBLISHED), now);
  const ruleReport = await apply('automationRule', workspaceId, activeRules, split(autoDecision, flowIds, false), rules.filter((r) => !r.isActive), now);
  const automations = sum(flowReport, ruleReport);

  // --- Journeys ----------------------------------------------------------------
  const journeyRows = await prisma.journey.findMany({
    where: { workspaceId },
    select: { ...KEYED, status: true, trigger: true, steps: { select: { action: true, label: true } } },
  });
  const published = journeyRows.filter((j) => j.status === JourneyStatus.PUBLISHED);
  const journeyBlocked = new Map<string, string>();
  for (const journey of published) {
    const reason = featureReason(values, journeyRequirements(journey));
    if (reason) journeyBlocked.set(journey.id, reason);
  }
  const journeys = await apply(
    'journey',
    workspaceId,
    published,
    decideByLimit([...published].sort(byAge), Number.MAX_SAFE_INTEGER, 'automations.active.max', journeyBlocked),
    journeyRows.filter((j) => j.status !== JourneyStatus.PUBLISHED),
    now,
  );

  // --- Agentes -----------------------------------------------------------------
  const agentRows = await prisma.agentDefinition.findMany({
    where: { workspaceId },
    select: { ...KEYED, isActive: true, versions: { where: { status: AgentVersionStatus.PUBLISHED }, take: 1, select: { id: true } } },
  });
  const liveAgents = agentRows.filter((a) => a.isActive && a.versions.length > 0);
  const agentBlocked = new Map<string, string>();
  if (!ent.can('agents')) for (const agent of liveAgents) agentBlocked.set(agent.id, 'feature:agents');
  const agents = await apply(
    'agentDefinition',
    workspaceId,
    liveAgents,
    decideByLimit([...liveAgents].sort(byAge), values.limits['agents.max'], 'agents.max', agentBlocked),
    agentRows.filter((a) => !(a.isActive && a.versions.length > 0)),
    now,
  );

  return { workspaceId, skipped: null, plan, memberships, channels, automations, journeys, agents };
}

function ruleRequirementsOf(rule: { actions: unknown; action: string | null }) {
  return ruleRequirements(ruleActionsOf(rule));
}

function sum(a: CategoryReport, b: CategoryReport): CategoryReport {
  return {
    allowed: a.allowed + b.allowed,
    limited: a.limited + b.limited,
    newlyLimited: a.newlyLimited + b.newlyLimited,
    released: a.released + b.released,
  };
}

/** Reconciliacion que nunca rompe al llamador (operaciones de billing, cron). */
export async function reconcileSafely(workspaceId: string) {
  try {
    return await reconcileWorkspaceEntitlements(workspaceId);
  } catch (error) {
    console.error('entitlements_reconcile_failed', { workspaceId, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}
