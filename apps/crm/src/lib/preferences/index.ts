import { Prisma } from '../../../generated/prisma/client';
import { sanitizeDashboardLayout, applyLayoutAction, presetLayout } from '../dashboard/widgets/layout';
import { WIDGET_REGISTRY } from '../dashboard/widgets/registry';
import type { DashboardLayoutEntry, WidgetId, WidgetSize } from '../dashboard/widgets/types';
import { isNavItemId } from '../navigation/items';
import { clampSidebarWidth } from '../navigation/sidebar-layout';
import { prisma } from '../prisma';
import { isTutorialKey, type TutorialKey } from '../tutorials';

/**
 * Preferencias USUARIO x WORKSPACE (P0-E).
 *
 * Toda funcion recibe `userId` y `workspaceId` del CONTEXTO VERIFICADO del
 * servidor (sesion + membership), nunca del cliente: no existe una forma de
 * escribir las preferencias de otra persona ni de otro workspace.
 */

export type WorkspacePreference = {
  sidebarWidth: number | null;
  sidebarCollapsed: boolean;
  navOrder: string[];
  hiddenNavItems: string[];
  dashboardLayout: DashboardLayoutEntry[] | null;
  dismissedTutorials: string[];
  checklistHidden: boolean;
};

export const EMPTY_PREFERENCE: WorkspacePreference = {
  sidebarWidth: null,
  sidebarCollapsed: false,
  navOrder: [],
  hiddenNavItems: [],
  dashboardLayout: null,
  dismissedTutorials: [],
  checklistHidden: false,
};

type Scope = { userId: string; workspaceId: string };

function toPreference(row: {
  sidebarWidth: number | null;
  sidebarCollapsed: boolean;
  navOrder: string[];
  hiddenNavItems: string[];
  dashboardLayout: Prisma.JsonValue | null;
  dismissedTutorials: string[];
  onboardingChecklistState: Prisma.JsonValue | null;
} | null): WorkspacePreference {
  if (!row) return { ...EMPTY_PREFERENCE };
  const checklist = row.onboardingChecklistState as { hidden?: unknown } | null;
  return {
    sidebarWidth: row.sidebarWidth,
    sidebarCollapsed: row.sidebarCollapsed,
    navOrder: row.navOrder ?? [],
    hiddenNavItems: row.hiddenNavItems ?? [],
    dashboardLayout: sanitizeDashboardLayout(row.dashboardLayout),
    dismissedTutorials: row.dismissedTutorials ?? [],
    checklistHidden: checklist?.hidden === true,
  };
}

export async function getPreference({ userId, workspaceId }: Scope): Promise<WorkspacePreference> {
  const row = await prisma.workspaceUserPreference.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
  return toPreference(row);
}

export type PreferencePatch = {
  sidebarWidth?: number | null;
  sidebarCollapsed?: boolean;
  navOrder?: string[];
  hiddenNavItems?: string[];
  checklistHidden?: boolean;
};

/** Parche validado: ids de navegacion conocidos, ancho acotado. */
export async function updatePreference(scope: Scope, patch: PreferencePatch) {
  const data: Prisma.WorkspaceUserPreferenceUncheckedUpdateInput = {};
  if (patch.sidebarWidth !== undefined) data.sidebarWidth = patch.sidebarWidth === null ? null : clampSidebarWidth(patch.sidebarWidth);
  if (patch.sidebarCollapsed !== undefined) data.sidebarCollapsed = patch.sidebarCollapsed;
  if (patch.navOrder !== undefined) data.navOrder = [...new Set(patch.navOrder.filter(isNavItemId))];
  if (patch.hiddenNavItems !== undefined) data.hiddenNavItems = [...new Set(patch.hiddenNavItems.filter(isNavItemId))];
  if (patch.checklistHidden !== undefined) data.onboardingChecklistState = { hidden: patch.checklistHidden };
  return upsert(scope, data);
}

function upsert(scope: Scope, data: Prisma.WorkspaceUserPreferenceUncheckedUpdateInput) {
  return prisma.workspaceUserPreference
    .upsert({
      where: { userId_workspaceId: scope },
      create: { ...scope, ...(data as Prisma.WorkspaceUserPreferenceUncheckedCreateInput) },
      update: data,
    })
    .then(toPreference);
}

export type DashboardAction =
  | { type: 'hide' | 'show'; id: WidgetId }
  | { type: 'move'; id: WidgetId; direction: -1 | 1 }
  | { type: 'resize'; id: WidgetId; size: WidgetSize }
  | { type: 'reset' };

/**
 * Cambia el layout personal partiendo del efectivo (el guardado o el del
 * preset). `reset` vuelve al del preset (borra la personalizacion).
 */
export async function updateDashboardLayout(scope: Scope & { presetWidgets: WidgetId[] }, action: DashboardAction) {
  const { presetWidgets, ...key } = scope;
  if (action.type === 'reset') return upsert(key, { dashboardLayout: Prisma.DbNull });
  const current = (await getPreference(key)).dashboardLayout ?? presetLayout(presetWidgets, WIDGET_REGISTRY);
  const next = applyLayoutAction(current, action, WIDGET_REGISTRY);
  return upsert(key, { dashboardLayout: next as never });
}

export async function dismissTutorial(scope: Scope, key: TutorialKey) {
  if (!isTutorialKey(key)) throw new Error('Tutorial desconocido.');
  const current = await getPreference(scope);
  if (current.dismissedTutorials.includes(key)) return current;
  return upsert(scope, { dismissedTutorials: [...current.dismissedTutorials, key] });
}

/** "Volver a mostrar consejos": solo los de esta persona en este workspace. */
export function resetTutorials(scope: Scope) {
  return upsert(scope, { dismissedTutorials: [] });
}

/** Al aplicar un preset: la persona vuelve a los defaults (nav y dashboard). */
export function resetLayoutPreferences(scope: Scope, db: Prisma.TransactionClient | typeof prisma = prisma) {
  return db.workspaceUserPreference.updateMany({
    where: { userId: scope.userId, workspaceId: scope.workspaceId },
    data: { navOrder: [], hiddenNavItems: [], dashboardLayout: Prisma.DbNull },
  });
}
