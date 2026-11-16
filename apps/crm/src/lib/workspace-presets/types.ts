import type { CommerceSubtype } from '../../../generated/prisma/enums';
import type { WidgetId } from '../dashboard/widgets/types';
import type { NavItemId } from '../navigation/items';
import type { ChecklistTaskId } from '../onboarding-checklist/tasks';
import type { CanonicalBusinessType } from '../workspace-profile/business';

/**
 * Preset de experiencia (P0-E): versionado EN CODIGO. La base solo guarda
 * `presetKey` + `presetVersion`; el contenido evoluciona con deploys.
 *
 * Un preset decide RELEVANCIA y PRIORIDAD. Nunca concede una capacidad: todo
 * lo que nombra pasa despues por entitlements (plan) y rol.
 */
export type PresetKey = 'services' | 'ecommerce' | 'infoproduct' | 'appointments' | 'general';

export type WorkspacePreset = {
  key: PresetKey;
  /** Sube cuando cambia el contenido recomendado. Ver `presetId`. */
  version: number;
  label: string;
  description: string;
  businessType: CanonicalBusinessType;
  commerceSubtype?: CommerceSubtype;
  /** Modulos prioritarios, en orden. Los de sistema no van aqui. */
  navigationOrder: NavItemId[];
  /** Modulos que no ocupan espacio por defecto (recuperables en personalizacion). */
  defaultHiddenItems: NavItemId[];
  dashboardWidgets: WidgetId[];
  onboardingChecklist: ChecklistTaskId[];
  /** Claves informativas; conectar sigue pasando por plan y rol. */
  recommendedIntegrations: string[];
  /** Claves de `lib/automation/presets`. */
  recommendedAutomations: string[];
  /** P14: ids de plantillas de Flow Builder (`lib/automations/catalog`) que se ofrecen primero. */
  recommendedTemplates: string[];
  /** P14: acción principal del inicio. */
  primaryAction: { label: string; href: string };
  /** P14: terminología del rubro para el menú (solo el rótulo, nunca el acceso). */
  terms?: Partial<Record<NavItemId, string>>;
};
