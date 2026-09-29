/**
 * P0-F: gestion de equipo del workspace (seats, permisos, invitaciones,
 * roles, suspension, proteccion de OWNER).
 *
 * Uso, desde apps/crm (exige TEST_DATABASE_URL con el marcador de base aislada):
 *   pnpm exec tsx scripts/smoke-p0f.ts
 */
import './fixtures/test-environment';
import { randomUUID } from 'node:crypto';
import { InvitationOrigin, MembershipStatus, PlanCode, PlatformRole, WorkspaceRole } from '../generated/prisma/client';
import { crossTenantPrisma, prisma } from '../src/lib/prisma';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { assignCompSubscription } from '../src/lib/billing/subscription-admin';
import { addMembershipWithinPlan } from '../src/lib/entitlements/growth';
import { isEntitlementError } from '../src/lib/entitlements';
import { reconcileWorkspaceEntitlements } from '../src/lib/entitlements/reconcile';
import { acceptInvitation, createInvitation, hashInvitationToken, revokeInvitation, InvitationError, sendInvitationEmail } from '../src/lib/invitations';
import { findActiveMember, isActiveMember, listMyWorkspaces } from '../src/lib/membership';
import { queuePushEvent } from '../src/lib/push/events';
import { readSessionToken, createSessionToken } from '../src/lib/session-token';
import { resolveContextForSession } from '../src/lib/workspace-context';
import { getWorkspaceSeatUsage } from '../src/lib/team/seats';
import { changeWorkspaceRole, getTeamView, inviteTeamMember, reactivateMember, suspendMember, TeamError, type TeamActor } from '../src/lib/team/service';
import { completeOnboarding } from '../src/lib/workspace-profile/service';
import { getChecklist, getWorkspaceExperience } from '../src/lib/workspace-experience';
import { asUser } from './fixtures/request-context';
import { GET as teamRoute } from '../src/app/api/team/route';
import { POST as inviteRoute } from '../src/app/api/team/invitations/route';
import { POST as invitationActionRoute } from '../src/app/api/team/invitations/[id]/route';
import { POST as memberRoute } from '../src/app/api/team/members/[userId]/route';
import { POST as switchRoute } from '../src/app/api/workspaces/switch/route';
import { POST as platformInviteRoute } from '../src/app/api/platform/invitations/route';

// Nunca hablar con un proveedor de email real desde la suite.
process.env.PLATFORM_EMAIL_FROM = '';

const results: { name: string; ok: boolean }[] = [];
let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const stamp = Date.now();
const createdWorkspaces: string[] = [];
const createdUsers: string[] = [];
const cli = { via: 'cli' as const, reason: 'smoke p0f' };
let ipSeq = 1;
const ip = () => `198.19.${Math.floor(stamp / 1000) % 250}.${(ipSeq++ % 250) + 1}`;
type Session = { id: string; workspaceId: string | null };
const PASSWORD = 'contrasena-de-prueba-1234';

async function makeWorkspace(suffix: string, plan: PlanCode = PlanCode.SCALE) {
  const email = `owner-${suffix}-${stamp}@p0f.test`;
  const created = await createCustomerWorkspace({ companyName: `p0f-${suffix}-${stamp}`, ownerName: `Owner ${suffix}`, email, password: PASSWORD });
  createdWorkspaces.push(created.workspace.id);
  createdUsers.push(created.user.id);
  if (plan !== PlanCode.FREE) await assignCompSubscription({ workspaceId: created.workspace.id, planCode: plan, ...cli });
  const actor: TeamActor = { userId: created.user.id, role: WorkspaceRole.OWNER, workspaceId: created.workspace.id };
  return { workspaceId: created.workspace.id, ownerId: created.user.id, email, actor, session: { id: created.user.id, workspaceId: created.workspace.id } as Session };
}

async function makeUser(label: string) {
  const user = await prisma.user.create({ data: { name: label, email: `${label.toLowerCase().replace(/\s+/g, '-')}-${stamp}@p0f.test`, passwordHash: 'x' } });
  createdUsers.push(user.id);
  return user;
}

async function addMember(workspaceId: string, userId: string, role: WorkspaceRole) {
  await addMembershipWithinPlan({ workspaceId, userId, role });
  return { userId, role, workspaceId } as TeamActor;
}

function req(path: string, body?: unknown, method = 'POST') {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json(response: Response) {
  return (await response.clone().json().catch(() => ({}))) as { code?: string; message?: string; data?: Record<string, unknown> };
}

async function expectError(run: () => Promise<unknown>, test: (error: unknown) => boolean) {
  try {
    await run();
    return false;
  } catch (error) {
    return test(error);
  }
}
const isPlanLimit = (e: unknown) => isEntitlementError(e) && e.code === 'PLAN_LIMIT';
const isTeam = (code: string) => (e: unknown) => e instanceof TeamError && e.code === code;
const sessionOf = (a: TeamActor): Session => ({ id: a.userId, workspaceId: a.workspaceId });
const seats = (workspaceId: string) => getWorkspaceSeatUsage(workspaceId);
const newAccount = (name: string) => ({ name, password: PASSWORD, confirmPassword: PASSWORD });
const tokenOf = (url: string) => url.split('/invitacion/')[1];

// =============================================================================
console.log('\n== Vista de equipo y permisos basicos (SCALE) ==');
const W = await makeWorkspace('team');
const A = await addMember(W.workspaceId, (await makeUser('Admin W')).id, WorkspaceRole.ADMIN);
const M = await addMember(W.workspaceId, (await makeUser('Member W')).id, WorkspaceRole.MEMBER);
{
  const view = async (s: Session) => json(await asUser(s, () => teamRoute()));
  const [vo, va, vm] = [await view(W.session), await view(sessionOf(A)), await view(sessionOf(M))];
  const d = (v: Awaited<ReturnType<typeof view>>) => v.data as { active: { canManage: boolean }[]; capabilities: { inviteRoles: string[]; readOnly: boolean } };
  check('1. OWNER ve el equipo (3 activos) y puede invitar MEMBER y ADMIN', d(vo).active.length === 3 && JSON.stringify(d(vo).capabilities.inviteRoles) === '["MEMBER","ADMIN"]');
  check('2. ADMIN ve el equipo e invita solo MEMBER', d(va).active.length === 3 && JSON.stringify(d(va).capabilities.inviteRoles) === '["MEMBER"]');
  check('3. MEMBER ve el equipo en solo lectura', d(vm).capabilities.readOnly && d(vm).active.every((m) => !m.canManage));
  const memberInvite = await asUser(sessionOf(M), () => inviteRoute(req('/api/team/invitations', { email: `x-${stamp}@p0f.test`, role: 'MEMBER' })));
  check('4. MEMBER no invita (403)', memberInvite.status === 403);
}

let inviteMemberUrl = '';
let inviteAdminUrl = '';
const existing = await makeWorkspace('other'); // cuenta con otro workspace propio
{
  const r1 = await asUser(W.session, () => inviteRoute(req('/api/team/invitations', { email: `nuevo-${stamp}@p0f.test`, role: 'MEMBER' })));
  const d1 = (await json(r1)).data as { url: string; emailSent: boolean; invitationId: string };
  inviteMemberUrl = d1.url;
  const row = await prisma.workspaceInvitation.findUniqueOrThrow({ where: { id: d1.invitationId } });
  check('5. OWNER invita MEMBER (origen WORKSPACE)', r1.status === 201 && row.role === 'MEMBER' && row.origin === InvitationOrigin.WORKSPACE);
  check('39. Sin Resend: la respuesta trae el enlace para copiar', d1.emailSent === false && d1.url.includes('/invitacion/'));
  const r2 = await asUser(W.session, () => inviteRoute(req('/api/team/invitations', { email: existing.email, role: 'ADMIN' })));
  inviteAdminUrl = ((await json(r2)).data as { url: string }).url;
  check('6. OWNER invita ADMIN', r2.status === 201);
  const r3 = await asUser(sessionOf(A), () => inviteRoute(req('/api/team/invitations', { email: `desde-admin-${stamp}@p0f.test`, role: 'MEMBER' })));
  check('7. ADMIN invita MEMBER', r3.status === 201);
  const r4 = await asUser(sessionOf(A), () => inviteRoute(req('/api/team/invitations', { email: `admin2-${stamp}@p0f.test`, role: 'ADMIN' })));
  const r5 = await asUser(W.session, () => inviteRoute(req('/api/team/invitations', { email: `owner2-${stamp}@p0f.test`, role: 'OWNER' })));
  check('8. ADMIN no invita ADMIN (403); nadie invita OWNER directo (400)', r4.status === 403 && r5.status === 400);
}

// =============================================================================
console.log('\n== Asientos (START: 2 usuarios) ==');
const T = await makeWorkspace('seats', PlanCode.START);
{
  const first = await inviteTeamMember(T.actor, { email: `seat-a-${stamp}@p0f.test`, role: WorkspaceRole.MEMBER }, { sendEmail: false });
  const s1 = await seats(T.workspaceId);
  check('9. Una invitacion pendiente reserva asiento (1 activo + 1 reservado = 2/2)', s1.active === 1 && s1.reserved === 1 && s1.remaining === 0);
  const blocked = await expectError(() => inviteTeamMember(T.actor, { email: `seat-b-${stamp}@p0f.test`, role: WorkspaceRole.MEMBER }, { sendEmail: false }), isPlanLimit);
  const view = await getTeamView(T.actor);
  check('13. users.max bloquea una nueva invitacion (PLAN_LIMIT) y la vista lo refleja', blocked && view.seats.remaining === 0 && view.seats.requiredPlan === 'PRO');

  const revoke = await asUser(T.session, () => invitationActionRoute(req(`/api/team/invitations/${first.invitation.id}`, { action: 'revoke' }), { params: Promise.resolve({ id: first.invitation.id }) }));
  const s2 = await seats(T.workspaceId);
  check('10. Revocar libera el asiento en el acto', revoke.status === 200 && s2.reserved === 0 && s2.remaining === 1);

  const second = await inviteTeamMember(T.actor, { email: `seat-b-${stamp}@p0f.test`, role: WorkspaceRole.MEMBER }, { sendEmail: false });
  await prisma.workspaceInvitation.update({ where: { id: second.invitation.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const s3 = await seats(T.workspaceId);
  const expiredAccept = await expectError(() => acceptInvitation({ token: tokenOf(second.url), newAccount: newAccount('Tarde') }), (e) => e instanceof InvitationError && e.code === 'EXPIRED');
  check('11. Una invitacion vencida deja de reservar (sin barrido) y no se acepta', s3.reserved === 0 && s3.remaining === 1 && expiredAccept);

  const resend1 = await asUser(T.session, () => invitationActionRoute(req(`/api/team/invitations/${second.invitation.id}`, { action: 'resend' }), { params: Promise.resolve({ id: second.invitation.id }) }));
  const resend2 = await asUser(T.session, () => invitationActionRoute(req(`/api/team/invitations/${second.invitation.id}`, { action: 'resend' }), { params: Promise.resolve({ id: second.invitation.id }) }));
  const s4 = await seats(T.workspaceId);
  const rows = await prisma.workspaceInvitation.count({ where: { workspaceId: T.workspaceId, email: `seat-b-${stamp}@p0f.test` } });
  const oldToken = await expectError(() => acceptInvitation({ token: tokenOf(second.url), newAccount: newAccount('Viejo') }), (e) => e instanceof InvitationError && e.code === 'NOT_FOUND');
  check('12. Reenviar (dos veces) reusa la fila: un solo asiento; el enlace anterior muere', resend1.status === 200 && resend2.status === 200 && s4.reserved === 1 && rows === 1 && oldToken);

  // 14. Carrera por el ultimo asiento.
  const R = await makeWorkspace('race', PlanCode.START);
  const race = await Promise.allSettled([
    inviteTeamMember(R.actor, { email: `race-1-${stamp}@p0f.test`, role: WorkspaceRole.MEMBER }, { sendEmail: false }),
    inviteTeamMember(R.actor, { email: `race-2-${stamp}@p0f.test`, role: WorkspaceRole.MEMBER }, { sendEmail: false }),
  ]);
  const won = race.filter((r) => r.status === 'fulfilled').length;
  const lost = race.filter((r) => r.status === 'rejected' && isPlanLimit(r.reason)).length;
  check('14. Dos invitaciones simultaneas por el ultimo asiento: solo una', won === 1 && lost === 1 && (await seats(R.workspaceId)).reserved === 1, `${won}/${lost}`);
}

// =============================================================================
console.log('\n== Aceptar ==');
let newUserId = '';
{
  const accepted = await acceptInvitation({ token: tokenOf(inviteMemberUrl), newAccount: newAccount('Nuevo Miembro') });
  newUserId = accepted.userId;
  createdUsers.push(newUserId);
  const membership = await prisma.workspaceMembership.findUnique({ where: { userId_workspaceId: { userId: newUserId, workspaceId: W.workspaceId } } });
  check('15. Usuario nuevo acepta: cuenta global + membership MEMBER', accepted.createdAccount && membership?.role === 'MEMBER' && membership.status === 'ACTIVE');

  const accept2 = await acceptInvitation({ token: tokenOf(inviteAdminUrl), sessionUserId: existing.ownerId });
  const users = await prisma.user.count({ where: { email: existing.email } });
  const mine = await listMyWorkspaces(existing.ownerId);
  check('16. Usuario existente acepta un segundo workspace (como ADMIN)', !accept2.createdAccount && mine.some((w) => w.id === W.workspaceId && w.role === 'ADMIN') && mine.some((w) => w.id === existing.workspaceId));
  check('17. Aceptar no duplica el User', users === 1);
  const again = await acceptInvitation({ token: tokenOf(inviteAdminUrl), sessionUserId: existing.ownerId });
  const stillOne = await prisma.workspaceMembership.count({ where: { userId: existing.ownerId, workspaceId: W.workspaceId } });
  check('18. Aceptar dos veces es idempotente para la misma cuenta', again.alreadyAccepted === true && stillOne === 1);
  const switched = await asUser(existing.session, () => switchRoute(req('/api/workspaces/switch', { workspaceId: W.workspaceId })));
  check('43. Tras aceptar, el switcher muestra el nuevo workspace y el cambio funciona', switched.status === 200 && mine.length === 2);
}

// =============================================================================
console.log('\n== Roles y proteccion de OWNER ==');
const P = await addMember(W.workspaceId, (await makeUser('Promovible')).id, WorkspaceRole.MEMBER);
{
  const toAdmin = await asUser(W.session, () => memberRoute(req(`/api/team/members/${P.userId}`, { action: 'change_role', role: 'ADMIN' }), { params: Promise.resolve({ userId: P.userId }) }));
  const pRole = (await prisma.workspaceMembership.findUniqueOrThrow({ where: { userId_workspaceId: { userId: P.userId, workspaceId: W.workspaceId } } })).role;
  check('20. OWNER cambia MEMBER → ADMIN', toAdmin.status === 200 && pRole === 'ADMIN');
  const adminChanges = await asUser(sessionOf(A), () => memberRoute(req(`/api/team/members/${M.userId}`, { action: 'change_role', role: 'ADMIN' }), { params: Promise.resolve({ userId: M.userId }) }));
  check('21. ADMIN no cambia roles (403)', adminChanges.status === 403);
  const promote = await changeWorkspaceRole(W.actor, { targetUserId: P.userId, role: WorkspaceRole.OWNER });
  check('22. OWNER promueve ADMIN → OWNER (varios OWNER permitidos)', promote.changed && (await prisma.workspaceMembership.count({ where: { workspaceId: W.workspaceId, role: 'OWNER', status: 'ACTIVE' } })) === 2);

  const lastDemote = await asUser(T.session, () => memberRoute(req(`/api/team/members/${T.ownerId}`, { action: 'change_role', role: 'ADMIN' }), { params: Promise.resolve({ userId: T.ownerId }) }));
  const lastSuspend = await expectError(() => suspendMember(T.actor, T.ownerId), isTeam('LAST_OWNER'));
  check('23. El ultimo OWNER no se degrada ni se suspende (409 LAST_OWNER)', lastDemote.status === 409 && (await json(lastDemote)).code === 'LAST_OWNER' && lastSuspend);

  const pActor: TeamActor = { userId: P.userId, role: WorkspaceRole.OWNER, workspaceId: W.workspaceId };
  const race = await Promise.allSettled([
    changeWorkspaceRole(W.actor, { targetUserId: P.userId, role: WorkspaceRole.ADMIN }),
    changeWorkspaceRole(pActor, { targetUserId: W.ownerId, role: WorkspaceRole.ADMIN }),
  ]);
  const owners = await prisma.workspaceMembership.count({ where: { workspaceId: W.workspaceId, role: 'OWNER', status: 'ACTIVE' } });
  const ok = race.filter((r) => r.status === 'fulfilled').length;
  const blocked = race.filter((r) => r.status === 'rejected' && isTeam('LAST_OWNER')(r.reason)).length;
  check('24. Dos degradaciones simultaneas de los dos ultimos OWNER: pasa una', ok === 1 && blocked === 1 && owners === 1, `${ok}/${blocked} owners=${owners}`);
  // Quien quede como OWNER sigue operando el resto de la suite.
  const survivor = (await prisma.workspaceMembership.findFirstOrThrow({ where: { workspaceId: W.workspaceId, role: 'OWNER', status: 'ACTIVE' } })).userId;
  W.actor.userId = survivor;
  W.session.id = survivor;
}

// =============================================================================
console.log('\n== Suspender y reactivar ==');
const S2 = await makeWorkspace('suspend', PlanCode.START);
const M2user = await makeUser('Member Dos');
await addMember(S2.workspaceId, M2user.id, WorkspaceRole.MEMBER);
await addMember(W.workspaceId, M2user.id, WorkspaceRole.MEMBER);
{
  // Datos historicos + push antes de suspender.
  const contact = await prisma.contact.create({ data: { workspaceId: S2.workspaceId, firstName: 'Cliente', lastName: 'Historico', ownerId: M2user.id } });
  await prisma.pushSubscription.create({ data: { workspaceId: S2.workspaceId, userId: M2user.id, endpoint: `https://push.test/${randomUUID()}`, p256dh: 'k', auth: 'a' } });
  const pushBefore = await queuePushEvent({ workspaceId: S2.workspaceId, kind: 'ASSIGNED', dedupeKey: `p0f-before-${stamp}`, userId: M2user.id });

  const before = await seats(S2.workspaceId);
  const suspended = await asUser(S2.session, () => memberRoute(req(`/api/team/members/${M2user.id}`, { action: 'suspend' }), { params: Promise.resolve({ userId: M2user.id }) }));
  const after = await seats(S2.workspaceId);
  const row = await prisma.workspaceMembership.findUniqueOrThrow({ where: { userId_workspaceId: { userId: M2user.id, workspaceId: S2.workspaceId } } });
  check('25. Suspender MEMBER libera asiento (sin borrar User ni membership)', suspended.status === 200 && before.active === 2 && after.active === 1 && row.status === 'SUSPENDED' && Boolean(await prisma.user.findUnique({ where: { id: M2user.id } })));

  const ctx = await resolveContextForSession(readSessionToken(createSessionToken({ userId: M2user.id, activeWorkspaceId: S2.workspaceId, sessionVersion: 0 })));
  check('30. El suspendido no entra al workspace', ctx.kind === 'no-workspace');
  const mine = await listMyWorkspaces(M2user.id);
  check('31. El suspendido conserva sus otros workspaces', mine.some((w) => w.id === W.workspaceId) && !mine.some((w) => w.id === S2.workspaceId));
  const pushAfter = await queuePushEvent({ workspaceId: S2.workspaceId, kind: 'ASSIGNED', dedupeKey: `p0f-after-${stamp}`, userId: M2user.id });
  check('32. El suspendido no recibe push', pushBefore.queued === 1 && pushAfter.queued === 0);
  check('33. El suspendido no es asignable', (await findActiveMember(S2.workspaceId, M2user.id)) === null && !(await isActiveMember(S2.workspaceId, M2user.id)));
  const kept = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
  check('34. Los datos historicos conservan su userId', kept.ownerId === M2user.id);

  // 29. Reactivar comprueba asiento: se ocupa el lugar liberado con una invitacion.
  const filler = await inviteTeamMember(S2.actor, { email: `filler-${stamp}@p0f.test`, role: WorkspaceRole.MEMBER }, { sendEmail: false });
  const noSeat = await expectError(() => reactivateMember(S2.actor, M2user.id), isPlanLimit);
  await asUser(S2.session, () => invitationActionRoute(req(`/api/team/invitations/${filler.invitation.id}`, { action: 'revoke' }), { params: Promise.resolve({ id: filler.invitation.id }) }));
  const reactivated = await asUser(S2.session, () => memberRoute(req(`/api/team/members/${M2user.id}`, { action: 'reactivate' }), { params: Promise.resolve({ userId: M2user.id }) }));
  check('29. Reactivar comprueba asiento (PLAN_LIMIT si no hay; OK al liberar)', noSeat && reactivated.status === 200 && (await isActiveMember(S2.workspaceId, M2user.id)));

  // 19. Una membership SUSPENDED no se reactiva por invitacion.
  await suspendMember(S2.actor, M2user.id);
  const teamInvite = await expectError(() => inviteTeamMember(S2.actor, { email: M2user.email, role: WorkspaceRole.MEMBER }, { sendEmail: false }), (e) => e instanceof InvitationError && e.code === 'MEMBERSHIP_SUSPENDED');
  const token = randomUUID();
  await prisma.workspaceInvitation.create({ data: { workspaceId: S2.workspaceId, email: M2user.email, role: 'MEMBER', tokenHash: hashInvitationToken(token), expiresAt: new Date(Date.now() + 86_400_000) } });
  const viaOldInvite = await expectError(() => acceptInvitation({ token, sessionUserId: M2user.id }), (e) => e instanceof InvitationError && e.code === 'MEMBERSHIP_SUSPENDED');
  const stillSuspended = (await prisma.workspaceMembership.findUniqueOrThrow({ where: { userId_workspaceId: { userId: M2user.id, workspaceId: S2.workspaceId } } })).status;
  check('19. Una membership SUSPENDED no se reactiva por invitacion (ni nueva ni antigua)', teamInvite && viaOldInvite && stillSuspended === MembershipStatus.SUSPENDED);

  const suspendAdmin = await suspendMember(W.actor, A.userId);
  check('26. Suspender ADMIN libera asiento', suspendAdmin.changed && !(await isActiveMember(W.workspaceId, A.userId)));
  await reactivateMember(W.actor, A.userId);
  const adminActor: TeamActor = { ...A };
  const A3 = await addMember(W.workspaceId, (await makeUser('Admin Tres')).id, WorkspaceRole.ADMIN);
  const adminVsAdmin = await asUser(sessionOf(adminActor), () => memberRoute(req(`/api/team/members/${A3.userId}`, { action: 'suspend' }), { params: Promise.resolve({ userId: A3.userId }) }));
  check('27. ADMIN no suspende ADMIN (403)', adminVsAdmin.status === 403);
  const adminVsOwner = await asUser(sessionOf(adminActor), () => memberRoute(req(`/api/team/members/${W.actor.userId}`, { action: 'suspend' }), { params: Promise.resolve({ userId: W.actor.userId }) }));
  check('28. ADMIN no suspende OWNER (403)', adminVsOwner.status === 403);
}

// =============================================================================
console.log('\n== Downgrade: plan limitado vs suspendido ==');
const D = await makeWorkspace('downgrade', PlanCode.PRO);
{
  // PRO (5): owner + 2 activos + 1 suspendido + 2 invitaciones = 5 ocupados.
  await addMember(D.workspaceId, (await makeUser('Down Uno')).id, WorkspaceRole.MEMBER);
  await addMember(D.workspaceId, (await makeUser('Down Dos')).id, WorkspaceRole.MEMBER);
  const d3 = await addMember(D.workspaceId, (await makeUser('Down Tres')).id, WorkspaceRole.MEMBER);
  await suspendMember(D.actor, d3.userId);
  const invA = await inviteTeamMember(D.actor, { email: `down-inv-a-${stamp}@p0f.test`, role: WorkspaceRole.MEMBER }, { sendEmail: false });
  await inviteTeamMember(D.actor, { email: `down-inv-b-${stamp}@p0f.test`, role: WorkspaceRole.MEMBER }, { sendEmail: false });
  const membershipsBefore = await prisma.workspaceMembership.count({ where: { workspaceId: D.workspaceId } });

  await assignCompSubscription({ workspaceId: D.workspaceId, planCode: PlanCode.START, ...cli });
  await reconcileWorkspaceEntitlements(D.workspaceId);
  const view = await getTeamView(D.actor);
  const limited = view.active.filter((m) => m.planLimited);
  // START (2) con 3 activos: 1 queda limitado por plan (sigue ACTIVE); el suspendido es otra cosa.
  check(
    '35. "Limitado por tu plan" (ACTIVE + planLimited) se distingue de SUSPENDED',
    limited.length === 1 && limited[0].status === 'ACTIVE' && limited[0].role !== 'OWNER' && view.suspended.length === 1 && view.suspended[0].planLimited === false,
    `limitados=${limited.length} suspendidos=${view.suspended.length}`,
  );
  check('36. El downgrade no borra memberships', (await prisma.workspaceMembership.count({ where: { workspaceId: D.workspaceId } })) === membershipsBefore);
  const blockedAccept = await expectError(() => acceptInvitation({ token: tokenOf(invA.url), newAccount: newAccount('Sin Cupo') }), isPlanLimit);
  const stillPending = await prisma.workspaceInvitation.findUniqueOrThrow({ where: { id: invA.invitation.id } });
  check(
    '37. Invitaciones pendientes fuera del nuevo limite: bloqueadas (sin borrar), aceptar da PLAN_LIMIT',
    view.invitations.length === 2 && view.invitations.every((i) => i.seatBlocked) && blockedAccept && !stillPending.acceptedAt && !stillPending.revokedAt,
  );
}

// =============================================================================
console.log('\n== Email, auditoria y onboarding ==');
{
  const invite = await inviteTeamMember(W.actor, { email: `mail-${stamp}@p0f.test`, role: WorkspaceRole.MEMBER }, { sendEmail: false });
  const usage = async () => (await prisma.usageCounter.aggregate({ where: { workspaceId: W.workspaceId, metric: { in: ['emails', 'emails.monthly'] } }, _sum: { quantity: true } }))._sum.quantity ?? 0;
  const before = await usage();
  const sent: string[] = [];
  const outcome = await sendInvitationEmail({ invitationId: invite.invitation.id, workspaceId: W.workspaceId, token: tokenOf(invite.url) }, async (input) => {
    sent.push(input.to);
    return { ok: true, providerMessageId: 'fake' } as never;
  });
  check('38. La invitacion sale por email de plataforma y no consume la cuota del tenant', outcome.sent && sent[0] === `mail-${stamp}@p0f.test` && (await usage()) === before);

  const actions = await prisma.auditLog.findMany({ where: { workspaceId: { in: [W.workspaceId, T.workspaceId, S2.workspaceId] }, action: { startsWith: 'workspace.' } }, select: { action: true, metadata: true } });
  const has = (action: string) => actions.some((a) => a.action === action);
  const roleChange = actions.find((a) => a.action === 'workspace.member.role_changed')?.metadata as { from?: string; to?: string; actor?: string } | null;
  check(
    '40. Auditoria: invitation created/revoked/resent y member role_changed(from,to,actor)/suspended/reactivated',
    ['workspace.invitation.created', 'workspace.invitation.revoked', 'workspace.invitation.resent', 'workspace.member.role_changed', 'workspace.member.suspended', 'workspace.member.reactivated'].every(has) &&
      Boolean(roleChange?.from && roleChange.to && roleChange.actor),
  );

  const body = { businessType: 'SERVICES', primaryGoal: 'LEADS', preferredChannels: ['WHATSAPP'], teamSize: 'SMALL' };
  const F = await makeWorkspace('free-team', PlanCode.FREE);
  await completeOnboarding(F.actor, body);
  const cF = await getChecklist(await getWorkspaceExperience({ ...F.actor }), { workspaceId: F.workspaceId, role: WorkspaceRole.OWNER });
  const teamF = cF.items.find((i) => i.id === 'invite_team');
  const Solo = await makeWorkspace('solo-team', PlanCode.PRO);
  await completeOnboarding(Solo.actor, { ...body, teamSize: 'SOLO' });
  const cSolo = await getChecklist(await getWorkspaceExperience({ ...Solo.actor }), { workspaceId: Solo.workspaceId, role: WorkspaceRole.OWNER });
  check('41. Onboarding FREE: "Invita a tu equipo" bloqueada (Start); con teamSize SOLO no es relevante', teamF?.state === 'locked' && teamF.lockedPlan === 'Start' && !cSolo.items.some((i) => i.id === 'invite_team'));

  const St = await makeWorkspace('start-team', PlanCode.START);
  await completeOnboarding(St.actor, body);
  const before42 = (await getChecklist(await getWorkspaceExperience({ ...St.actor }), { workspaceId: St.workspaceId, role: WorkspaceRole.OWNER })).items.find((i) => i.id === 'invite_team');
  const inv = await inviteTeamMember(St.actor, { email: `onb-${stamp}@p0f.test`, role: WorkspaceRole.MEMBER }, { sendEmail: false });
  const withPending = (await getChecklist(await getWorkspaceExperience({ ...St.actor }), { workspaceId: St.workspaceId, role: WorkspaceRole.OWNER })).items.find((i) => i.id === 'invite_team');
  await prisma.workspaceInvitation.update({ where: { id: inv.invitation.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const withExpired = (await getChecklist(await getWorkspaceExperience({ ...St.actor }), { workspaceId: St.workspaceId, role: WorkspaceRole.OWNER })).items.find((i) => i.id === 'invite_team');
  check(
    '42. START+: disponible; se completa con una invitacion vigente (no con una vencida ni por abrir la pantalla)',
    before42?.state === 'available' && before42.href === '/configuracion/equipo' && withPending?.state === 'completed' && withExpired?.state === 'available',
  );
}

// =============================================================================
console.log('\n== Invitaciones de /platform tambien reservan asiento ==');
{
  const operator = await prisma.user.create({ data: { name: 'Operador', email: `operador-${stamp}@p0f.test`, passwordHash: 'x', platformRole: PlatformRole.PLATFORM_ADMIN } });
  createdUsers.push(operator.id);
  const opSession: Session = { id: operator.id, workspaceId: null };
  const platformInvite = (workspaceId: string, email: string) =>
    asUser(opSession, () => platformInviteRoute(req('/api/platform/invitations', { workspaceId, email, role: 'MEMBER', sendEmail: false })));

  const PL = await makeWorkspace('platform-seat', PlanCode.START);
  const first = await platformInvite(PL.workspaceId, `pl-a-${stamp}@p0f.test`);
  const firstId = ((await json(first)).data as { invitationId: string }).invitationId;
  const firstRow = await prisma.workspaceInvitation.findUniqueOrThrow({ where: { id: firstId } });
  const s1 = await seats(PL.workspaceId);
  check('P1. Invitacion de /platform reserva asiento (origen PLATFORM)', first.status === 201 && firstRow.origin === InvitationOrigin.PLATFORM && s1.reserved === 1 && s1.remaining === 0);

  const full = await platformInvite(PL.workspaceId, `pl-b-${stamp}@p0f.test`);
  const fullBody = await json(full);
  const direct = await expectError(
    () => createInvitation({ workspaceId: PL.workspaceId, email: `pl-c-${stamp}@p0f.test`, role: WorkspaceRole.MEMBER, actorId: operator.id, via: 'platform' }),
    isPlanLimit,
  );
  check('P2. /platform con el plan lleno → PLAN_LIMIT (sin bypass de operador)', full.status === 409 && fullBody.code === 'PLAN_LIMIT' && direct && (await seats(PL.workspaceId)).reserved === 1, `${full.status} ${fullBody.code}`);

  const RX = await makeWorkspace('platform-race', PlanCode.START);
  const race = await Promise.allSettled([
    inviteTeamMember(RX.actor, { email: `rx-ws-${stamp}@p0f.test`, role: WorkspaceRole.MEMBER }, { sendEmail: false }),
    createInvitation({ workspaceId: RX.workspaceId, email: `rx-pl-${stamp}@p0f.test`, role: WorkspaceRole.MEMBER, actorId: operator.id, via: 'platform' }),
  ]);
  const won = race.filter((r) => r.status === 'fulfilled').length;
  const lost = race.filter((r) => r.status === 'rejected' && isPlanLimit(r.reason)).length;
  check('P3. Carrera Workspace + Platform por el ultimo asiento: solo una gana', won === 1 && lost === 1 && (await seats(RX.workspaceId)).reserved === 1, `${won}/${lost}`);

  await revokeInvitation({ workspaceId: PL.workspaceId, invitationId: firstId, actorId: operator.id, via: 'platform' });
  const s2 = await seats(PL.workspaceId);
  check('P4. Revocar una invitacion de /platform libera el asiento', s2.reserved === 0 && s2.remaining === 1);

  const second = await createInvitation({ workspaceId: PL.workspaceId, email: `pl-d-${stamp}@p0f.test`, role: WorkspaceRole.MEMBER, actorId: operator.id, via: 'platform' });
  await prisma.workspaceInvitation.update({ where: { id: second.invitation.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const s3 = await seats(PL.workspaceId);
  const afterExpiry = await platformInvite(PL.workspaceId, `pl-e-${stamp}@p0f.test`);
  check('P5. Una invitacion de /platform vencida libera el asiento (se puede invitar otra)', s3.reserved === 0 && s3.remaining === 1 && afterExpiry.status === 201);
}

// =============================================================================
console.log('\n== Endpoints directos y OWNER ==');
{
  const memberSuspends = await asUser(sessionOf(M), () => memberRoute(req(`/api/team/members/${W.actor.userId}`, { action: 'suspend' }), { params: Promise.resolve({ userId: W.actor.userId }) }));
  const memberPromotes = await asUser(sessionOf(M), () => memberRoute(req(`/api/team/members/${M.userId}`, { action: 'change_role', role: 'OWNER' }), { params: Promise.resolve({ userId: M.userId }) }));
  const foreignTarget = await asUser(W.session, () => memberRoute(req(`/api/team/members/${T.ownerId}`, { action: 'suspend' }), { params: Promise.resolve({ userId: T.ownerId }) }));
  const smuggled = await asUser(W.session, () => inviteRoute(req('/api/team/invitations', { email: `smuggle-${stamp}@p0f.test`, role: 'MEMBER', workspaceId: T.workspaceId })));
  const tOwnerStill = await isActiveMember(T.workspaceId, T.ownerId);
  check(
    '44. Endpoint directo no evade el rol: MEMBER 403 (suspender / auto-promoverse), objetivo de otro workspace 404, workspaceId en el cuerpo 400',
    memberSuspends.status === 403 && memberPromotes.status === 403 && foreignTarget.status === 404 && smuggled.status === 400 && tOwnerStill,
    `${memberSuspends.status}/${memberPromotes.status}/${foreignTarget.status}/${smuggled.status}`,
  );
  const zeroOwner = [];
  for (const id of createdWorkspaces) {
    const owners = await prisma.workspaceMembership.count({ where: { workspaceId: id, role: 'OWNER', status: 'ACTIVE' } });
    if (owners === 0) zeroOwner.push(id);
  }
  check('45. Ninguna operacion dejo un workspace sin OWNER', zeroOwner.length === 0, zeroOwner.join(','));
}

// =============================================================================
await crossTenantPrisma.platformAuditLog.deleteMany({ where: { OR: [{ targetWorkspaceId: { in: createdWorkspaces } }, { targetUserId: { in: createdUsers } }, { actorUserId: { in: createdUsers } }] } });
const memberUsers = (await prisma.workspaceMembership.findMany({ where: { workspaceId: { in: createdWorkspaces } }, select: { userId: true } })).map((m) => m.userId);
await crossTenantPrisma.workspace.deleteMany({ where: { id: { in: createdWorkspaces } } });
const cleaned = await crossTenantPrisma.user.deleteMany({ where: { id: { in: [...new Set([...createdUsers, ...memberUsers])] } } });
console.log(`\nLimpieza: ${createdWorkspaces.length} workspaces y ${cleaned.count} cuentas de prueba eliminados.`);

const passed = results.filter((result) => result.ok).length;
console.log(`\n== Resultado: ${passed}/${results.length} pruebas OK ==`);
await prisma.$disconnect();
if (failures > 0) process.exit(1);
