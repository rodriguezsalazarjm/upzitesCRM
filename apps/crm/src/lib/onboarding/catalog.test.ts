import assert from 'node:assert/strict';
import test from 'node:test';

import { BusinessType } from '../../../generated/prisma/client';
import {
  canShopifyCompleteCatalog,
  getCatalogRequirement,
  getCatalogSettingsHref,
} from './catalog';

test('Servicios exige reglas de precio y una conexión Shopify no completa el requisito', () => {
  assert.equal(getCatalogRequirement(BusinessType.SERVICES), 'SERVICES_PRICING');
  assert.equal(getCatalogSettingsHref(BusinessType.SERVICES), '/configuracion#servicios-precios');
  assert.equal(canShopifyCompleteCatalog(BusinessType.SERVICES), false);
});

test('las modalidades de productos usan el catálogo y permiten Shopify', () => {
  assert.equal(getCatalogRequirement(BusinessType.ECOMMERCE), 'PHYSICAL_PRODUCTS');
  assert.equal(getCatalogRequirement(BusinessType.INFOPRODUCT), 'DIGITAL_PRODUCTS');
  assert.equal(getCatalogSettingsHref(BusinessType.ECOMMERCE), '/productos');
  assert.equal(getCatalogSettingsHref(BusinessType.INFOPRODUCT), '/productos');
  assert.equal(canShopifyCompleteCatalog(BusinessType.ECOMMERCE), true);
  assert.equal(canShopifyCompleteCatalog(BusinessType.INFOPRODUCT), true);
});
