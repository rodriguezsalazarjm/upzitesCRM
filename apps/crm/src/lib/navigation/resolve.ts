import { WorkspaceRole } from '../../../generated/prisma/enums';
import type { FeatureKey } from '../entitlements/config';
import type { WorkspacePreset } from '../workspace-presets/types';
import { NAV_ITEMS, type NavIcon, type NavItemDef } from './items';
import { roleAllows } from '../workspace-roles';

/**
 * Resolver central de navegacion (P0-E). Orden de decisiones, fijo:
 *
 *  1. PRESET decide relevancia y prioridad (orden; que no ocupa espacio).
 *  2. ENTITLEMENTS deciden disponible o bloqueado. Un modulo relevante que el
 *     plan no incluye se VE, bloqueado ("Disponible en PRO").
 *  3. ROL decide si existe para esta persona. Sin rol no aparece, ni siquiera
 *     como recuperable.
 *  4. PREFERENCIAS del usuario reordenan, ocultan o recuperan modulos que el
 *     preset escondio.
 *
 * Las preferencias nunca desbloquean (el lock lo pone el plan) ni saltan el rol
 * (se filtra antes). Los modulos de sistema no se pueden ocultar. Nada aqui
 * autoriza: cada pagina y endpoint sigue comprobando plan y rol por su cuenta.
 */

export type FeatureAccess = { allowed: boolean; requiredPlanName: string | null };

export type NavigationInput = {
  preset: Pick<WorkspacePreset, 'navigationOrder' | 'defaultHiddenItems'>;
  /** Todas las FeatureKey del plan vigente. Una clave ausente se trata como bloqueada. */
  features: Partial<Record<FeatureKey, FeatureAccess>>;
  role: WorkspaceRole;
  preference?: { navOrder?: string[] | null; hiddenNavItems?: string[] | null } | null;
};

export type ResolvedNavEntry = {
  id: string;
  href: string;
  label: string;
  icon: NavIcon;
  locked: boolean;
  /** Plan que lo incluye, para "Disponible en X". */
  lockedPlan: string | null;
};

export type ResolvedNavigation = {
  primary: ResolvedNavEntry[];
  system: ResolvedNavEntry[];
  /** Ocultos por preset o por el usuario: se pueden recuperar en personalizacion. */
  hidden: ResolvedNavEntry[];
};


function entry(item: NavItemDef, features: NavigationInput['features']): ResolvedNavEntry {
  const access = item.requires ? features[item.requires] : undefined;
  const locked = item.requires ? !access?.allowed : false;
  return {
    id: item.id,
    href: item.href,
    label: item.label,
    icon: item.icon,
    locked,
    lockedPlan: locked ? (access?.requiredPlanName ?? null) : null,
  };
}

export function resolveNavigation(input: NavigationInput): ResolvedNavigation {
  // 3 (se aplica primero porque quita el item de TODAS las listas).
  const items: NavItemDef[] = NAV_ITEMS.filter((item: NavItemDef) => roleAllows(input.role, item.minRole));
  const byId = new Map(items.map((item) => [item.id, item]));
  const modules = items.filter((item) => !item.system);

  // 1. Preset: prioridad y relevancia.
  const presetHidden = new Set<string>(input.preset.defaultHiddenItems.filter((id) => byId.has(id)));
  const prioritized: string[] = input.preset.navigationOrder.filter((id) => byId.has(id) && !byId.get(id)!.system);
  const rest = modules.map((item) => item.id).filter((id) => !prioritized.includes(id) && !presetHidden.has(id));
  const base = [...prioritized, ...rest];

  // 4. Preferencias: solo ids conocidos, no de sistema, permitidos por rol.
  const isModule = (id: string) => byId.has(id) && !byId.get(id)!.system;
  const userOrder = [...new Set((input.preference?.navOrder ?? []).filter(isModule))];
  const userHidden = new Set((input.preference?.hiddenNavItems ?? []).filter(isModule));

  // Un id en navOrder que el preset oculta = el usuario lo recupero.
  const restored = new Set(userOrder.filter((id) => presetHidden.has(id)));
  const ordered = [...userOrder.filter((id) => base.includes(id) || restored.has(id)), ...base.filter((id) => !userOrder.includes(id))];
  const visible = ordered.filter((id) => !userHidden.has(id));
  const hidden = modules
    .map((item) => item.id)
    .filter((id) => (presetHidden.has(id) && !restored.has(id)) || userHidden.has(id));

  // 2. Entitlements: disponible o bloqueado.
  return {
    primary: visible.map((id) => entry(byId.get(id)!, input.features)),
    system: items.filter((item) => item.system).map((item) => entry(item, input.features)),
    hidden: hidden.map((id) => entry(byId.get(id)!, input.features)),
  };
}
