import { z } from 'zod';
import { BusinessType } from '../../../generated/prisma/client';

/** Formas de venta configurables por el usuario. UNDEFINED es solo el estado inicial. */
export const configurableBusinessTypes = [
  BusinessType.INFOPRODUCT,
  BusinessType.ECOMMERCE,
  BusinessType.SERVICES,
] as const;

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

export function isBusinessTypeConfigured(value: BusinessType): value is ConfigurableBusinessType {
  return configurableBusinessTypes.some((candidate) => candidate === value);
}

export const updateWorkspaceProfileSchema = z
  .object({
    businessName: z.string().trim().min(1).max(120).optional(),
    businessType: z.enum(configurableBusinessTypes).optional(),
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
