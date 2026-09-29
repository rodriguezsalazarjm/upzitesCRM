import { z } from 'zod';
import { BusinessType, CommerceSubtype, PrimaryGoal, TeamSize } from '../../../generated/prisma/client';
import { PREFERRED_CHANNELS } from '../workspace-profile/business';

/**
 * Tipos de negocio configurables (P0-E). UNDEFINED es solo el estado inicial.
 * Infoproductos ya no es un tipo: es ECOMMERCE + commerceSubtype INFOPRODUCT.
 */
export const configurableBusinessTypes = [
  BusinessType.SERVICES,
  BusinessType.ECOMMERCE,
  BusinessType.APPOINTMENTS,
  BusinessType.GENERAL,
] as const;

/** Entrada aceptada: incluye el legacy INFOPRODUCT, que la ruta normaliza. */
const businessTypeInputs = [...configurableBusinessTypes, BusinessType.INFOPRODUCT] as const;

export type ConfigurableBusinessType = (typeof configurableBusinessTypes)[number];

export const businessIndustries = [
  'MARKETING_DESIGN_DEVELOPMENT',
  'HOME_SERVICES_INSTALLATIONS',
  'TECHNOLOGY_STORE',
  'FASHION_ACCESSORIES',
  'BEAUTY_PERSONAL_CARE',
  'EDUCATION_TRAINING',
  'CONSULTING_PROFESSIONAL_SERVICES',
  'FOOD_BEVERAGES',
  'HEALTH_WELLNESS',
  'REAL_ESTATE',
  'TOURISM_EXPERIENCES',
  'OTHER',
] as const;

export type BusinessIndustry = (typeof businessIndustries)[number];

/** Configurado = cualquier valor distinto del estado inicial (incluye la modalidad del wizard). */
export function isBusinessTypeConfigured(value: BusinessType) {
  return value !== BusinessType.UNDEFINED;
}

export const updateWorkspaceProfileSchema = z
  .object({
    businessName: z.string().trim().min(1).max(120).optional(),
    businessType: z.enum(businessTypeInputs).optional(),
    commerceSubtype: z.nativeEnum(CommerceSubtype).nullable().optional(),
    primaryGoal: z.nativeEnum(PrimaryGoal).nullable().optional(),
    teamSize: z.nativeEnum(TeamSize).nullable().optional(),
    preferredChannels: z.array(z.enum(PREFERRED_CHANNELS)).max(PREFERRED_CHANNELS.length).optional(),
    industry: z.enum(businessIndustries).nullable().optional(),
    industryOther: z.string().trim().min(2).max(120).nullable().optional(),
    currency: z.string().length(3).optional(),
    country: z.string().length(2).optional(),
    businessStartMinute: z.number().int().min(0).max(1439).optional(),
    businessEndMinute: z.number().int().min(0).max(1439).optional(),
    businessDays: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    about: z.string().max(4000).optional(),
    policies: z.string().max(4000).optional(),
    shippingInfo: z.string().max(4000).optional(),
    returnsPolicy: z.string().max(4000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.industry === 'OTHER' && !value.industryOther?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['industryOther'],
        message: 'Escribe el rubro de tu negocio.',
      });
    }
  });
