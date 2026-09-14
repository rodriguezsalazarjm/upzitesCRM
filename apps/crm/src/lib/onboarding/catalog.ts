import { BusinessType } from '../../../generated/prisma/client';

export type CatalogRequirement = 'SERVICES_PRICING' | 'PHYSICAL_PRODUCTS' | 'DIGITAL_PRODUCTS';

export function getCatalogRequirement(businessType: BusinessType): CatalogRequirement {
  if (businessType === BusinessType.SERVICES) return 'SERVICES_PRICING';
  if (businessType === BusinessType.INFOPRODUCT) return 'DIGITAL_PRODUCTS';
  return 'PHYSICAL_PRODUCTS';
}

export function getCatalogSettingsHref(businessType: BusinessType): string {
  return getCatalogRequirement(businessType) === 'SERVICES_PRICING'
    ? '/configuracion#servicios-precios'
    : '/productos';
}

export function canShopifyCompleteCatalog(businessType: BusinessType): boolean {
  return getCatalogRequirement(businessType) !== 'SERVICES_PRICING';
}
