import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BusinessType } from '../../../generated/prisma/client';
import { UserRole } from '../../../generated/prisma/client';
import { canManageMarketing } from '../marketing/roles';
import {
  businessIndustries,
  configurableBusinessTypes,
  isBusinessTypeConfigured,
  updateWorkspaceProfileSchema,
} from './profile-input';

test('expone solamente las tres modalidades implementadas por el backend', () => {
  assert.deepEqual(configurableBusinessTypes, [
    BusinessType.INFOPRODUCT,
    BusinessType.ECOMMERCE,
    BusinessType.SERVICES,
  ]);
});

test('acepta los rubros disponibles y exige detalle para Otro', () => {
  for (const industry of businessIndustries.filter((value) => value !== 'OTHER')) {
    assert.equal(updateWorkspaceProfileSchema.safeParse({ industry }).success, true);
  }

  assert.equal(updateWorkspaceProfileSchema.safeParse({ industry: 'OTHER' }).success, false);
  assert.equal(
    updateWorkspaceProfileSchema.safeParse({ industry: 'OTHER', industryOther: 'Arquitectura' })
      .success,
    true,
  );
  assert.equal(updateWorkspaceProfileSchema.safeParse({ industry: 'RUBRO_INVENTADO' }).success, false);
});

test('el rubro no infiere ni cambia la modalidad de venta', () => {
  const result = updateWorkspaceProfileSchema.safeParse({ industry: 'TECHNOLOGY_STORE' });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.businessType, undefined);
});

test('acepta cada tipo configurable y rechaza el estado inicial UNDEFINED', () => {
  for (const businessType of configurableBusinessTypes) {
    assert.equal(updateWorkspaceProfileSchema.safeParse({ businessType }).success, true);
  }

  assert.equal(
    updateWorkspaceProfileSchema.safeParse({ businessType: BusinessType.UNDEFINED }).success,
    false,
  );
  assert.equal(
    updateWorkspaceProfileSchema.safeParse({ businessType: 'CONSULTING' }).success,
    false,
  );
});

test('el criterio de completitud depende del valor persistido y no de una casilla separada', () => {
  assert.equal(isBusinessTypeConfigured(BusinessType.UNDEFINED), false);
  assert.equal(isBusinessTypeConfigured(BusinessType.SERVICES), true);
  assert.equal(isBusinessTypeConfigured(BusinessType.ECOMMERCE), true);
  assert.equal(isBusinessTypeConfigured(BusinessType.INFOPRODUCT), true);
});

test('rechaza campos de tenant enviados por el cliente', () => {
  assert.equal(
    updateWorkspaceProfileSchema.safeParse({
      businessType: BusinessType.SERVICES,
      workspaceId: 'otro-workspace',
    }).success,
    false,
  );
});

test('solo owner y admin pueden editar la configuracion del negocio', () => {
  assert.equal(canManageMarketing(UserRole.OWNER), true);
  assert.equal(canManageMarketing(UserRole.ADMIN), true);
  assert.equal(canManageMarketing(UserRole.SALES), false);
});
