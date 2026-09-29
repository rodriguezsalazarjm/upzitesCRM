import { CommerceSubtype } from '../../../generated/prisma/enums';
import { canonicalBusiness, type BusinessProfileLike } from '../workspace-profile/business';
import { appointmentsPreset } from './appointments';
import { ecommercePreset } from './ecommerce';
import { generalPreset } from './general';
import { infoproductPreset } from './infoproduct';
import { servicesPreset } from './services';
import type { PresetKey, WorkspacePreset } from './types';

export type { PresetKey, WorkspacePreset } from './types';

export const PRESETS: Record<PresetKey, WorkspacePreset> = {
  services: servicesPreset,
  ecommerce: ecommercePreset,
  infoproduct: infoproductPreset,
  appointments: appointmentsPreset,
  general: generalPreset,
};

export const PRESET_KEYS = Object.keys(PRESETS) as PresetKey[];

export function isPresetKey(value: unknown): value is PresetKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PRESETS, value);
}

/** "services:v1": identificador estable de la version aplicada. */
export function presetId(preset: Pick<WorkspacePreset, 'key' | 'version'>) {
  return `${preset.key}:v${preset.version}`;
}

/** Preset que corresponde al perfil de negocio. GENERAL como fallback. */
export function recommendedPresetKey(profile: BusinessProfileLike | null | undefined): PresetKey {
  const business = canonicalBusiness(profile);
  switch (business.businessType) {
    case 'SERVICES':
      return 'services';
    case 'APPOINTMENTS':
      return 'appointments';
    case 'ECOMMERCE':
      return business.commerceSubtype === CommerceSubtype.INFOPRODUCT ? 'infoproduct' : 'ecommerce';
    default:
      return 'general';
  }
}

export type PresetProfile = BusinessProfileLike & { presetKey?: string | null; presetVersion?: number | null };

export type ResolvedPreset = {
  preset: WorkspacePreset;
  /** El perfil tiene un preset aplicado explicitamente (no deducido). */
  applied: boolean;
  /** Preset que corresponderia al perfil actual. */
  recommendedKey: PresetKey;
  /** El perfil cambio y el preset aplicado ya no es el recomendado. */
  recommendationDiffers: boolean;
  /** Hay una version nueva del preset aplicado. No se aplica sola. */
  updateAvailable: boolean;
};

/**
 * Preset vigente del workspace: el aplicado si existe (cambiar el tipo de
 * negocio NO reordena la app de nadie), si no el deducido del perfil.
 */
export function resolvePreset(profile: PresetProfile | null | undefined): ResolvedPreset {
  const recommendedKey = recommendedPresetKey(profile);
  const applied = isPresetKey(profile?.presetKey);
  const preset = PRESETS[applied ? (profile!.presetKey as PresetKey) : recommendedKey];
  return {
    preset,
    applied,
    recommendedKey,
    recommendationDiffers: preset.key !== recommendedKey,
    updateAvailable: applied && (profile?.presetVersion ?? 0) < preset.version,
  };
}
