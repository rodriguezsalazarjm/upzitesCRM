/**
 * P0-D: Platform Admin + Manual Billing + Invitations, y FOUNDATION step 2
 * (cuenta global con email unico).
 *
 * Uso, desde apps/crm (exige TEST_DATABASE_URL con el marcador de base aislada):
 *   pnpm exec tsx scripts/smoke-p0d.ts
 */
import './fixtures/test-environment';
import { randomUUID } from 'node:crypto';
import { BillingSource, PlanCode, PlatformRole, WorkspaceRole } from '../generated/prisma/client';
import { crossTenantPrisma, prisma } from '../src/lib/prisma';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { assignCompSubscription } from '../src/lib/billing/subscription-admin';
import { getCurrentPrice } from '../src/lib/billing/price-book';
import { resolveSubscription } from '../src/lib/billing/subscription-access';
import { addMembershipWithinPlan } from '../src/lib/entitlements/growth';
import { isEntitlementError } from '../src/lib/entitlements';
import {
  acceptInvitation,
  createInvitation,
  hashInvitationToken,
  InvitationError,
  resendInvitation,
  revokeInvitation,
  sendInvitationEmail,
} from '../src/lib/invitations';
import { currentPlatformActor } from '../src/lib/platform/access';
import { PlatformRoleError, setPlatformRoleInScopeForTests } from '../src/lib/platform/roles';
import { getSaasMetrics } from '../src/lib/platform/saas-metrics';
import { listSaasPayments } from '../src/lib/platform/clients';
import { listMyWorkspaces } from '../src/lib/membership';
import { pickWorkspaceForUser } from '../src/lib/workspace-switch';
import { asUser, asUserCapturingSession, flushAfterTasks, pendingAfterTasks, throughProxy } from './fixtures/request-context';
import { readSessionCookie } from '../src/lib/session';
import { createSessionToken, readSessionToken, signSessionPayload } from '../src/lib/session-token';
import { revokeAllSessions } from '../src/lib/session-revocation';
import { resolveContextForSession } from '../src/lib/workspace-context';
import { POST as login } from '../src/app/api/auth/login/route';
import { POST as passwordReset } from '../src/app/api/auth/password-reset/route';
import { POST as confirmReset } from '../src/app/api/auth/password-reset/confirm/route';
import { hashResetToken } from '../src/lib/auth';
import { verifyPassword } from '../src/lib/password';
import {
  confirmPasswordReset,
  deliverPasswordResetEmail,
  PASSWORD_RESET_PUBLIC_RESPONSE,
  requestPasswordReset,
  inspectPasswordResetToken,
  issuePasswordReset,
  PasswordResetError,
  sendPasswordResetEmail,
} from '../src/lib/password-reset';
import { POST as switchRoute } from '../src/app/api/workspaces/switch/route';
import { POST as createClientRoute } from '../src/app/api/platform/clients/route';
import { POST as workspaceAction } from '../src/app/api/platform/workspaces/[id]/route';
import { POST as inviteRoute } from '../src/app/api/platform/invitations/route';
import { POST as rolesRoute } from '../src/app/api/platform/roles/route';
import { POST as pricesRoute } from '../src/app/api/platform/prices/route';
import { POST as acceptRoute } from '../src/app/api/invitations/accept/route';
import { POST as startSupport } from '../src/app/api/platform/support-sessions/route';
import { POST as elevateSupport } from '../src/app/api/platform/support-sessions/elevate/route';
import { POST as createContact } from '../src/app/api/contacts/route';

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
const DAY = 86_400_000;
const createdWorkspaces: string[] = [];
const createdUsers: string[] = [];
const cli = { via: 'cli' as const, reason: 'smoke p0d' };
let ipSeq = 1;
const ip = () => `198.51.${Math.floor(stamp / 1000) % 250}.${(ipSeq++ % 250) + 1}`;

type Session = { id: string; workspaceId: string | null; supportSessionId?: string | null };

async function makeWorkspace(suffix: string, emailOverride?: string) {
  const email = emailOverride ?? `owner-${suffix}-${stamp}@p0d.test`;
  const created = await createCustomerWorkspace({
    companyName: `p0d-${suffix}-${stamp}`,
    ownerName: `Owner ${suffix}`,
    email,
    password: 'contrasena-de-prueba-1234',
  });
  createdWorkspaces.push(created.workspace.id);
  createdUsers.push(created.user.id);
  return { workspaceId: created.workspace.id, userId: created.user.id, email, session: { id: created.user.id, workspaceId: created.workspace.id } as Session };
}

async function makeUser(label: string, role: PlatformRole = PlatformRole.USER) {
  const user = await prisma.user.create({
    data: { name: label, email: `${label.toLowerCase().replace(/\s+/g, '-')}-${stamp}@p0d.test`, passwordHash: 'x', platformRole: role },
  });
  createdUsers.push(user.id);
  return user;
}

function req(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip(), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json(response: Response) {
  return (await response.clone().json().catch(() => ({}))) as { code?: string; message?: string; data?: Record<string, unknown> };
}

async function expectError<T>(run: () => Promise<T>, test: (error: unknown) => boolean) {
  try {
    await run();
    return false;
  } catch (error) {
    return test(error);
  }
}

// =============================================================================
console.log('\n== FOUNDATION step 2: cuenta global ==');
const U_EMAIL = `global-${stamp}@p0d.test`;
const A = await makeWorkspace('global-a', U_EMAIL);
const B = await makeWorkspace('global-b');
const C = await makeWorkspace('global-c');
{
  const U = A.userId;
  const userRow = await prisma.user.findUniqueOrThrow({ where: { id: U } });
  check('Alta nueva: User global sin workspace de origen (workspace_id NULL)', userRow.workspaceId === null && userRow.email === U_EMAIL);
  // B y C con cupo de usuarios.
  for (const ws of [B, C]) await assignCompSubscription({ workspaceId: ws.workspaceId, planCode: PlanCode.SCALE, ...cli });
  await addMembershipWithinPlan({ workspaceId: B.workspaceId, userId: U, role: WorkspaceRole.ADMIN });
  await addMembershipWithinPlan({ workspaceId: C.workspaceId, userId: U, role: WorkspaceRole.MEMBER });
  const mine = await listMyWorkspaces(U);
  check('Un solo User con memberships A OWNER, B ADMIN, C MEMBER', mine.length === 3 && (await prisma.user.count({ where: { email: U_EMAIL } })) === 1, mine.map((m) => m.role).join(','));

  const loginResponse = await asUser(null, () => login(req('/api/auth/login', { email: `  ${U_EMAIL.toUpperCase()} `, password: 'contrasena-de-prueba-1234' })));
  check('Login con email global (normalizado: mayusculas y espacios)', loginResponse.status === 200, `${loginResponse.status}`);

  const session: Session = { id: U, workspaceId: A.workspaceId };
  const toB = await asUser(session, () => switchRoute(req('/api/workspaces/switch', { workspaceId: B.workspaceId })));
  const toC = await asUser({ id: U, workspaceId: B.workspaceId }, () => switchRoute(req('/api/workspaces/switch', { workspaceId: C.workspaceId })));
  check('Cambio A → B → C', toB.status === 200 && toC.status === 200);

  const duplicate = await expectError(
    () => createCustomerWorkspace({ companyName: 'dup', ownerName: 'Dup', email: U_EMAIL.toUpperCase(), password: 'contrasena-de-prueba-1234' }),
    (error) => error instanceof Error && error.message === 'EMAIL_ALREADY_EXISTS',
  );
  check('El mismo email (en otra capitalizacion) no crea un segundo User', duplicate && (await prisma.user.count({ where: { email: U_EMAIL } })) === 1);

  const reset = await asUser(null, () => passwordReset(req('/api/auth/password-reset', { email: U_EMAIL.toUpperCase() })));
  const tokens = await prisma.passwordResetToken.count({ where: { userId: U } });
  check('Reset de contrasena con email global', reset.status === 200 && tokens === 1);

  // lastActiveWorkspace apunta al workspace que se borra.
  await prisma.user.update({ where: { id: U }, data: { lastActiveWorkspaceId: A.workspaceId } });
  await crossTenantPrisma.workspace.delete({ where: { id: A.workspaceId } });
  const survivor = await prisma.user.findUnique({ where: { id: U } });
  const remaining = await listMyWorkspaces(U);
  const entry = await pickWorkspaceForUser(U);
  check('Borrar el workspace A NO borra la cuenta global', Boolean(survivor) && survivor?.lastActiveWorkspaceId === null);
  check('Memberships en B y C sobreviven', remaining.length === 2 && remaining.every((m) => [B.workspaceId, C.workspaceId].includes(m.id)));
  check('El workspace de entrada se recupera (B o C)', entry === B.workspaceId || entry === C.workspaceId, entry ?? 'null');
  const relogin = await asUser(null, () => login(req('/api/auth/login', { email: U_EMAIL, password: 'contrasena-de-prueba-1234' })));
  check('Y el login sigue funcionando', relogin.status === 200);
}

// =============================================================================
console.log('\n== 1-4. Acceso a /platform ==');
const plainUser = await makeUser('Plain User');
const OWNER_WS = await makeWorkspace('owner');
const PA = await makeUser('Platform Admin', PlatformRole.PLATFORM_ADMIN);
const SA = await makeUser('Super Admin', PlatformRole.SUPER_ADMIN);
const paSession: Session = { id: PA.id, workspaceId: null };
const saSession: Session = { id: SA.id, workspaceId: null };
{
  const probe = (session: Session) => asUser(session, () => currentPlatformActor());
  const denied = async (session: Session) =>
    (await asUser(session, () => createClientRoute(req('/api/platform/clients', { idempotencyKey: randomUUID(), workspaceName: 'x', planCode: 'FREE', billingSource: 'FREE' })))).status === 404;
  check('1. USER no entra a /platform (actor null, API 404)', (await probe({ id: plainUser.id, workspaceId: null })) === null && (await denied({ id: plainUser.id, workspaceId: null })));
  check('2. OWNER de un workspace no entra (API 404)', (await probe(OWNER_WS.session)) === null && (await denied(OWNER_WS.session)));
  check('3. PLATFORM_ADMIN entra', (await probe(paSession))?.platformRole === PlatformRole.PLATFORM_ADMIN);
  check('4. SUPER_ADMIN entra', (await probe(saSession))?.platformRole === PlatformRole.SUPER_ADMIN);
}

// =============================================================================
console.log('\n== 5-6, 19-20. Alta de clientes ==');
let proClient = '';
{
  const ownerEmail = `client-owner-${stamp}@p0d.test`;
  const response = await asUser(paSession, () =>
    createClientRoute(
      req('/api/platform/clients', {
        idempotencyKey: `client-free-${stamp}`,
        workspaceName: `p0d Cliente Free ${stamp}`,
        ownerName: 'Duena',
        ownerEmail,
        planCode: 'FREE',
        billingSource: 'FREE',
      }),
    ),
  );
  const body = await json(response);
  const workspaceId = String(body.data?.workspaceId ?? '');
  createdWorkspaces.push(workspaceId);
  const invitation = await prisma.workspaceInvitation.findFirst({ where: { workspaceId, email: ownerEmail } });
  const profile = await prisma.workspaceProfile.findUnique({ where: { workspaceId } });
  const sub = await resolveSubscription(workspaceId);
  check(
    '5. Crear cliente SaaS: workspace + perfil + suscripcion + invitacion OWNER, sin contrasena ni User',
    response.status === 201 && Boolean(invitation && profile) && invitation?.role === WorkspaceRole.OWNER && (await prisma.user.count({ where: { email: ownerEmail } })) === 0,
    `${response.status}`,
  );
  check('   devuelve el enlace de invitacion una vez', typeof body.data?.invitationUrl === 'string' && String(body.data.invitationUrl).includes('/invitacion/'));
  check('19. Cliente FREE sin pago', sub.state === 'FREE' && (await prisma.subscriptionPayment.count({ where: { workspaceId } })) === 0);
  const again = await asUser(paSession, () =>
    createClientRoute(req('/api/platform/clients', { idempotencyKey: `client-free-${stamp}`, workspaceName: `p0d Cliente Free ${stamp}`, ownerEmail, planCode: 'FREE', billingSource: 'FREE' })),
  );
  check('   doble submit del alta: mismo workspace', (await json(again)).data?.workspaceId === workspaceId && again.status === 200);

  const pro = await asUser(paSession, () =>
    createClientRoute(
      req('/api/platform/clients', {
        idempotencyKey: `client-pro-${stamp}`,
        workspaceName: `p0d Cliente Pro ${stamp}`,
        ownerEmail: `pro-owner-${stamp}@p0d.test`,
        planCode: 'PRO',
        billingSource: 'MANUAL',
        currency: 'CLP',
        payment: { reference: 'TRANSF-P0D' },
      }),
    ),
  );
  proClient = String((await json(pro)).data?.workspaceId ?? '');
  createdWorkspaces.push(proClient);
  const proSub = await resolveSubscription(proClient);
  const proPayments = await prisma.subscriptionPayment.findMany({ where: { workspaceId: proClient } });
  check('20. PRO + MANUAL con pago recibido: ACTIVE y un SubscriptionPayment', proSub.state === 'ACTIVE' && proSub.billingSource === BillingSource.MANUAL && proPayments.length === 1 && proPayments[0].amountMinor === 49990);

  const paInternal = await asUser(paSession, () =>
    createClientRoute(req('/api/platform/clients', { idempotencyKey: `internal-pa-${stamp}`, workspaceName: 'x internal', planCode: 'SCALE', billingSource: 'COMP', isInternal: true, addActorAsOwner: true, reason: 'x' })),
  );
  const saInternal = await asUser(saSession, () =>
    createClientRoute(
      req('/api/platform/clients', {
        idempotencyKey: `internal-sa-${stamp}`,
        workspaceName: `p0d Negocio Propio ${stamp}`,
        planCode: 'SCALE',
        billingSource: 'COMP',
        isInternal: true,
        addActorAsOwner: true,
        reason: 'Negocio propio',
      }),
    ),
  );
  const internalId = String((await json(saInternal)).data?.workspaceId ?? '');
  createdWorkspaces.push(internalId);
  const internalWs = await prisma.workspace.findUnique({ where: { id: internalId } });
  const ownerMembership = await prisma.workspaceMembership.findFirst({ where: { workspaceId: internalId, userId: SA.id, role: WorkspaceRole.OWNER } });
  const ownerAudit = await crossTenantPrisma.platformAuditLog.count({ where: { targetWorkspaceId: internalId, action: 'platform.internal_owner_membership' } });
  const internalSub = await resolveSubscription(internalId);
  check(
    '6. Negocio interno solo SUPER_ADMIN (PLATFORM_ADMIN 403); SCALE+COMP y OWNER auditado',
    paInternal.status === 403 && saInternal.status === 201 && internalWs?.isInternal === true && Boolean(ownerMembership) && ownerAudit === 1 && internalSub.effectivePlan === PlanCode.SCALE && internalSub.billingSource === BillingSource.COMP,
    `${paInternal.status}/${saInternal.status}`,
  );

  // 25-26: MRR.
  const metrics = await getSaasMetrics();
  check('25. El negocio interno queda fuera del MRR', !metrics.payingWorkspaceIds.includes(internalId));
  check('26. El cliente SaaS PRO + MANUAL entra al MRR', metrics.payingWorkspaceIds.includes(proClient));
}

// =============================================================================
console.log('\n== 7-15. Invitaciones ==');
const INV = await makeWorkspace('inv');
await assignCompSubscription({ workspaceId: INV.workspaceId, planCode: PlanCode.SCALE, ...cli });
{
  const email = `invitee-${stamp}@p0d.test`;
  const created = await createInvitation({ workspaceId: INV.workspaceId, email, role: WorkspaceRole.MEMBER, actorId: PA.id, via: 'platform' });
  const row = await prisma.workspaceInvitation.findUniqueOrThrow({ where: { id: created.invitation.id } });
  check('7. Invitacion nueva (MEMBER, vence en 7 dias)', row.role === WorkspaceRole.MEMBER && Math.round((row.expiresAt.getTime() - row.createdAt.getTime()) / DAY) === 7);
  const columns = Object.values(row).map(String);
  check('8. En la base solo esta el HASH del token', row.tokenHash === hashInvitationToken(created.token) && !columns.some((v) => v.includes(created.token)));

  check('9. Token incorrecto', await expectError(() => acceptInvitation({ token: 'x'.repeat(43), newAccount: { name: 'X', password: '12345678', confirmPassword: '12345678' } }), (e) => e instanceof InvitationError && e.code === 'NOT_FOUND'));

  const expired = await createInvitation({ workspaceId: INV.workspaceId, email: `expired-${stamp}@p0d.test`, role: WorkspaceRole.MEMBER });
  await prisma.workspaceInvitation.update({ where: { id: expired.invitation.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  check('10. Token vencido', await expectError(() => acceptInvitation({ token: expired.token, newAccount: { name: 'Vencida', password: '12345678', confirmPassword: '12345678' } }), (e) => e instanceof InvitationError && e.code === 'EXPIRED'));

  // 14. Usuario nuevo acepta (via API: queda con sesion en el workspace).
  const accepted = await asUser(null, () => acceptRoute(req('/api/invitations/accept', { token: created.token, name: 'Invitada Nueva', password: 'clave-segura-1', confirmPassword: 'clave-segura-1' })));
  const newUser = await prisma.user.findUnique({ where: { email } });
  if (newUser) createdUsers.push(newUser.id);
  const newMembership = newUser ? await prisma.workspaceMembership.findUnique({ where: { userId_workspaceId: { userId: newUser.id, workspaceId: INV.workspaceId } } }) : null;
  check('14. Usuario nuevo acepta: User global + membership, sin workspace extra', accepted.status === 200 && Boolean(newMembership) && newUser?.workspaceId === null && (await prisma.workspaceMembership.count({ where: { userId: newUser!.id } })) === 1, `${accepted.status}`);
  // P0-F: la MISMA cuenta que acepto recibe respuesta idempotente; para
  // cualquier otra (o sin sesion) el token ya no sirve.
  const repeated = await acceptInvitation({ token: created.token, sessionUserId: newUser?.id });
  check(
    '11. El mismo token no sirve dos veces (salvo respuesta idempotente a quien ya acepto)',
    (await expectError(() => acceptInvitation({ token: created.token, newAccount: { name: 'Otro', password: '12345678', confirmPassword: '12345678' } }), (e) => e instanceof InvitationError && e.code === 'ALREADY_ACCEPTED')) &&
      repeated.alreadyAccepted === true && repeated.userId === newUser?.id,
  );

  const toRevoke = await createInvitation({ workspaceId: INV.workspaceId, email: `revoked-${stamp}@p0d.test`, role: WorkspaceRole.MEMBER });
  await revokeInvitation({ workspaceId: INV.workspaceId, invitationId: toRevoke.invitation.id, actorId: PA.id, via: 'platform' });
  check('12. Revocada no se puede aceptar', await expectError(() => acceptInvitation({ token: toRevoke.token, newAccount: { name: 'R', password: '12345678', confirmPassword: '12345678' } }), (e) => e instanceof InvitationError && e.code === 'REVOKED'));

  const toResend = await createInvitation({ workspaceId: INV.workspaceId, email: `resend-${stamp}@p0d.test`, role: WorkspaceRole.MEMBER });
  const resent = await resendInvitation({ workspaceId: INV.workspaceId, invitationId: toResend.invitation.id });
  const oldFails = await expectError(() => acceptInvitation({ token: toResend.token, newAccount: { name: 'R', password: '12345678', confirmPassword: '12345678' } }), (e) => e instanceof InvitationError && e.code === 'NOT_FOUND');
  const newWorks = await acceptInvitation({ token: resent.token, newAccount: { name: 'Reenviada', password: '12345678', confirmPassword: '12345678' } });
  createdUsers.push(newWorks.userId);
  check('13. Reenviar invalida el token anterior (y el nuevo funciona)', oldFails && newWorks.createdAccount);

  // 15-16. Usuario existente acepta un segundo workspace.
  const other = await makeWorkspace('inv-existing');
  const existingInvite = await createInvitation({ workspaceId: INV.workspaceId, email: other.email.toUpperCase(), role: WorkspaceRole.ADMIN });
  const needsLogin = await expectError(() => acceptInvitation({ token: existingInvite.token, newAccount: { name: 'Intruso', password: '12345678', confirmPassword: '12345678' } }), (e) => e instanceof InvitationError && e.code === 'AUTH_REQUIRED');
  const wrongAccount = await expectError(() => acceptInvitation({ token: existingInvite.token, sessionUserId: newUser!.id }), (e) => e instanceof InvitationError && e.code === 'WRONG_ACCOUNT');
  const acceptedExisting = await asUser(other.session, () => acceptRoute(req('/api/invitations/accept', { token: existingInvite.token })));
  check(
    '15. Usuario existente: exige su sesion y solo agrega la membership (sin segundo User)',
    needsLogin && wrongAccount && acceptedExisting.status === 200 && (await prisma.user.count({ where: { email: other.email } })) === 1 && (await listMyWorkspaces(other.userId)).length === 2,
  );
  const switched = await asUser(other.session, () => switchRoute(req('/api/workspaces/switch', { workspaceId: INV.workspaceId })));
  const back = await asUser({ id: other.userId, workspaceId: INV.workspaceId }, () => switchRoute(req('/api/workspaces/switch', { workspaceId: other.workspaceId })));
  check('16. El cambio de workspace funciona despues de aceptar', switched.status === 200 && back.status === 200);

  // 17. P0-F: toda invitacion reserva asiento. En FREE (1 usuario, ya esta el
  // OWNER) no se puede ni crear; y si un downgrade deja una invitacion sin
  // asiento, aceptarla da PLAN_LIMIT (defensa al aceptar).
  const FREE_WS = await makeWorkspace('inv-free');
  const noSeat = await expectError(
    () => createInvitation({ workspaceId: FREE_WS.workspaceId, email: `nocabe-${stamp}@p0d.test`, role: WorkspaceRole.MEMBER, actorId: PA.id, via: 'platform' }),
    (e) => isEntitlementError(e) && e.code === 'PLAN_LIMIT',
  );
  const DOWN = await makeWorkspace('inv-down');
  await assignCompSubscription({ workspaceId: DOWN.workspaceId, planCode: PlanCode.START, ...cli });
  const downInvite = await createInvitation({ workspaceId: DOWN.workspaceId, email: `nocabe-${stamp}@p0d.test`, role: WorkspaceRole.MEMBER, actorId: PA.id, via: 'platform' });
  await assignCompSubscription({ workspaceId: DOWN.workspaceId, planCode: PlanCode.FREE, ...cli });
  const noRoom = await expectError(() => acceptInvitation({ token: downInvite.token, newAccount: { name: 'Sin Cupo', password: '12345678', confirmPassword: '12345678' } }), (e) => isEntitlementError(e) && e.code === 'PLAN_LIMIT');
  const stillPending = await prisma.workspaceInvitation.findUniqueOrThrow({ where: { id: downInvite.invitation.id } });
  check(
    '17. Sin cupo: no se crea la invitacion; y una que quedo sin asiento no se acepta (PLAN_LIMIT, sigue pendiente, sin User)',
    noSeat && noRoom && stillPending.acceptedAt === null && (await prisma.user.count({ where: { email: `nocabe-${stamp}@p0d.test` } })) === 0,
  );

  // 18. Carrera al aceptar: PRO con 2 invitaciones; baja a START (1 asiento
  // libre) → la mas antigua conserva el asiento, la otra queda bloqueada.
  // Dos aceptaciones simultaneas: entra una.
  const RACE = await makeWorkspace('inv-race');
  await assignCompSubscription({ workspaceId: RACE.workspaceId, planCode: PlanCode.PRO, ...cli });
  const invites = [];
  for (const n of [1, 2]) invites.push(await createInvitation({ workspaceId: RACE.workspaceId, email: `race-${n}-${stamp}@p0d.test`, role: WorkspaceRole.MEMBER }));
  await assignCompSubscription({ workspaceId: RACE.workspaceId, planCode: PlanCode.START, ...cli });
  const race = await Promise.allSettled(invites.map((inv, n) => acceptInvitation({ token: inv.token, newAccount: { name: `Race ${n}`, password: '12345678', confirmPassword: '12345678' } })));
  for (const r of race) if (r.status === 'fulfilled') createdUsers.push(r.value.userId);
  const members = await prisma.workspaceMembership.count({ where: { workspaceId: RACE.workspaceId, status: 'ACTIVE' } });
  check('18. Dos aceptaciones simultaneas no superan users.max (1 entra)', race.filter((r) => r.status === 'fulfilled').length === 1 && members === 2, `${members}`);

  // 27-28. Email de plataforma.
  const mailInvite = await createInvitation({ workspaceId: INV.workspaceId, email: `mail-${stamp}@p0d.test`, role: WorkspaceRole.MEMBER });
  const sent: string[] = [];
  const outcome = await sendInvitationEmail({ invitationId: mailInvite.invitation.id, workspaceId: INV.workspaceId, token: mailInvite.token }, async (input) => {
    sent.push(input.to);
    return { ok: true, providerMessageId: 'fake-1' };
  });
  const tenantEmailUsage = await prisma.usageCounter.count({ where: { workspaceId: INV.workspaceId, metric: 'emails' } });
  const tenantEmailRows = await prisma.emailMessage.count({ where: { workspaceId: INV.workspaceId } });
  check('27. La invitacion sale por email de plataforma y NO consume la cuota de email del workspace', outcome.sent && sent[0] === `mail-${stamp}@p0d.test` && tenantEmailUsage === 0 && tenantEmailRows === 0);
  const viaApi = await asUser(paSession, () => inviteRoute(req('/api/platform/invitations', { workspaceId: INV.workspaceId, email: `copy-${stamp}@p0d.test` })));
  const viaApiBody = await json(viaApi);
  check('28. Sin proveedor: la invitacion se crea igual y devuelve el enlace para copiar', viaApi.status === 201 && viaApiBody.data?.emailSent === false && String(viaApiBody.data?.invitationUrl).includes('/invitacion/'));
}

// =============================================================================
console.log('\n== 21-24. Billing manual y estado ==');
{
  const endpoint = `/api/platform/workspaces/${proClient}`;
  const action = (session: Session, body: Record<string, unknown>) => asUser(session, () => workspaceAction(req(endpoint, body), { params: Promise.resolve({ id: proClient }) }));
  const priceBefore = await getCurrentPrice({ planCode: PlanCode.PRO, currency: 'CLP' });
  const noReason = await action(paSession, { action: 'renew', idempotencyKey: `renew-noreason-${stamp}`, amountMinor: 39990 });
  const custom = await action(paSession, { action: 'renew', idempotencyKey: `renew-custom-${stamp}`, amountMinor: 39990, notes: 'Acuerdo comercial 20% primer ano', reference: 'TRANSF-2' });
  const payment = await prisma.subscriptionPayment.findFirst({ where: { workspaceId: proClient, reference: 'TRANSF-2' } });
  const override = await crossTenantPrisma.platformAuditLog.findFirst({ where: { targetWorkspaceId: proClient, action: 'subscription.manual_price_override' } });
  const meta = (override?.metadata ?? {}) as Record<string, unknown>;
  const priceAfter = await getCurrentPrice({ planCode: PlanCode.PRO, currency: 'CLP' });
  check(
    '21. Monto manual distinto del Price Book: se guarda el real, se audita manual_price_override y el Price Book no cambia',
    noReason.status === 409 && custom.status === 200 && payment?.amountMinor === 39990 && meta.priceBookAmountMinor === 49990 && meta.amountMinor === 39990 && priceAfter?.id === priceBefore?.id && priceAfter?.amountMinor === 49990,
    `${noReason.status}/${custom.status}`,
  );

  const key = `double-${stamp}`;
  const before = await prisma.subscriptionPayment.count({ where: { workspaceId: proClient } });
  const periodBefore = (await resolveSubscription(proClient)).periodEnd?.getTime();
  const [first, second] = await Promise.all([
    action(paSession, { action: 'renew', idempotencyKey: key, reference: 'DOBLE' }),
    action(paSession, { action: 'renew', idempotencyKey: key, reference: 'DOBLE' }),
  ]);
  const after = await prisma.subscriptionPayment.count({ where: { workspaceId: proClient } });
  const periodAfter = (await resolveSubscription(proClient)).periodEnd?.getTime() ?? 0;
  check(
    '22. Doble submit manual: un solo pago y una sola renovacion',
    first.status === 200 && second.status === 200 && after === before + 1 && Math.round((periodAfter - (periodBefore ?? 0)) / DAY) <= 31,
    `${before}→${after}`,
  );

  const paComp = await action(paSession, { action: 'comp', planCode: 'SCALE', reason: 'intento' });
  const paCompClient = await asUser(paSession, () => createClientRoute(req('/api/platform/clients', { idempotencyKey: `comp-pa-${stamp}`, workspaceName: 'comp pa', ownerEmail: `comp-${stamp}@p0d.test`, planCode: 'SCALE', billingSource: 'COMP', reason: 'x' })));
  check('23. COMP solo SUPER_ADMIN (PLATFORM_ADMIN recibe 403, en accion y en alta)', paComp.status === 403 && paCompClient.status === 403);

  const suspended = await action(paSession, { action: 'suspend', reason: 'Revision de pagos' });
  const stateSuspended = (await resolveSubscription(proClient)).state;
  const resumed = await action(paSession, { action: 'resume', reason: 'Resuelto' });
  check('24. Suspender y reactivar', suspended.status === 200 && stateSuspended === 'SUSPENDED' && resumed.status === 200 && (await resolveSubscription(proClient)).state === 'ACTIVE');
}

// =============================================================================
console.log('\n== 29-30. Soporte ==');
{
  const target = await makeWorkspace('support');
  const start = await asUser(paSession, () => startSupport(req('/api/platform/support-sessions', { workspaceId: target.workspaceId, reason: 'Ayuda con configuracion' })));
  const supportSessionId = String((await json(start)).data?.supportSessionId ?? '');
  const session: Session = { id: PA.id, workspaceId: target.workspaceId, supportSessionId };
  const write = await throughProxy({ user: session, method: 'POST', path: '/api/contacts', body: { firstName: 'No', lastName: 'Deberia' } }, (r) => createContact(r));
  const row = await prisma.supportSession.findUnique({ where: { id: supportSessionId } });
  check('29. Soporte nace READ_ONLY y bloquea escrituras', start.status === 201 && row?.mode === 'READ_ONLY' && write.status === 403 && (await json(write)).code === 'SUPPORT_READ_ONLY');
  const noReason = await asUser(session, () => elevateSupport(req('/api/platform/support-sessions/elevate', { reason: '' })));
  const elevated = await asUser(session, () => elevateSupport(req('/api/platform/support-sessions/elevate', { reason: 'Corregir contacto duplicado' })));
  const audit = await crossTenantPrisma.platformAuditLog.count({ where: { supportSessionId, action: 'support.elevated' } });
  check('30. Elevar a READ_WRITE exige motivo y queda auditado', noReason.status === 400 && elevated.status === 200 && audit === 1, `${noReason.status}/${elevated.status}`);
  await prisma.supportSession.updateMany({ where: { id: supportSessionId }, data: { endedAt: new Date() } });
}

// =============================================================================
console.log('\n== Recuperacion de contrasena (identidad global) ==');
{
  const OLD = 'contrasena-de-prueba-1234';
  const NEW = 'contrasena-nueva-5678';
  const R = await makeWorkspace('reset');
  const loginAs = (password: string) => asUser(null, () => login(req('/api/auth/login', { email: R.email, password })));
  const pending = () => prisma.passwordResetToken.count({ where: { userId: R.userId, usedAt: null } });
  const emailUsage = async () =>
    (await prisma.usageCounter.aggregate({ where: { workspaceId: R.workspaceId, metric: { in: ['emails', 'emails.monthly'] } }, _sum: { quantity: true } }))._sum.quantity ?? 0;
  const usageBefore = await emailUsage();

  // Email existente vs inexistente: misma respuesta, byte a byte.
  const existing = await asUser(null, () => passwordReset(req('/api/auth/password-reset', { email: `  ${R.email.toUpperCase()} ` })));
  const missing = await asUser(null, () => passwordReset(req('/api/auth/password-reset', { email: `nadie-${stamp}@p0d.test` })));
  const [existingBody, missingBody] = [await existing.clone().text(), await missing.clone().text()];
  check('R1. Email existente: 200 y un token pendiente', existing.status === 200 && (await pending()) === 1);
  check('R2. Email inexistente: misma respuesta (status y cuerpo) — sin enumeracion', missing.status === existing.status && missingBody === existingBody && !/token|http/i.test(existingBody), existingBody);

  // Hash-only: en la base solo el HMAC del token.
  const issued = await issuePasswordReset(R.email);
  const row = await prisma.passwordResetToken.findUniqueOrThrow({ where: { tokenHash: hashResetToken(issued!.token) } });
  const rawStored = await prisma.passwordResetToken.count({ where: { tokenHash: issued!.token } });
  const ttlMinutes = Math.round((row.expiresAt.getTime() - row.createdAt.getTime()) / 60_000);
  check('R3. Token hash-only (el token en claro no esta en la base) y TTL 60 min', rawStored === 0 && row.tokenHash !== issued!.token && ttlMinutes === 60, `ttl=${ttlMinutes}`);
  check('R4. Un token nuevo invalida los pendientes anteriores', (await pending()) === 1);

  // Email de PLATAFORMA: remitente Upzites, no toca la cuota del tenant.
  const sent: { to: string; text: string }[] = [];
  const outcome = await sendPasswordResetEmail(issued!, async (input) => {
    sent.push({ to: input.to, text: input.text ?? '' });
    return { ok: true, providerMessageId: 'fake' } as never;
  });
  check(
    'R5. Email de plataforma con el enlace; no consume la cuota de email del tenant',
    outcome.sent && sent.length === 1 && sent[0].to === R.email && sent[0].text.includes(`/reset-password/${issued!.token}`) && (await emailUsage()) === usageBefore,
  );
  // Tambien una cuenta SIN workspace (identidad global) puede recuperar.
  const orphan = await makeUser('Reset Orphan');
  check('R6. Una cuenta sin ningun workspace tambien recupera', Boolean(await issuePasswordReset(orphan.email)));

  // Token incorrecto / vencido / confirmacion distinta.
  const confirm = (body: Record<string, unknown>) => asUser(null, () => confirmReset(req('/api/auth/password-reset/confirm', body)));
  const wrong = await confirm({ token: 'x'.repeat(43), password: NEW, confirmPassword: NEW });
  check('R7. Token incorrecto: 410 INVALID_TOKEN', wrong.status === 410 && (await json(wrong)).code === 'INVALID_TOKEN');
  const stale = await issuePasswordReset(R.email, new Date(Date.now() - 61 * 60_000));
  const expired = await confirm({ token: stale!.token, password: NEW, confirmPassword: NEW });
  check('R8. Token vencido: 410 EXPIRED', expired.status === 410 && (await json(expired)).code === 'EXPIRED');
  const fresh = await issuePasswordReset(R.email);
  const mismatch = await confirm({ token: fresh!.token, password: NEW, confirmPassword: `${NEW}x` });
  const short = await confirm({ token: fresh!.token, password: 'corta', confirmPassword: 'corta' });
  check('R9. Contrasenas distintas o cortas: 400 y el token sigue vigente', mismatch.status === 400 && short.status === 400 && (await inspectPasswordResetToken(fresh!.token)) === 'VALID');

  // Otro token pendiente del mismo usuario (p. ej. de otra pestana).
  await prisma.passwordResetToken.create({ data: { userId: R.userId, tokenHash: `otro-${randomUUID()}`, expiresAt: new Date(Date.now() + 3_600_000) } });
  const hashBefore = (await prisma.user.findUniqueOrThrow({ where: { id: R.userId } })).passwordHash;
  const ok = await confirm({ token: fresh!.token, password: NEW, confirmPassword: NEW });
  const hashAfter = (await prisma.user.findUniqueOrThrow({ where: { id: R.userId } })).passwordHash;
  check('R10. Confirmacion valida: 200 y passwordHash realmente cambia', ok.status === 200 && hashAfter !== hashBefore && verifyPassword(NEW, hashAfter));
  check('R11. Se consumen el token y TODOS los pendientes del usuario', (await pending()) === 0 && (await inspectPasswordResetToken(fresh!.token)) === 'USED');
  const reuse = await confirm({ token: fresh!.token, password: 'otra-mas-9999', confirmPassword: 'otra-mas-9999' });
  check('R12. Un token usado no funciona otra vez (410 USED)', reuse.status === 410 && (await json(reuse)).code === 'USED' && verifyPassword(NEW, (await prisma.user.findUniqueOrThrow({ where: { id: R.userId } })).passwordHash));
  const [oldLogin, newLogin] = [await loginAs(OLD), await loginAs(NEW)];
  check('R13. Login con la contrasena vieja falla; con la nueva funciona', oldLogin.status === 401 && newLogin.status === 200, `${oldLogin.status}/${newLogin.status}`);
  const audit = await prisma.platformAuditLog.count({ where: { targetUserId: R.userId, action: 'account.password_reset' } });
  check('R14. Auditado como evento de cuenta (sin workspace)', audit === 1);

  // Doble confirmacion simultanea del mismo token: una sola gana.
  const twin = await issuePasswordReset(R.email);
  const twins = await Promise.allSettled([
    confirmPasswordReset({ token: twin!.token, password: 'gemela-uno-1111', confirmPassword: 'gemela-uno-1111' }),
    confirmPasswordReset({ token: twin!.token, password: 'gemela-dos-2222', confirmPassword: 'gemela-dos-2222' }),
  ]);
  const twinOk = twins.filter((t) => t.status === 'fulfilled').length;
  const twinUsed = twins.filter((t) => t.status === 'rejected' && t.reason instanceof PasswordResetError && t.reason.code === 'USED').length;
  check('R15. Dos confirmaciones concurrentes del mismo token: pasa una', twinOk === 1 && twinUsed === 1, `${twinOk}/${twinUsed}`);

  // Rate limit: solicitud por IP, por email destino (silencioso) y confirmacion por IP.
  const fixedIp = { 'x-forwarded-for': `203.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}.7` };
  const burst: number[] = [];
  for (let i = 0; i < 6; i += 1) burst.push((await asUser(null, () => passwordReset(req('/api/auth/password-reset', { email: `burst-${i}-${stamp}@p0d.test` }, fixedIp)))).status);
  check('R16. Rate limit de solicitud por IP (6.a → 429)', burst.slice(0, 5).every((s) => s === 200) && burst[5] === 429, burst.join(','));
  const target = await makeUser('Reset Flood');
  const flood: number[] = [];
  for (let i = 0; i < 5; i += 1) flood.push((await asUser(null, () => passwordReset(req('/api/auth/password-reset', { email: target.email })))).status);
  const floodTokens = await prisma.passwordResetToken.count({ where: { userId: target.id } });
  check('R17. Cupo por email destino: responde igual (200) pero no emite mas de 3', flood.every((s) => s === 200) && floodTokens === 3, `tokens=${floodTokens}`);
  const confirmIp = { 'x-forwarded-for': `203.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}.8` };
  const guesses: number[] = [];
  for (let i = 0; i < 11; i += 1) guesses.push((await asUser(null, () => confirmReset(req('/api/auth/password-reset/confirm', { token: `adivina-${i}`, password: NEW, confirmPassword: NEW }, confirmIp)))).status);
  check('R18. Rate limit de confirmacion por IP (11.a → 429)', guesses.slice(0, 10).every((s) => s === 410) && guesses[10] === 429, guesses.join(','));
}

// =============================================================================
console.log('\n== Email diferido de recuperacion (after) ==');
{
  const D = await makeWorkspace('deferred');
  const tokensOf = () => prisma.passwordResetToken.count({ where: { userId: D.userId } });
  const emailUsage = async () =>
    (await prisma.usageCounter.aggregate({ where: { workspaceId: D.workspaceId, metric: { in: ['emails', 'emails.monthly'] } }, _sum: { quantity: true } }))._sum.quantity ?? 0;
  const usageBefore = await emailUsage();
  await flushAfterTasks();

  // Ruta real: after() solo programa cuando la cuenta existe; nada corre antes de responder.
  const hit = await asUser(null, () => passwordReset(req('/api/auth/password-reset', { email: D.email })));
  const scheduledHit = pendingAfterTasks();
  const miss = await asUser(null, () => passwordReset(req('/api/auth/password-reset', { email: `nadie-diferido-${stamp}@p0d.test` })));
  const scheduledTotal = pendingAfterTasks();
  check(
    'E1. Respuesta publica identica; la tarea de envio se programa SOLO si la cuenta existe',
    (await hit.clone().text()) === (await miss.clone().text()) && hit.status === miss.status && scheduledHit === 1 && scheduledTotal === 1,
    `tareas=${scheduledHit}/${scheduledTotal}`,
  );
  const ran = await flushAfterTasks();
  check('E2. La tarea corre despues de la respuesta (via after) sin lanzar', ran === 1);

  // Proveedor caido: la respuesta publica no cambia y los reintentos no emiten tokens.
  const tasks: (() => Promise<unknown>)[] = [];
  const schedule = (task: () => Promise<unknown>) => void tasks.push(task);
  const idempotencyKeys: (string | null | undefined)[] = [];
  let calls = 0;
  const failing = async (input: { idempotencyKey?: string | null }) => {
    calls += 1;
    idempotencyKeys.push(input.idempotencyKey);
    if (calls === 1) throw new Error('timeout del proveedor');
    return { ok: false, error: 'proveedor caido' } as never;
  };
  const before = await tokensOf();
  const failedResponse = await requestPasswordReset(D.email, { schedule, sender: failing as never });
  const missingResponse = await requestPasswordReset(`nadie-2-${stamp}@p0d.test`, { schedule, sender: failing as never });
  const afterIssue = await tokensOf();
  let threw = false;
  const outcomes = [];
  try {
    for (const task of tasks) outcomes.push(await task());
  } catch {
    threw = true;
  }
  check(
    'E3. Fallo del proveedor: misma respuesta publica, la tarea no lanza',
    JSON.stringify(failedResponse) === JSON.stringify(missingResponse) && JSON.stringify(failedResponse) === JSON.stringify(PASSWORD_RESET_PUBLIC_RESPONSE) && tasks.length === 1 && !threw,
  );
  check(
    'E4. Reintentos (3) con el MISMO idempotencyKey y sin tokens adicionales',
    calls === 3 && new Set(idempotencyKeys).size === 1 && afterIssue === before + 1 && (await tokensOf()) === afterIssue,
    `llamadas=${calls} tokens=${before}→${afterIssue}→${await tokensOf()}`,
  );

  // Se recupera al segundo intento: se envia una vez, mismo token.
  const issued = await issuePasswordReset(D.email);
  let attempt = 0;
  const sentTo: string[] = [];
  const flaky = async (input: { to: string; text?: string | null }) => {
    attempt += 1;
    if (attempt === 1) return { ok: false, error: '503' } as never;
    sentTo.push(`${input.to}|${input.text?.includes(`/reset-password/${issued!.token}`)}`);
    return { ok: true, providerMessageId: 'fake' } as never;
  };
  const tokensBeforeRetry = await tokensOf();
  const delivered = await deliverPasswordResetEmail(issued!, { sender: flaky as never });
  check(
    'E5. Reintento exitoso: un solo envio con el mismo enlace, sin tokens nuevos, sin cuota del tenant',
    delivered.sent && attempt === 2 && sentTo.join() === `${D.email}|true` && (await tokensOf()) === tokensBeforeRetry && (await emailUsage()) === usageBefore,
  );
}

// =============================================================================
console.log('\n== sessionVersion: invalidacion global de sesiones ==');
{
  const loginAsUser = async (email: string, password: string) => (await asUser(null, () => login(req('/api/auth/login', { email, password })))).status;
  const V = await makeWorkspace('sessions');
  const W = await makeWorkspace('sessions-w');
  await assignCompSubscription({ workspaceId: W.workspaceId, planCode: PlanCode.SCALE, ...cli });
  await addMembershipWithinPlan({ workspaceId: W.workspaceId, userId: V.userId, role: WorkspaceRole.MEMBER });
  const versionOf = async () => (await prisma.user.findUniqueOrThrow({ where: { id: V.userId } })).sessionVersion;
  const legacyToken = signSessionPayload({ v: 2, userId: V.userId, activeWorkspaceId: V.workspaceId, exp: Math.floor(Date.now() / 1000) + 3600 });
  const v0Token = createSessionToken({ userId: V.userId, activeWorkspaceId: V.workspaceId, sessionVersion: 0 });
  /** Valida por las dos vias: lectura verificada de cookie y contexto completo. */
  const valid = async (token: string | undefined) => {
    if (!token) return false;
    const cookie = await asUser(null, () => readSessionCookie(), { token });
    const ctx = await resolveContextForSession(readSessionToken(token));
    return cookie !== null && ctx.kind === 'ok';
  };
  const invalid = async (token: string) => {
    const cookie = await asUser(null, () => readSessionCookie(), { token });
    const ctx = await resolveContextForSession(readSessionToken(token));
    const sw = await asUser(null, () => switchRoute(req('/api/workspaces/switch', { workspaceId: W.workspaceId })), { token });
    return cookie === null && ctx.kind === 'anonymous' && sw.status === 401;
  };
  const resetTo = async (password: string) => {
    const issued = await issuePasswordReset(V.email);
    const confirmed = await asUserCapturingSession(null, () =>
      confirmReset(req('/api/auth/password-reset/confirm', { token: issued!.token, password, confirmPassword: password })),
    );
    return confirmed;
  };

  check('S1. Usuario en version 0 + cookie legacy (sin sv) → valida (sin logout masivo)', (await versionOf()) === 0 && (await valid(legacyToken)));
  check('S2. Cookie nueva sv=0 + User 0 → valida', await valid(v0Token));

  const first = await resetTo('contrasena-uno-1111');
  check('S3. Reset → User.sessionVersion = 1, y el reset NO emite sesion', first.result.status === 200 && (await versionOf()) === 1 && first.sessionToken === undefined);
  check('S4. Cookies anteriores (legacy y sv=0) → invalidas (lectura, contexto y ruta 401)', (await invalid(legacyToken)) && (await invalid(v0Token)));

  const relogin = await asUserCapturingSession(null, () => login(req('/api/auth/login', { email: V.email, password: 'contrasena-uno-1111' })));
  const v1Token = relogin.sessionToken;
  check('S5. Login posterior emite cookie sv=1 y es valida', relogin.result.status === 200 && readSessionToken(v1Token)?.sessionVersion === 1 && (await valid(v1Token)));

  const switched = await asUserCapturingSession(null, () => switchRoute(req('/api/workspaces/switch', { workspaceId: W.workspaceId })), { token: v1Token });
  const switchedSession = readSessionToken(switched.sessionToken);
  check(
    'S6. Cambio de workspace con sv=1: conserva la version y entra al otro workspace por membership',
    switched.result.status === 200 && switchedSession?.sessionVersion === 1 && switchedSession.activeWorkspaceId === W.workspaceId && (await valid(switched.sessionToken)),
  );
  check('S7. Las memberships siguen intactas tras el reset', (await listMyWorkspaces(V.userId)).length === 2);

  const second = await resetTo('contrasena-dos-2222');
  check('S8. Segundo reset → version 2', second.result.status === 200 && (await versionOf()) === 2);
  check('S9. Cookie sv=1 (login y la reemitida por el switch) → invalidas', (await invalid(v1Token!)) && (await invalid(switched.sessionToken!)));
  check('S10. Login viejo falla, nuevo funciona', (await loginAsUser(V.email, 'contrasena-uno-1111')) === 401 && (await loginAsUser(V.email, 'contrasena-dos-2222')) === 200);

  // Base para "cerrar sesion en todos los dispositivos": tambien corta al operador.
  const op = await makeUser('Session Operator', PlatformRole.PLATFORM_ADMIN);
  const opToken = createSessionToken({ userId: op.id, activeWorkspaceId: null, sessionVersion: 0 });
  const beforeRevoke = await asUser(null, () => currentPlatformActor(), { token: opToken });
  const newVersion = await revokeAllSessions(op.id);
  const afterRevoke = await asUser(null, () => currentPlatformActor(), { token: opToken });
  check('S11. revokeAllSessions invalida tambien sesiones de /platform', beforeRevoke?.id === op.id && newVersion === 1 && afterRevoke === null);
}

// =============================================================================
console.log('\n== 31-32. Roles de plataforma ==');
// La suite NUNCA toca SUPER_ADMIN que no creo: se fotografian antes y despues.
const externalSnapshot = async () =>
  JSON.stringify(
    await prisma.user.findMany({
      where: { platformRole: PlatformRole.SUPER_ADMIN, id: { notIn: createdUsers } },
      select: { id: true, platformRole: true, updatedAt: true },
      orderBy: { id: 'asc' },
    }),
  );
const externalBefore = await externalSnapshot();
{
  const target = await makeUser('Role Target');
  const paTry = await asUser(paSession, () => rolesRoute(req('/api/platform/roles', { userId: target.id, role: 'PLATFORM_ADMIN', reason: 'intento' })));
  const grant = await asUser(saSession, () => rolesRoute(req('/api/platform/roles', { userId: target.id, role: 'PLATFORM_ADMIN', reason: 'Nuevo operador' })));
  const granted = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
  const revoke = await asUser(saSession, () => rolesRoute(req('/api/platform/roles', { userId: target.id, role: 'USER', reason: 'Ya no opera' })));
  const revoked = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
  const logs = await crossTenantPrisma.platformAuditLog.count({ where: { targetUserId: target.id, action: { in: ['platform_role.granted', 'platform_role.revoked'] } } });
  check('31. Grant y revoke de rol de plataforma (solo SUPER_ADMIN, auditado)', paTry.status === 404 && grant.status === 200 && granted.platformRole === 'PLATFORM_ADMIN' && revoke.status === 200 && revoked.platformRole === 'USER' && logs === 2);

  // Camino real (conteo sobre TODA la plataforma): con >= 2 SUPER_ADMIN, bajar
  // a uno creado por la suite pasa.
  const SA2 = await makeUser('Super Two', PlatformRole.SUPER_ADMIN);
  const demoteReal = await asUser(saSession, () => rolesRoute(req('/api/platform/roles', { userId: SA2.id, role: 'USER', reason: 'baja real' })));
  check('32a. Con mas de un SUPER_ADMIN, la baja por la ruta real pasa', demoteReal.status === 200, `${demoteReal.status}`);

  // Regla del ultimo SUPER_ADMIN con actores PROPIOS: la operacion real (lock
  // + transaccion + conteo) con el conteo acotado a X1/X2.
  const X1 = await makeUser('Scoped Super One', PlatformRole.SUPER_ADMIN);
  const X2 = await makeUser('Scoped Super Two', PlatformRole.SUPER_ADMIN);
  const scope = { userIds: [X1.id, X2.id] };
  const inScope = () => prisma.user.count({ where: { id: { in: scope.userIds }, platformRole: PlatformRole.SUPER_ADMIN } });
  const first = await setPlatformRoleInScopeForTests({ actor: X1, target: { userId: X2.id }, role: PlatformRole.USER, reason: 'baja' }, scope);
  const last = await expectError(
    () => setPlatformRoleInScopeForTests({ actor: X1, target: { userId: X1.id }, role: PlatformRole.PLATFORM_ADMIN, reason: 'auto-baja' }, scope),
    (error) => error instanceof PlatformRoleError && error.code === 'LAST_SUPER_ADMIN',
  );
  check('32b. El ultimo SUPER_ADMIN no se puede quitar (LAST_SUPER_ADMIN)', first.changed && last && (await inScope()) === 1);

  // Carrera: X1 y X2 se bajan mutuamente a la vez; el lock deja pasar a uno.
  await prisma.user.update({ where: { id: X2.id }, data: { platformRole: PlatformRole.SUPER_ADMIN } });
  const race = await Promise.allSettled([
    setPlatformRoleInScopeForTests({ actor: X1, target: { userId: X2.id }, role: PlatformRole.USER, reason: 'carrera' }, scope),
    setPlatformRoleInScopeForTests({ actor: X2, target: { userId: X1.id }, role: PlatformRole.USER, reason: 'carrera' }, scope),
  ]);
  const won = race.filter((r) => r.status === 'fulfilled').length;
  const blocked = race.filter((r) => r.status === 'rejected' && r.reason instanceof PlatformRoleError && r.reason.code === 'LAST_SUPER_ADMIN').length;
  check('32c. Dos bajas concurrentes de los dos ultimos: pasa una, la otra LAST_SUPER_ADMIN', won === 1 && blocked === 1 && (await inScope()) === 1, `ok=${won} bloqueadas=${blocked}`);

  // Sin SUPER_ADMIN ajenos en la base, tambien se ejercita la ruta real sin acotar.
  const othersNow = await prisma.user.count({ where: { platformRole: PlatformRole.SUPER_ADMIN, id: { notIn: createdUsers } } });
  if (othersNow === 0) {
    // Solo cuentas de la suite: SA queda como unico SUPER_ADMIN.
    await prisma.user.updateMany({ where: { id: { in: createdUsers, not: SA.id }, platformRole: PlatformRole.SUPER_ADMIN }, data: { platformRole: PlatformRole.USER } });
    const selfDemote = await asUser(saSession, () => rolesRoute(req('/api/platform/roles', { userId: SA.id, role: 'PLATFORM_ADMIN', reason: 'intento' })));
    check('32d. Ruta real: el unico SUPER_ADMIN no se baja (409)', selfDemote.status === 409 && (await json(selfDemote)).code === 'LAST_SUPER_ADMIN');
  } else {
    console.log(`      (32d omitida: hay ${othersNow} SUPER_ADMIN fuera de la suite y no se tocan)`);
  }
  check('32e. Ningun SUPER_ADMIN ajeno a la suite fue modificado', (await externalSnapshot()) === externalBefore);
}

// =============================================================================
console.log('\n== 33-35. Price Book y ledgers ==');
{
  const current = await getCurrentPrice({ planCode: PlanCode.START, currency: 'USD' });
  const paTry = await asUser(paSession, () => pricesRoute(req('/api/platform/prices', { planCode: 'START', currency: 'USD', amountMinor: 2100 })));
  const published = await asUser(saSession, () => pricesRoute(req('/api/platform/prices', { planCode: 'START', currency: 'USD', amountMinor: current ? current.amountMinor + 100 : 2000 })));
  const newPrice = (await json(published)).data as { id?: string; amountMinor?: number } | undefined;
  const nowPrice = await getCurrentPrice({ planCode: PlanCode.START, currency: 'USD' });
  const old = current ? await prisma.planPrice.findUnique({ where: { id: current.id } }) : null;
  check('33. Nuevo precio versionado (solo SUPER_ADMIN)', paTry.status === 404 && published.status === 201 && nowPrice?.id === newPrice?.id);
  check('34. El precio historico queda intacto (mismo monto, cerrado con validUntil)', !current || (old?.amountMinor === current.amountMinor && old?.validUntil !== null));
  // Restaurar el precio de la suite anterior (no dejar el Price Book de pruebas cambiado).
  if (current) await asUser(saSession, () => pricesRoute(req('/api/platform/prices', { planCode: 'START', currency: 'USD', amountMinor: current.amountMinor })));

  // Commerce: venta de un negocio interno.
  const internal = await makeWorkspace('commerce');
  await assignCompSubscription({ workspaceId: internal.workspaceId, planCode: PlanCode.SCALE, ...cli });
  await prisma.workspace.update({ where: { id: internal.workspaceId }, data: { isInternal: true } });
  const order = await prisma.customerOrder.create({ data: { workspaceId: internal.workspaceId, status: 'CONFIRMED', total: 5990, subtotal: 5990 } });
  await prisma.payment.create({ data: { workspaceId: internal.workspaceId, orderId: order.id, provider: 'MERCADO_PAGO', status: 'APPROVED', amount: 5990, externalId: `commerce-${stamp}` } });
  const saas = await listSaasPayments({ take: 500, includeInternal: true });
  check('35. Una venta commerce nunca aparece como pago SaaS', !saas.some((p) => p.workspace.id === internal.workspaceId));
}

// =============================================================================
// Tareas after() pendientes de otras secciones (enlaces QA al log).
await flushAfterTasks();
await crossTenantPrisma.platformAuditLog.deleteMany({ where: { OR: [{ targetWorkspaceId: { in: createdWorkspaces } }, { targetUserId: { in: createdUsers } }, { actorUserId: { in: createdUsers } }] } });
const memberUsers = (await prisma.workspaceMembership.findMany({ where: { workspaceId: { in: createdWorkspaces } }, select: { userId: true } })).map((m) => m.userId);
await crossTenantPrisma.workspace.deleteMany({ where: { id: { in: createdWorkspaces } } });
const cleaned = await crossTenantPrisma.user.deleteMany({ where: { id: { in: [...new Set([...createdUsers, ...memberUsers])] } } });
console.log(`\nLimpieza: workspaces y ${cleaned.count} cuentas de prueba eliminados.`);

const passed = results.filter((result) => result.ok).length;
console.log(`\n== Resultado: ${passed}/${results.length} pruebas OK ==`);
await prisma.$disconnect();
if (failures > 0) process.exit(1);
