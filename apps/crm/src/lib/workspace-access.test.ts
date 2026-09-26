import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MembershipStatus,
  PlatformRole,
  SupportAccessMode,
  WorkspaceRole,
} from '../../generated/prisma/enums';
import {
  canWrite,
  chooseLoginWorkspace,
  hasPlatformRole,
  hasWorkspaceRole,
  isPlatformOperator,
  resolveAccess,
  SUPPORT_SESSION_MAX_TTL_MS,
  supportSessionExpiry,
  type AccessDecision,
  type AccessSupportSession,
} from './workspace-access';

const now = new Date('2026-09-26T12:00:00Z');
const ws = { id: 'w1', name: 'UPZITES', slug: 'upzites' };
const owner = { id: 'u1', platformRole: PlatformRole.USER };
const superAdmin = { id: 'sa', platformRole: PlatformRole.SUPER_ADMIN };

function base(overrides: Partial<Parameters<typeof resolveAccess>[0]> = {}) {
  return resolveAccess({
    now,
    activeWorkspaceId: 'w1',
    supportSessionId: null,
    user: owner,
    membership: { role: WorkspaceRole.OWNER, status: MembershipStatus.ACTIVE, workspace: ws },
    supportSession: null,
    ...overrides,
  });
}

function support(overrides: Partial<AccessSupportSession> = {}): AccessSupportSession {
  return {
    id: 's1',
    actorUserId: 'sa',
    workspaceId: 'w1',
    mode: SupportAccessMode.READ_ONLY,
    expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
    endedAt: null,
    workspace: ws,
    ...overrides,
  };
}

test('membership ACTIVE da acceso con su rol', () => {
  const decision = base();
  assert.equal(decision.ok, true);
  assert.equal(decision.ok && decision.access, 'MEMBER');
  assert.equal(decision.ok && decision.role, WorkspaceRole.OWNER);
});

test('membership SUSPENDED no da acceso', () => {
  const decision = base({ membership: { role: WorkspaceRole.ADMIN, status: MembershipStatus.SUSPENDED, workspace: ws } });
  assert.deepEqual(decision, { ok: false, reason: 'MEMBERSHIP_SUSPENDED' });
});

test('sin membership no hay acceso', () => {
  assert.deepEqual(base({ membership: null }), { ok: false, reason: 'NOT_A_MEMBER' });
});

test('workspace borrado no da acceso', () => {
  const decision = base({ membership: { role: WorkspaceRole.OWNER, status: MembershipStatus.ACTIVE, workspace: null } });
  assert.deepEqual(decision, { ok: false, reason: 'WORKSPACE_GONE' });
});

test('usuario inexistente o sin workspace activo', () => {
  assert.deepEqual(base({ user: null }), { ok: false, reason: 'USER_NOT_FOUND' });
  assert.deepEqual(base({ activeWorkspaceId: null }), { ok: false, reason: 'NO_ACTIVE_WORKSPACE' });
});

test('SUPER_ADMIN sin membership NO entra como miembro', () => {
  assert.deepEqual(base({ user: superAdmin, membership: null }), { ok: false, reason: 'NOT_A_MEMBER' });
});

test('SUPER_ADMIN en su propio workspace por membership NO esta en modo soporte', () => {
  const decision = base({ user: superAdmin });
  assert.equal(decision.ok && decision.access, 'MEMBER');
});

test('SupportSession valida da acceso de soporte (rol ADMIN)', () => {
  const decision = base({ user: superAdmin, membership: null, supportSessionId: 's1', supportSession: support() });
  assert.equal(decision.ok, true);
  assert.equal(decision.ok && decision.access, 'SUPPORT');
  assert.equal(decision.ok && decision.role, WorkspaceRole.ADMIN);
});

test('SupportSession expirada, cerrada, ajena o de otro workspace se rechaza', () => {
  const cases: Partial<AccessSupportSession>[] = [
    { expiresAt: new Date(now.getTime() - 1) },
    { endedAt: new Date(now.getTime() - 1000) },
    { actorUserId: 'otro-operador' },
    { workspaceId: 'w2' },
    { workspace: null },
  ];
  for (const overrides of cases) {
    const decision = base({ user: superAdmin, supportSessionId: 's1', supportSession: support(overrides) });
    assert.deepEqual(decision, { ok: false, reason: 'SUPPORT_SESSION_INVALID' }, JSON.stringify(overrides));
  }
  assert.deepEqual(base({ user: superAdmin, supportSessionId: 's1', supportSession: null }), {
    ok: false,
    reason: 'SUPPORT_SESSION_INVALID',
  });
});

test('un operador degradado a USER pierde el soporte en curso', () => {
  const decision = base({
    user: { id: 'sa', platformRole: PlatformRole.USER },
    supportSessionId: 's1',
    supportSession: support(),
  });
  assert.deepEqual(decision, { ok: false, reason: 'SUPPORT_SESSION_INVALID' });
});

test('una SupportSession invalida no cae a la membership', () => {
  // Aunque el actor tuviera membership, la cookie de soporte manda.
  const decision = base({ user: superAdmin, supportSessionId: 's1', supportSession: support({ endedAt: now }) });
  assert.equal(decision.ok, false);
});

function ok(decision: AccessDecision) {
  if (!decision.ok) throw new Error('se esperaba acceso');
  return decision;
}

test('READ_ONLY rechaza toda mutacion y permite lecturas', () => {
  const decision = ok(base({ user: superAdmin, supportSessionId: 's1', supportSession: support() }));
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.deepEqual(canWrite(decision, method), { ok: false, code: 'SUPPORT_READ_ONLY' });
  }
  assert.deepEqual(canWrite(decision, 'GET'), { ok: true, audit: false });
  // Sin marca del proxy se asume escritura: falla cerrado.
  assert.deepEqual(canWrite(decision, null), { ok: false, code: 'SUPPORT_READ_ONLY' });
});

test('READ_WRITE permite mutaciones y exige auditoria', () => {
  const decision = ok(
    base({ user: superAdmin, supportSessionId: 's1', supportSession: support({ mode: SupportAccessMode.READ_WRITE }) }),
  );
  assert.deepEqual(canWrite(decision, 'POST'), { ok: true, audit: true });
  assert.deepEqual(canWrite(decision, 'GET'), { ok: true, audit: false });
});

test('un miembro escribe sin auditoria de soporte', () => {
  assert.deepEqual(canWrite(ok(base()), 'POST'), { ok: true, audit: false });
});

test('roles de plataforma: USER / PLATFORM_ADMIN / SUPER_ADMIN', () => {
  assert.equal(isPlatformOperator(PlatformRole.USER), false);
  assert.equal(isPlatformOperator(PlatformRole.PLATFORM_ADMIN), true);
  assert.equal(isPlatformOperator(PlatformRole.SUPER_ADMIN), true);
  // Acciones reservadas a SUPER_ADMIN (roles, Price Book, COMP).
  assert.equal(hasPlatformRole(PlatformRole.PLATFORM_ADMIN, PlatformRole.SUPER_ADMIN), false);
  assert.equal(hasPlatformRole(PlatformRole.SUPER_ADMIN, PlatformRole.SUPER_ADMIN), true);
  assert.equal(hasPlatformRole(PlatformRole.SUPER_ADMIN, PlatformRole.PLATFORM_ADMIN), true);
  assert.equal(hasPlatformRole(PlatformRole.USER, PlatformRole.USER), false);
});

test('OWNER de un workspace no es Platform Admin', () => {
  // El rol de workspace no participa en la decision de plataforma.
  const decision = ok(base());
  assert.equal(decision.role, WorkspaceRole.OWNER);
  assert.equal(isPlatformOperator(owner.platformRole), false);
});

test('jerarquia de roles de workspace', () => {
  assert.equal(hasWorkspaceRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN), true);
  assert.equal(hasWorkspaceRole(WorkspaceRole.ADMIN, WorkspaceRole.ADMIN), true);
  assert.equal(hasWorkspaceRole(WorkspaceRole.MEMBER, WorkspaceRole.ADMIN), false);
});

test('login: elige el ultimo usado si sigue activo', () => {
  const memberships = [
    { workspaceId: 'a', role: WorkspaceRole.OWNER, status: MembershipStatus.ACTIVE, createdAt: new Date('2026-01-01') },
    { workspaceId: 'b', role: WorkspaceRole.MEMBER, status: MembershipStatus.ACTIVE, createdAt: new Date('2026-02-01') },
  ];
  assert.equal(chooseLoginWorkspace(memberships, 'b'), 'b');
});

test('login: sin ultimo valido, el OWNER mas antiguo', () => {
  const memberships = [
    { workspaceId: 'm', role: WorkspaceRole.MEMBER, status: MembershipStatus.ACTIVE, createdAt: new Date('2025-01-01') },
    { workspaceId: 'o2', role: WorkspaceRole.OWNER, status: MembershipStatus.ACTIVE, createdAt: new Date('2026-03-01') },
    { workspaceId: 'o1', role: WorkspaceRole.OWNER, status: MembershipStatus.ACTIVE, createdAt: new Date('2026-01-01') },
    { workspaceId: 's', role: WorkspaceRole.OWNER, status: MembershipStatus.SUSPENDED, createdAt: new Date('2024-01-01') },
  ];
  assert.equal(chooseLoginWorkspace(memberships, 's'), 'o1');
  assert.equal(chooseLoginWorkspace(memberships, null), 'o1');
});

test('login: sin OWNER, la membership activa mas antigua; sin activas, null', () => {
  const members = [
    { workspaceId: 'x', role: WorkspaceRole.MEMBER, status: MembershipStatus.ACTIVE, createdAt: new Date('2026-05-01') },
    { workspaceId: 'y', role: WorkspaceRole.ADMIN, status: MembershipStatus.ACTIVE, createdAt: new Date('2026-04-01') },
  ];
  assert.equal(chooseLoginWorkspace(members, null), 'y');
  assert.equal(
    chooseLoginWorkspace([{ workspaceId: 'x', role: WorkspaceRole.OWNER, status: MembershipStatus.SUSPENDED, createdAt: now }], 'x'),
    null,
  );
  assert.equal(chooseLoginWorkspace([], null), null);
});

test('TTL de soporte nunca supera 60 minutos', () => {
  assert.equal(supportSessionExpiry(now, 240).getTime() - now.getTime(), SUPPORT_SESSION_MAX_TTL_MS);
  assert.equal(supportSessionExpiry(now, 15).getTime() - now.getTime(), 15 * 60 * 1000);
  assert.equal(supportSessionExpiry(now).getTime() - now.getTime(), SUPPORT_SESSION_MAX_TTL_MS);
});
