import { BusinessType, CommerceSubtype, PrimaryGoal, TeamSize } from '../../../generated/prisma/enums';

/**
 * Perfil de negocio (P0-E). Describe QUE hace el negocio; nunca que puede
 * hacer (eso es el plan) ni quien puede hacerlo (eso es el rol).
 *
 * Modelo canonico: businessType SERVICES | ECOMMERCE | APPOINTMENTS | GENERAL
 * (+ UNDEFINED = sin configurar) y commerceSubtype solo con ECOMMERCE. El
 * valor legacy `BusinessType.INFOPRODUCT` se lee como ECOMMERCE + INFOPRODUCT
 * (la migracion ya lo convierte; esto cubre datos que lleguen tarde).
 */

export type CanonicalBusinessType = 'SERVICES' | 'ECOMMERCE' | 'APPOINTMENTS' | 'GENERAL' | 'UNDEFINED';

export type BusinessProfileLike = {
  businessType: BusinessType;
  commerceSubtype?: CommerceSubtype | null;
};

export type CanonicalBusiness = {
  businessType: CanonicalBusinessType;
  commerceSubtype: CommerceSubtype | null;
};

export function canonicalBusiness(profile: BusinessProfileLike | null | undefined): CanonicalBusiness {
  if (!profile) return { businessType: 'UNDEFINED', commerceSubtype: null };
  if (profile.businessType === BusinessType.INFOPRODUCT) {
    return { businessType: 'ECOMMERCE', commerceSubtype: CommerceSubtype.INFOPRODUCT };
  }
  if (profile.businessType === BusinessType.ECOMMERCE) {
    return { businessType: 'ECOMMERCE', commerceSubtype: profile.commerceSubtype ?? CommerceSubtype.GENERAL_COMMERCE };
  }
  return { businessType: profile.businessType as CanonicalBusinessType, commerceSubtype: null };
}

/**
 * Normaliza lo que llega de un formulario o API: subtipo solo con ECOMMERCE,
 * y el legacy INFOPRODUCT como ECOMMERCE + INFOPRODUCT. Nunca escribe
 * `BusinessType.INFOPRODUCT`.
 */
export function normalizeBusinessInput(input: { businessType: BusinessType; commerceSubtype?: CommerceSubtype | null }): {
  businessType: BusinessType;
  commerceSubtype: CommerceSubtype | null;
} {
  const canonical = canonicalBusiness(input);
  if (canonical.businessType === 'ECOMMERCE') {
    return { businessType: BusinessType.ECOMMERCE, commerceSubtype: canonical.commerceSubtype };
  }
  return { businessType: BusinessType[canonical.businessType], commerceSubtype: null };
}

/**
 * Modalidad de venta que usa el wizard de activacion (requirements/catalog).
 * Se conserva su vocabulario original para no reescribir esas reglas:
 * SERVICES = cotiza; ECOMMERCE = productos fisicos; INFOPRODUCT = digital.
 * Citas se trata como servicios; GENERAL y sin configurar, como UNDEFINED
 * (el wizard pide elegir modalidad).
 */
export function wizardSalesMode(profile: BusinessProfileLike | null | undefined): BusinessType {
  const canonical = canonicalBusiness(profile);
  switch (canonical.businessType) {
    case 'SERVICES':
    case 'APPOINTMENTS':
      return BusinessType.SERVICES;
    case 'ECOMMERCE':
      return canonical.commerceSubtype === CommerceSubtype.INFOPRODUCT ? BusinessType.INFOPRODUCT : BusinessType.ECOMMERCE;
    default:
      return BusinessType.UNDEFINED;
  }
}

export const BUSINESS_TYPE_LABEL: Record<CanonicalBusinessType, string> = {
  SERVICES: 'Servicios',
  ECOMMERCE: 'Ecommerce',
  APPOINTMENTS: 'Citas',
  GENERAL: 'Otro',
  UNDEFINED: 'Sin configurar',
};

export const COMMERCE_SUBTYPE_LABEL: Record<CommerceSubtype, string> = {
  INFOPRODUCT: 'Productos digitales / infoproductos',
  PHYSICAL_PRODUCTS: 'Productos físicos',
  MIXED: 'Físicos y digitales',
  GENERAL_COMMERCE: 'Comercio general',
};

export const PRIMARY_GOAL_LABEL: Record<PrimaryGoal, string> = {
  LEADS: 'Conseguir clientes',
  SALES: 'Vender más',
  CONVERSATIONS: 'Centralizar conversaciones',
  AUTOMATION: 'Automatizar',
  RECOVERY: 'Recuperar ventas',
  OPERATIONS: 'Organizar la operación',
};

export const TEAM_SIZE_LABEL: Record<TeamSize, string> = {
  SOLO: 'Solo',
  SMALL: '2–5',
  MEDIUM: '6–20',
  LARGE: '20+',
};

export const PREFERRED_CHANNELS = ['WHATSAPP', 'INSTAGRAM', 'MESSENGER', 'WEB', 'ONLINE_STORE'] as const;
export type PreferredChannel = (typeof PREFERRED_CHANNELS)[number];

export const PREFERRED_CHANNEL_LABEL: Record<PreferredChannel, string> = {
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  MESSENGER: 'Facebook',
  WEB: 'Web',
  ONLINE_STORE: 'Tienda online',
};

export { BusinessType, CommerceSubtype, PrimaryGoal, TeamSize };
