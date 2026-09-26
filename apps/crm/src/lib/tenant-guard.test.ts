import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectTenantQuery, TenantGuardViolation, withPlatformScope } from './tenant-guard';

const tenantModels = new Set(['Contact', 'Job']);

function inspect(model: string, operation: string, args: unknown, mode: 'throw' | 'report' | 'off' = 'throw') {
  return inspectTenantQuery({ tenantModels, model, operation, args, mode });
}

test('consulta global sobre un modelo tenant se detecta', () => {
  assert.ok(inspect('Contact', 'findMany', {}) instanceof TenantGuardViolation);
  assert.ok(inspect('Contact', 'count', { where: { status: 'ACTIVE' } }) instanceof TenantGuardViolation);
  assert.ok(inspect('Contact', 'deleteMany', undefined) instanceof TenantGuardViolation);
});

test('acotada por workspace, id, FK de un padre o clave compuesta: OK', () => {
  assert.equal(inspect('Contact', 'findMany', { where: { workspaceId: 'w1' } }), null);
  assert.equal(inspect('Contact', 'findFirst', { where: { id: 'c1' } }), null);
  assert.equal(inspect('Contact', 'findMany', { where: { ownerId: 'u1' } }), null);
  assert.equal(inspect('Contact', 'findMany', { where: { AND: [{ status: 'X' }, { workspaceId: 'w1' }] } }), null);
  assert.equal(inspect('Contact', 'findMany', { where: { conversation: { id: 'x' } } }), null);
});

test('un OR solo acota si todas sus ramas acotan', () => {
  assert.ok(inspect('Contact', 'findMany', { where: { OR: [{ workspaceId: 'w1' }, { status: 'X' }] } }) instanceof TenantGuardViolation);
  assert.equal(inspect('Contact', 'findMany', { where: { OR: [{ workspaceId: 'w1' }, { id: 'c1' }] } }), null);
});

test('withPlatformScope declara la consulta cross-tenant a proposito', () => {
  assert.equal(withPlatformScope(() => inspect('Job', 'findMany', { where: { status: 'PENDING' } })), null);
});

test('modelos no tenant, operaciones de registro unico y modo off no se revisan', () => {
  assert.equal(inspect('User', 'findMany', {}), null);
  assert.equal(inspect('Contact', 'findUnique', { where: { id: 'c1' } }), null);
  assert.equal(inspect('Contact', 'create', { data: {} }), null);
  assert.equal(inspect('Contact', 'findMany', {}, 'off'), null);
});

test('modo report registra sin lanzar', () => {
  assert.equal(inspect('Contact', 'findMany', {}, 'report'), null);
});
