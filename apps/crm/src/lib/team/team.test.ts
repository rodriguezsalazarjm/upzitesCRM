import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { InvitationOrigin, WorkspaceRole } from '../../../generated/prisma/enums';
import { canChangeRole, canInviteRole, canManageInvitation, canManageMember, teamCapabilities } from './permissions';
import { splitInvitationsBySeat } from './seat-rules';

const { OWNER, ADMIN, MEMBER } = WorkspaceRole;
const owner = { userId: 'o', role: OWNER };
const admin = { userId: 'a', role: ADMIN };
const member = { userId: 'm', role: MEMBER };

test('invitar: OWNER → MEMBER/ADMIN; ADMIN → MEMBER; nadie invita OWNER; MEMBER nada', () => {
  assert.deepEqual([MEMBER, ADMIN, OWNER].map((r) => canInviteRole(owner, r)), [true, true, false]);
  assert.deepEqual([MEMBER, ADMIN, OWNER].map((r) => canInviteRole(admin, r)), [true, false, false]);
  assert.deepEqual([MEMBER, ADMIN, OWNER].map((r) => canInviteRole(member, r)), [false, false, false]);
});

test('suspender/reactivar: ADMIN solo a MEMBER (no a si mismo, ni ADMIN, ni OWNER)', () => {
  assert.equal(canManageMember(admin, { userId: 'x', role: MEMBER }), true);
  assert.equal(canManageMember(admin, { userId: 'y', role: ADMIN }), false);
  assert.equal(canManageMember(admin, { userId: 'a', role: ADMIN }), false);
  assert.equal(canManageMember(admin, { userId: 'z', role: OWNER }), false);
  assert.equal(canManageMember(owner, { userId: 'z', role: OWNER }), true, 'la proteccion del ultimo OWNER va aparte, con lock');
  assert.equal(canManageMember(member, { userId: 'x', role: MEMBER }), false);
});

test('roles: solo OWNER cambia roles (incluida la promocion a OWNER)', () => {
  assert.equal(canChangeRole(owner), true);
  assert.equal(canChangeRole(admin), false);
  assert.equal(canChangeRole(member), false);
});

test('invitaciones: ADMIN solo gestiona MEMBER creadas desde el workspace', () => {
  assert.equal(canManageInvitation(admin, { role: MEMBER, origin: InvitationOrigin.WORKSPACE }), true);
  assert.equal(canManageInvitation(admin, { role: ADMIN, origin: InvitationOrigin.WORKSPACE }), false);
  assert.equal(canManageInvitation(admin, { role: MEMBER, origin: InvitationOrigin.PLATFORM }), false);
  assert.equal(canManageInvitation(owner, { role: OWNER, origin: InvitationOrigin.PLATFORM }), true);
  assert.equal(canManageInvitation(member, { role: MEMBER, origin: InvitationOrigin.WORKSPACE }), false);
});

test('capacidades de UI coinciden con las reglas', () => {
  assert.deepEqual(teamCapabilities(owner).inviteRoles, [MEMBER, ADMIN]);
  assert.deepEqual(teamCapabilities(admin).inviteRoles, [MEMBER]);
  assert.equal(teamCapabilities(member).readOnly, true);
  assert.equal(teamCapabilities(member).invite, false);
});

test('asientos: las invitaciones mas antiguas caben; las demas quedan bloqueadas por plan', () => {
  const at = (n: number) => new Date(2026, 0, n);
  const invitations = [
    { id: 'c', createdAt: at(3) },
    { id: 'a', createdAt: at(1) },
    { id: 'b', createdAt: at(2) },
  ];
  assert.deepEqual(splitInvitationsBySeat(invitations, 3, 5), { fitting: ['a', 'b'], blocked: ['c'] });
  assert.deepEqual(splitInvitationsBySeat(invitations, 5, 5), { fitting: [], blocked: ['a', 'b', 'c'] });
  assert.deepEqual(splitInvitationsBySeat(invitations, 7, 5).blocked, ['a', 'b', 'c'], 'downgrade por debajo de los activos');
  assert.deepEqual(splitInvitationsBySeat(invitations, 0, 10).blocked, []);
});

test('la API de equipo no acepta workspaceId ni actor en el cuerpo (schemas estrictos)', () => {
  for (const file of ['src/app/api/team/invitations/route.ts', 'src/app/api/team/invitations/[id]/route.ts', 'src/app/api/team/members/[userId]/route.ts']) {
    const text = readFileSync(join(process.cwd(), file), 'utf8');
    assert.match(text, /\.strict\(\)/, file);
    assert.doesNotMatch(text, /workspaceId:\s*z\.|actorId:\s*z\./, file);
    assert.match(text, /workspaceId: user\.workspace\.id/, `${file}: el workspace sale del contexto`);
  }
});

test('ningun update de rol/estado de membership fuera de lib/team (operacion central)', () => {
  for (const file of ['src/app/api/team/members/[userId]/route.ts', 'src/app/api/team/invitations/route.ts']) {
    assert.doesNotMatch(readFileSync(join(process.cwd(), file), 'utf8'), /workspaceMembership\.update/, file);
  }
});
