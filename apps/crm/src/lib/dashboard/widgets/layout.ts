import type { FeatureKey } from '../../entitlements/config';
import type { FeatureAccess } from '../../navigation/resolve';
import type { CanonicalBusinessType } from '../../workspace-profile/business';
import { WIDGET_IDS, WIDGET_SIZES, type DashboardLayoutEntry, type WidgetDef, type WidgetId, type WidgetSize } from './types';

/**
 * Layout del dashboard (P0-E), puro. Mismo orden de decisiones que la
 * navegacion: el preset propone widgets, el plan decide si se cargan
 * (bloqueado = se muestra con candado y NO se consulta), y el layout personal
 * (USUARIO x WORKSPACE) ordena, cambia tamano, oculta o recupera.
 *
 * Un layout guardado no se reescribe cuando cambia el preset: se respeta tal
 * cual hasta que la persona aplique la configuracion recomendada.
 */

type WidgetMeta = Pick<WidgetDef, 'id' | 'defaultSize' | 'requiredEntitlement' | 'supportedBusinessTypes'>;

export type ResolvedWidget = {
  id: WidgetId;
  size: WidgetSize;
  locked: boolean;
  lockedPlan: string | null;
};

export type ResolvedDashboard = {
  widgets: ResolvedWidget[];
  /** Widgets que se pueden (re)agregar: ocultos o disponibles para el negocio. */
  available: ResolvedWidget[];
  /** true = layout del preset (la persona no personalizo). */
  fromPreset: boolean;
};

const isWidgetId = (value: unknown): value is WidgetId => typeof value === 'string' && (WIDGET_IDS as readonly string[]).includes(value);
const isSize = (value: unknown): value is WidgetSize => typeof value === 'string' && WIDGET_SIZES.includes(value as WidgetSize);

/** Valida lo que viene de la base o del cliente. Descarta lo desconocido. */
export function sanitizeDashboardLayout(raw: unknown): DashboardLayoutEntry[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const entries: DashboardLayoutEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { id, position, size, hidden } = item as Record<string, unknown>;
    if (!isWidgetId(id) || seen.has(id)) continue;
    seen.add(id);
    entries.push({
      id,
      position: typeof position === 'number' && Number.isFinite(position) ? position : entries.length,
      size: isSize(size) ? size : 'sm',
      hidden: hidden === true,
    });
  }
  return entries;
}

export function presetLayout(presetWidgets: WidgetId[], defs: Record<WidgetId, WidgetMeta>): DashboardLayoutEntry[] {
  return presetWidgets.map((id, position) => ({ id, position, size: defs[id].defaultSize, hidden: false }));
}

export function resolveDashboard(input: {
  presetWidgets: WidgetId[];
  layout: unknown;
  defs: Record<WidgetId, WidgetMeta>;
  features: Partial<Record<FeatureKey, FeatureAccess>>;
  businessType: CanonicalBusinessType;
}): ResolvedDashboard {
  const saved = sanitizeDashboardLayout(input.layout);
  const entries = saved ?? presetLayout(input.presetWidgets, input.defs);
  const lock = (id: WidgetId) => {
    const required = input.defs[id].requiredEntitlement;
    const access = required ? input.features[required] : undefined;
    const locked = required ? !access?.allowed : false;
    return { locked, lockedPlan: locked ? (access?.requiredPlanName ?? null) : null };
  };
  const toWidget = (entry: DashboardLayoutEntry): ResolvedWidget => ({ id: entry.id, size: entry.size, ...lock(entry.id) });

  const visible = entries.filter((entry) => !entry.hidden).sort((a, b) => a.position - b.position);
  const visibleIds = new Set(visible.map((entry) => entry.id));
  const available = WIDGET_IDS.filter((id) => {
    if (visibleIds.has(id)) return false;
    const supported = input.defs[id].supportedBusinessTypes;
    const hiddenByUser = entries.some((entry) => entry.id === id);
    return hiddenByUser || input.presetWidgets.includes(id) || !supported || supported.includes(input.businessType);
  }).map((id) => ({ id, size: entries.find((entry) => entry.id === id)?.size ?? input.defs[id].defaultSize, ...lock(id) }));

  return { widgets: visible.map(toWidget), available, fromPreset: saved === null };
}

/** Operaciones de layout (puras): parten del layout efectivo y devuelven el nuevo. */
export function applyLayoutAction(
  current: DashboardLayoutEntry[],
  action: { type: 'hide' | 'show'; id: WidgetId } | { type: 'move'; id: WidgetId; direction: -1 | 1 } | { type: 'resize'; id: WidgetId; size: WidgetSize },
  defs: Record<WidgetId, WidgetMeta>,
): DashboardLayoutEntry[] {
  const ordered = [...current].sort((a, b) => a.position - b.position);
  const index = ordered.findIndex((entry) => entry.id === action.id);
  if (action.type === 'show') {
    if (index === -1) ordered.push({ id: action.id, position: ordered.length, size: defs[action.id].defaultSize, hidden: false });
    else ordered[index] = { ...ordered[index], hidden: false };
  } else if (index !== -1) {
    if (action.type === 'hide') ordered[index] = { ...ordered[index], hidden: true };
    if (action.type === 'resize') ordered[index] = { ...ordered[index], size: action.size };
    if (action.type === 'move') {
      // Se mueve entre los VISIBLES: saltar ocultos evita "no pasa nada".
      const visible = ordered.filter((entry) => !entry.hidden);
      const at = visible.findIndex((entry) => entry.id === action.id);
      const swapWith = visible[at + action.direction];
      if (swapWith) {
        const a = ordered.findIndex((entry) => entry.id === action.id);
        const b = ordered.findIndex((entry) => entry.id === swapWith.id);
        [ordered[a], ordered[b]] = [ordered[b], ordered[a]];
      }
    }
  }
  return ordered.map((entry, position) => ({ ...entry, position }));
}
