/**
 * P0-FOUNDATION: usuario global, memberships, soporte auditado y aislamiento.
 *
 * Garantias que no pueden romperse:
 *  1. La migracion dejo una membership por usuario, con el rol mapeado, y es
 *     idempotente. Una cookie v1 (anterior) sigue funcionando.
 *  2. Un usuario opera varios workspaces, pero solo aquellos donde tiene
 *     membership ACTIVE; ni un SUPER_ADMIN entra a otro sin SupportSession.
 *  3. Una pestana desfasada no escribe en el workspace equivocado (409).
 *  4. Soporte READ_ONLY no escribe; READ_WRITE escribe y queda auditado.
 *  5. Ninguna referencia (contacto, empresa, dueno, conversacion) cruza tenants.
 *  6. SaaS Billing y Commerce no se mezclan; lo no identificado no toca nada.
 *
 * Uso, desde apps/crm (exige TEST_DATABASE_URL con el marcador de base aislada):
 *   pnpm exec tsx scripts/smoke-foundation.ts
 */
import './fixtures/test-environment';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { NextRequest } from 'next/server';
import {
  ConversationMode,
  ConversationStatus,
  JobType,
  MembershipStatus,
  PlatformRole,
  SubscriptionStatus,
  SupportAccessMode,
  WhatsAppChannelStatus,
  WorkspaceRole,
} from '../generated/prisma/client';
import { crossTenantPrisma, prisma } from '../src/lib/prisma';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { activateForTests } from './fixtures/workspace';
import { asUser, throughProxy } from './fixtures/request-context';
import { getCurrentUser } from '../src/lib/auth';
import { signSessionPayload, createSessionToken } from '../src/lib/session-token';
import { resolveContextForSession } from '../src/lib/workspace-context';
import { readSessionToken } from '../src/lib/session-token';
import {
  elevateSupportSession,
  pickWorkspaceForUser,
  startSupportSession,
  switchWorkspace,
} from '../src/lib/workspace-switch';
import { listMyWorkspaces } from '../src/lib/membership';
import { assignConversation } from '../src/lib/conversations';
import { queuePushEvent } from '../src/lib/push/events';
import { sendPushJob } from '../src/lib/push/send';
import { usedFor } from '../src/lib/billing/usage';
import { processOrderPayment } from '../src/lib/commerce/payment-webhook';
import { tenantGuardMode, TenantGuardViolation } from '../src/lib/tenant-guard';
import * as contactsRoute from '../src/app/api/contacts/route';
import * as opportunitiesRoute from '../src/app/api/opportunities/route';
import * as opportunityRoute from '../src/app/api/opportunities/[id]/route';
import * as activitiesRoute from '../src/app/api/activities/route';
import * as ordersRoute from '../src/app/api/orders/route';
import * as switchRoute from '../src/app/api/workspaces/switch/route';
import * as assignRoute from '../src/app/api/conversations/[id]/assign/route';
import { POST as billingWebhook } from '../src/app/api/billing/webhook/route';

const results: { name: string; ok: boolean }[] = [];
let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const stamp = Date.now();
const createdWorkspaces: string[] = [];

async function makeWorkspace(suffix: string) {
  const created = await createCustomerWorkspace({
    companyName: `foundation-${suffix}-${stamp}`,
    ownerName: `Owner ${suffix}`,
    email: `owner-${suffix}-${stamp}@foundation.test`,
    password: 'contrasena-de-prueba-1234',
  });
  createdWorkspaces.push(created.workspace.id);
  await activateForTests(created.workspace.id);
  return { workspaceId: created.workspace.id, ownerId: created.user.id };
}


// =============================================================================
console.log('\n== Guardia de tenant activa ==');
check('La suite corre con la guardia en modo throw', tenantGuardMode() === 'throw', tenantGuardMode());
{
  let blocked = false;
  try {
    await prisma.contact.findMany({ where: { lifecycleStatus: 'LEAD' } });
  } catch (error) {
    blocked = error instanceof TenantGuardViolation;
  }
  check('Una consulta global accidental sobre un modelo tenant se corta', blocked);
}

// =============================================================================
console.log('\n== Migracion (estado de crm_pruebas) ==');
{
  const [users, orphanUsers, badMapping, workspacesWithoutOwner] = await Promise.all([
    crossTenantPrisma.user.count(),
    crossTenantPrisma.$queryRawUnsafe<{ n: number }[]>(
      // Step 2: workspace_id es legacy nullable; solo se exige para quien lo tiene.
      `SELECT count(*)::int n FROM users u WHERE u.workspace_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM workspace_memberships m WHERE m.user_id = u.id AND m.workspace_id = u.workspace_id)`,
    ),
    crossTenantPrisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int n FROM users u JOIN workspace_memberships m ON m.user_id = u.id AND m.workspace_id = u.workspace_id
       WHERE NOT ((u.role = 'OWNER' AND m.role = 'OWNER') OR (u.role = 'ADMIN' AND m.role = 'ADMIN') OR (u.role = 'SALES' AND m.role = 'MEMBER'))`,
    ),
    crossTenantPrisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int n FROM workspaces w WHERE NOT EXISTS (SELECT 1 FROM workspace_memberships m WHERE m.workspace_id = w.id AND m.role = 'OWNER' AND m.status = 'ACTIVE')`,
    ),
  ]);
  check('Todo usuario tiene membership en su workspace de origen', orphanUsers[0].n === 0, `${users} usuarios`);
  check('Roles mapeados OWNER→OWNER, ADMIN→ADMIN, SALES→MEMBER', badMapping[0].n === 0);
  check('Cada workspace tiene un OWNER activo', workspacesWithoutOwner[0].n === 0);

  // Re-ejecutar el backfill de la migracion: no debe duplicar nada.
  const sql = readFileSync('prisma/migrations/20260926120000_workspace_memberships/migration.sql', 'utf8');
  // Step 2: las cuentas nuevas ya no tienen workspace de origen (NULL); el
  // backfill historico solo aplica a las cuentas legacy que lo tienen.
  const backfill = sql
    .slice(sql.indexOf('-- 1. Exactamente una membership'))
    .replace(/FROM "users" u\s*\nON CONFLICT/, 'FROM "users" u WHERE u."workspace_id" IS NOT NULL ON CONFLICT');
  const statements = backfill
    .split(/;\s*\n/)
    .map((statement) => statement.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);

  // Un operador de la tabla legacy de P0-A para probar su traspaso.
  const legacyOperator = await makeWorkspace('legacy-op');
  await crossTenantPrisma.platformAdmin.create({ data: { userId: legacyOperator.ownerId, note: 'smoke foundation' } });

  const before = await crossTenantPrisma.workspaceMembership.count();
  for (const statement of statements) await crossTenantPrisma.$executeRawUnsafe(statement);
  for (const statement of statements) await crossTenantPrisma.$executeRawUnsafe(statement);
  const after = await crossTenantPrisma.workspaceMembership.count();
  check('Re-ejecutar el backfill (dos veces) no crea memberships', before === after, `${before} → ${after}`);

  const migrated = await crossTenantPrisma.user.findUniqueOrThrow({ where: { id: legacyOperator.ownerId } });
  check('Fila de platform_admins pasa a platformRole SUPER_ADMIN', migrated.platformRole === PlatformRole.SUPER_ADMIN);
  const migrationAudit = await crossTenantPrisma.platformAuditLog.count({
    where: { targetUserId: legacyOperator.ownerId, action: 'platform_role.migrated_from_platform_admins' },
  });
  check('Y queda en PlatformAuditLog una sola vez', migrationAudit === 1, `${migrationAudit}`);
  await crossTenantPrisma.platformAdmin.deleteMany({ where: { userId: legacyOperator.ownerId } });
  await crossTenantPrisma.user.update({ where: { id: legacyOperator.ownerId }, data: { platformRole: PlatformRole.USER } });
}

// =============================================================================
const A = await makeWorkspace('a');
const B = await makeWorkspace('b');
const C = await makeWorkspace('c');

// U: la misma persona en A y en B (MEMBER en ambos), sin nada en C.
const U = await prisma.user.create({
  data: {
    workspaceId: A.workspaceId,
    name: 'Usuaria Multi',
    email: `multi-${stamp}@foundation.test`,
    passwordHash: 'unused-test-hash',
    role: 'SALES',
    lastActiveWorkspaceId: A.workspaceId,
    memberships: {
      create: [
        { workspaceId: A.workspaceId, role: WorkspaceRole.MEMBER },
        { workspaceId: B.workspaceId, role: WorkspaceRole.MEMBER },
      ],
    },
  },
});

console.log('\n== Cookie heredada (v1) ==');
{
  const v1 = signSessionPayload({ userId: A.ownerId, workspaceId: A.workspaceId, role: 'OWNER', exp: Math.floor(Date.now() / 1000) + 600 });
  const current = await asUser(null, () => getCurrentUser(), { token: v1 });
  check('Una cookie v1 sigue autenticando, sin logout', current?.id === A.ownerId && current.workspace.id === A.workspaceId);
  check('Y su rol sale de la membership', current?.role === WorkspaceRole.OWNER);
}

// =============================================================================
console.log('\n== Multi-workspace y switch ==');
{
  const mine = await listMyWorkspaces(U.id);
  check('U ve exactamente A y B en el selector', mine.length === 2 && mine.every((w) => [A.workspaceId, B.workspaceId].includes(w.id)));

  await prisma.contact.create({ data: { workspaceId: A.workspaceId, firstName: 'SoloA', lastName: 'A', email: `a-${stamp}@x.test` } });
  await prisma.contact.create({ data: { workspaceId: B.workspaceId, firstName: 'SoloB', lastName: 'B', email: `b-${stamp}@x.test` } });

  const switched = await throughProxy(
    { user: { id: U.id, workspaceId: A.workspaceId }, method: 'POST', path: '/api/workspaces/switch', body: { workspaceId: B.workspaceId } },
    (request) => switchRoute.POST(request),
  );
  check('Switch A→B con membership ACTIVE: 200', switched.status === 200, `${switched.status}`);
  const refreshed = await crossTenantPrisma.user.findUniqueOrThrow({ where: { id: U.id } });
  check('Guarda B como ultimo workspace usado', refreshed.lastActiveWorkspaceId === B.workspaceId);

  const listB = (await throughProxy({ user: { id: U.id, workspaceId: B.workspaceId }, method: 'GET', path: '/api/contacts' }, () =>
    contactsRoute.GET(),
  )) as Response;
  const bodyB = (await listB.json()) as { data: { name?: string; firstName?: string }[] };
  const namesB = JSON.stringify(bodyB.data);
  check('En B solo se ven contactos de B', namesB.includes('SoloB') && !namesB.includes('SoloA'));

  const toC = await throughProxy(
    { user: { id: U.id, workspaceId: B.workspaceId }, method: 'POST', path: '/api/workspaces/switch', body: { workspaceId: C.workspaceId } },
    (request) => switchRoute.POST(request),
  );
  check('Switch a C sin membership: 404', toC.status === 404, `${toC.status}`);

  // Una cookie que apunta a C (fabricada) no da acceso: se verifica membership.
  const forged = await resolveContextForSession(readSessionToken(createSessionToken({ userId: U.id, activeWorkspaceId: C.workspaceId, sessionVersion: 0 })));
  check('Cookie firmada con un workspace sin membership no da contexto', forged.kind === 'no-workspace');

  check('Login elige el ultimo usado (B)', (await pickWorkspaceForUser(U.id)) === B.workspaceId);
}

// =============================================================================
console.log('\n== Multi-pestana: x-upzites-workspace ==');
{
  const before = await prisma.contact.count({ where: { workspaceId: B.workspaceId } });
  const stale = await throughProxy(
    {
      user: { id: U.id, workspaceId: B.workspaceId },
      method: 'POST',
      path: '/api/contacts',
      body: { firstName: 'Desde pestana vieja', lastName: 'Prueba' },
      headers: { 'x-upzites-workspace': A.workspaceId },
    },
    (request) => contactsRoute.POST(request),
  );
  const body = (await stale.json()) as { code?: string };
  check('Header de otro workspace → 409 WORKSPACE_CHANGED', stale.status === 409 && body.code === 'WORKSPACE_CHANGED');
  const afterB = await prisma.contact.count({ where: { workspaceId: B.workspaceId } });
  const afterA = await prisma.contact.count({ where: { workspaceId: A.workspaceId, firstName: 'Desde pestana vieja' } });
  check('Tras el 409 no se escribio nada (ni en A ni en B)', afterB === before && afterA === 0);

  const fresh = await throughProxy(
    {
      user: { id: U.id, workspaceId: B.workspaceId },
      method: 'POST',
      path: '/api/contacts',
      body: { firstName: 'Pestana al dia', lastName: 'Prueba' },
      headers: { 'x-upzites-workspace': B.workspaceId },
    },
    (request) => contactsRoute.POST(request),
  );
  check('Header coincidente → la mutacion pasa', fresh.status === 201, `${fresh.status}`);
}

// =============================================================================
console.log('\n== Referencias cross-tenant ==');
{
  const contactB = await prisma.contact.findFirstOrThrow({ where: { workspaceId: B.workspaceId, firstName: 'SoloB' } });
  const companyB = await prisma.company.create({ data: { workspaceId: B.workspaceId, name: `EmpresaB-${stamp}` } });
  const asOwnerA = { user: { id: A.ownerId, workspaceId: A.workspaceId }, method: 'POST', path: '/api/opportunities' };
  const countOpps = () => prisma.opportunity.count({ where: { workspaceId: A.workspaceId } });
  const opps0 = await countOpps();

  for (const [label, body] of [
    ['contactId de B', { title: 'x', contactId: contactB.id }],
    ['companyId de B', { title: 'x', companyId: companyB.id }],
    ['ownerId de un usuario solo de B', { title: 'x', ownerId: B.ownerId }],
  ] as const) {
    const response = await throughProxy({ ...asOwnerA, body }, (request) => opportunitiesRoute.POST(request));
    check(`Oportunidad en A con ${label} → 404`, response.status === 404, `${response.status}`);
  }
  check('Ninguna de esas oportunidades se creo', (await countOpps()) === opps0);

  const okResponse = await throughProxy({ ...asOwnerA, body: { title: 'Valida', ownerId: U.id } }, (request) =>
    opportunitiesRoute.POST(request),
  );
  check('Con un dueno miembro de A si se crea', okResponse.status === 201, `${okResponse.status}`);
  const created = ((await okResponse.json()) as { data: { id: string } }).data;

  const patch = await throughProxy(
    { user: asOwnerA.user, method: 'PATCH', path: `/api/opportunities/${created.id}`, body: { contactId: contactB.id } },
    (request) => opportunityRoute.PATCH(request, { params: Promise.resolve({ id: created.id }) }),
  );
  check('PATCH de oportunidad hacia un contacto de B → 404', patch.status === 404, `${patch.status}`);
  const stillClean = await prisma.opportunity.findFirstOrThrow({ where: { id: created.id, workspaceId: A.workspaceId } });
  check('Y la oportunidad no quedo enlazada', stillClean.contactId === null);

  const activity = await throughProxy(
    { user: asOwnerA.user, method: 'POST', path: '/api/activities', body: { title: 'x', contactId: contactB.id } },
    (request) => activitiesRoute.POST(request),
  );
  check('Actividad en A con contacto de B → 404', activity.status === 404, `${activity.status}`);

  const channelB = await prisma.whatsAppChannel.create({
    data: { workspaceId: B.workspaceId, wabaId: `waba-b-${stamp}`, phoneNumberId: `phone-b-${stamp}`, displayPhoneNumber: '+56911110000', status: WhatsAppChannelStatus.CONNECTED },
  });
  const conversationB = await prisma.conversation.create({
    data: { workspaceId: B.workspaceId, channelId: channelB.id, contactId: contactB.id, mode: ConversationMode.AI_ACTIVE, status: ConversationStatus.OPEN },
  });
  const ordersBefore = await prisma.customerOrder.count({ where: { workspaceId: A.workspaceId } });
  const order = await throughProxy(
    {
      user: asOwnerA.user,
      method: 'POST',
      path: '/api/orders',
      body: { conversationId: conversationB.id, items: [{ variantId: 'no-importa', quantity: 1 }] },
    },
    (request) => ordersRoute.POST(request),
  );
  const orderBody = (await order.json()) as { code?: string };
  check('Pedido en A con conversacion de B → 404 FOREIGN_REFERENCE', order.status === 404 && orderBody.code === 'FOREIGN_REFERENCE', `${order.status} ${orderBody.code}`);
  check('Y no se creo el pedido', (await prisma.customerOrder.count({ where: { workspaceId: A.workspaceId } })) === ordersBefore);
}

// =============================================================================
console.log('\n== Asignacion y push por membership ==');
{
  const channelA = await prisma.whatsAppChannel.create({
    data: { workspaceId: A.workspaceId, wabaId: `waba-a-${stamp}`, phoneNumberId: `phone-a-${stamp}`, displayPhoneNumber: '+56922220000', status: WhatsAppChannelStatus.CONNECTED },
  });
  const contactA = await prisma.contact.findFirstOrThrow({ where: { workspaceId: A.workspaceId, firstName: 'SoloA' } });
  const conversationA = await prisma.conversation.create({
    data: { workspaceId: A.workspaceId, channelId: channelA.id, contactId: contactA.id, mode: ConversationMode.AI_ACTIVE, status: ConversationStatus.OPEN },
  });
  const ownerA = { id: A.ownerId, workspaceId: A.workspaceId };

  const foreign = await asUser(ownerA, () => assignConversation(conversationA.id, B.ownerId));
  check('Asignar a un usuario que solo es de B → rechazado', foreign === null);
  const member = await asUser(ownerA, () => assignConversation(conversationA.id, U.id));
  check('Asignar a U (miembro de A por membership, no por workspace de origen) funciona', member?.assignedUserId === U.id);

  const subscription = await prisma.pushSubscription.create({
    data: { workspaceId: A.workspaceId, userId: U.id, endpoint: `https://push.test/${stamp}`, p256dh: 'p', auth: 'a' },
  });
  const active = await queuePushEvent({ workspaceId: A.workspaceId, kind: 'ASSIGNED', dedupeKey: `f-active-${stamp}`, userId: U.id, conversationId: conversationA.id });
  check('Con membership ACTIVE el push se encola', active.queued === 1, `${active.queued}`);

  await prisma.workspaceMembership.update({
    where: { userId_workspaceId: { userId: U.id, workspaceId: A.workspaceId } },
    data: { status: MembershipStatus.SUSPENDED },
  });
  const suspended = await queuePushEvent({ workspaceId: A.workspaceId, kind: 'ASSIGNED', dedupeKey: `f-susp-${stamp}`, userId: U.id, conversationId: conversationA.id });
  check('Con membership SUSPENDED no se encola push', suspended.queued === 0, `${suspended.queued}`);
  const sent = await sendPushJob(
    { subscriptionId: subscription.id, notification: { title: 't', body: 'b', url: '/inbox', tag: 'x' } },
    A.workspaceId,
  );
  check('Y un push ya encolado no sale al enviarse', 'skipped' in sent && sent.reason === 'membership inactiva');

  const reassigned = await asUser(ownerA, () => assignConversation(conversationA.id, U.id));
  check('Un miembro suspendido tampoco es asignable', reassigned === null);

  // users.max: memberships ACTIVE. U esta suspendido en A y activo en B.
  check('users en A = solo el OWNER (U suspendido no cuenta)', (await usedFor(A.workspaceId, 'users')) === 1);
  check('users en B = OWNER + U', (await usedFor(B.workspaceId, 'users')) === 2);
  await prisma.workspaceMembership.update({
    where: { userId_workspaceId: { userId: U.id, workspaceId: A.workspaceId } },
    data: { status: MembershipStatus.ACTIVE },
  });
  check('U activo en A y B cuenta 1 en cada uno', (await usedFor(A.workspaceId, 'users')) === 2 && (await usedFor(B.workspaceId, 'users')) === 2);

  const suspendedCtx = await resolveContextForSession(readSessionToken(createSessionToken({ userId: U.id, activeWorkspaceId: A.workspaceId, sessionVersion: 0 })));
  check('Membership ACTIVE otra vez: contexto valido', suspendedCtx.kind === 'ok');
}

// =============================================================================
console.log('\n== SUPER_ADMIN y soporte ==');
const S = await makeWorkspace('super');
await prisma.user.update({ where: { id: S.ownerId }, data: { platformRole: PlatformRole.SUPER_ADMIN } });
{
  const direct = await switchWorkspace({ userId: S.ownerId, workspaceId: A.workspaceId });
  check('SUPER_ADMIN sin membership no puede hacer switch a A (404)', !direct.ok);
  const own = await resolveContextForSession(readSessionToken(createSessionToken({ userId: S.ownerId, activeWorkspaceId: S.workspaceId, sessionVersion: 0 })));
  check('En SU workspace (membership OWNER) no esta en modo soporte', own.kind === 'ok' && own.ctx.access === 'MEMBER');

  const notOperator = await startSupportSession({ actorUserId: A.ownerId, workspaceId: B.workspaceId, reason: 'probando acceso' });
  check('Un OWNER de workspace (USER de plataforma) no abre soporte', !notOperator.ok && notOperator.error === 'NOT_OPERATOR');
  const noReason = await startSupportSession({ actorUserId: S.ownerId, workspaceId: A.workspaceId, reason: ' ' });
  check('Soporte sin motivo se rechaza', !noReason.ok && noReason.error === 'REASON_REQUIRED');
  const isMember = await startSupportSession({ actorUserId: S.ownerId, workspaceId: S.workspaceId, reason: 'mi propio negocio' });
  check('No se abre soporte donde ya es miembro', !isMember.ok && isMember.error === 'IS_MEMBER');

  const started = await startSupportSession({ actorUserId: S.ownerId, workspaceId: A.workspaceId, reason: 'ticket 123: revisar pipeline', minutes: 240 });
  if (!started.ok) throw new Error('No se pudo abrir soporte');
  const support = await crossTenantPrisma.supportSession.findUniqueOrThrow({ where: { id: started.supportSessionId } });
  check('Nace READ_ONLY', support.mode === SupportAccessMode.READ_ONLY);
  check('TTL recortado a 60 minutos', support.expiresAt.getTime() - support.startedAt.getTime() === 60 * 60 * 1000);

  const operator = { id: S.ownerId, workspaceId: A.workspaceId, supportSessionId: started.supportSessionId };
  const read = await throughProxy({ user: operator, method: 'GET', path: '/api/contacts' }, () => contactsRoute.GET());
  const readBody = JSON.stringify(await read.json());
  check('Soporte READ_ONLY puede leer A', read.status === 200 && readBody.includes('SoloA') && !readBody.includes('SoloB'));

  const sid = started.supportSessionId;
  // Rastro de soporte: intentos/bloqueos en PlatformAuditLog; acciones de
  // negocio COMPLETADAS en el AuditLog del workspace, con supportSessionId.
  const trail = async () => {
    const [attempted, blockedCount, business, fakeSuccess] = await Promise.all([
      crossTenantPrisma.platformAuditLog.count({ where: { supportSessionId: sid, action: 'support.write.attempted' } }),
      crossTenantPrisma.platformAuditLog.count({ where: { supportSessionId: sid, action: 'support.write.blocked' } }),
      prisma.auditLog.findMany({
        where: { workspaceId: A.workspaceId, metadata: { path: ['supportSessionId'], equals: sid }, action: { notIn: ['support.started', 'support.elevated'] } },
        select: { action: true },
      }),
      crossTenantPrisma.platformAuditLog.count({
        where: { supportSessionId: sid, OR: [{ action: { contains: 'succeed' } }, { action: 'support.write' }] },
      }),
    ]);
    return { attempted, blocked: blockedCount, business: business.map((entry) => entry.action), fakeSuccess };
  };

  // Una conversacion de A para probar exito y rechazo reales del negocio.
  const supportChannel = await prisma.whatsAppChannel.create({
    data: { workspaceId: A.workspaceId, wabaId: `waba-s-${stamp}`, phoneNumberId: `phone-s-${stamp}`, displayPhoneNumber: '+56933330000', status: WhatsAppChannelStatus.CONNECTED },
  });
  const supportContact = await prisma.contact.findFirstOrThrow({ where: { workspaceId: A.workspaceId, firstName: 'SoloA' } });
  const supportConversation = await prisma.conversation.create({
    data: { workspaceId: A.workspaceId, channelId: supportChannel.id, contactId: supportContact.id, mode: ConversationMode.AI_ACTIVE, status: ConversationStatus.OPEN },
  });
  const assignAs = (assigneeId: string) =>
    throughProxy(
      { user: operator, method: 'POST', path: `/api/conversations/${supportConversation.id}/assign`, body: { assigneeId } },
      (request) => assignRoute.POST(request, { params: Promise.resolve({ id: supportConversation.id }) }),
    );

  const beforeWrite = await prisma.contact.count({ where: { workspaceId: A.workspaceId } });
  const roAssign = await assignAs(U.id);
  const afterRo = await trail();
  check('READ_ONLY: asignar → 403, sin ejecutar', roAssign.status === 403, `${roAssign.status}`);
  check(
    'READ_ONLY: queda como bloqueado, sin intento ni exito',
    afterRo.blocked === 1 && afterRo.attempted === 0 && afterRo.business.length === 0 && afterRo.fakeSuccess === 0,
    JSON.stringify(afterRo),
  );
  const blocked = await throughProxy(
    { user: operator, method: 'POST', path: '/api/contacts', body: { firstName: 'Escrito por soporte RO', lastName: 'Prueba' } },
    (request) => contactsRoute.POST(request),
  );
  const blockedBody = (await blocked.json()) as { code?: string };
  check('Soporte READ_ONLY: POST → 403 SUPPORT_READ_ONLY', blocked.status === 403 && blockedBody.code === 'SUPPORT_READ_ONLY');
  const blockedPatch = await throughProxy(
    { user: operator, method: 'DELETE', path: '/api/opportunities/cualquiera' },
    (request: NextRequest) => opportunityRoute.DELETE(request, { params: Promise.resolve({ id: 'cualquiera' }) }),
  );
  check('Tambien DELETE (guard central, no por endpoint)', blockedPatch.status === 403);
  check('Y no se escribio nada', (await prisma.contact.count({ where: { workspaceId: A.workspaceId } })) === beforeWrite);

  const noElevationReason = await elevateSupportSession({ actorUserId: S.ownerId, supportSessionId: started.supportSessionId, reason: '' });
  check('Elevar sin motivo se rechaza', !noElevationReason.ok);
  const wrongActor = await elevateSupportSession({ actorUserId: A.ownerId, supportSessionId: started.supportSessionId, reason: 'no soy el operador' });
  check('Otro usuario no puede elevar la sesion ajena', !wrongActor.ok);
  const elevated = await elevateSupportSession({ actorUserId: S.ownerId, supportSessionId: started.supportSessionId, reason: 'corregir contacto duplicado' });
  check('Elevacion explicita con motivo', elevated.ok);

  const write = await throughProxy(
    { user: operator, method: 'POST', path: '/api/contacts', body: { firstName: 'Escrito por soporte RW', lastName: 'Prueba' } },
    (request) => contactsRoute.POST(request),
  );
  check('Soporte READ_WRITE: la mutacion pasa', write.status === 201, `${write.status}`);
  const afterContact = await trail();
  check('Esa mutacion queda como INTENTO en PlatformAuditLog', afterContact.attempted === 1, JSON.stringify(afterContact));

  // READ_WRITE + handler exitoso: la accion de negocio queda con supportSessionId.
  const okAssign = await assignAs(U.id);
  const afterOk = await trail();
  check('READ_WRITE + exito: asignar → 200', okAssign.status === 200, `${okAssign.status}`);
  check(
    'READ_WRITE + exito: intento en PlatformAuditLog y accion en AuditLog con supportSessionId',
    afterOk.attempted === 2 && afterOk.business.includes('conversation.assigned'),
    JSON.stringify(afterOk),
  );

  // READ_WRITE + rechazo del handler (usuario de otro tenant): intento, pero
  // ninguna accion de negocio registrada.
  const rejected = await assignAs(B.ownerId);
  const afterRejected = await trail();
  check('READ_WRITE + rechazo: asignar a usuario de B → 404', rejected.status === 404, `${rejected.status}`);
  check(
    'READ_WRITE + rechazo: solo suma un intento, nada que diga que ocurrio',
    afterRejected.attempted === 3 &&
      afterRejected.business.length === afterOk.business.length &&
      afterRejected.fakeSuccess === 0,
    JSON.stringify(afterRejected),
  );
  const started2 = await crossTenantPrisma.platformAuditLog.count({ where: { supportSessionId: sid, action: { in: ['support.started', 'support.elevated'] } } });
  check('Inicio y elevacion tambien auditados', started2 === 2);

  await crossTenantPrisma.supportSession.update({ where: { id: started.supportSessionId }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const expired = await resolveContextForSession(readSessionToken(createSessionToken(
    { userId: S.ownerId, activeWorkspaceId: A.workspaceId, supportSessionId: started.supportSessionId, sessionVersion: 0 },
  )));
  check('Soporte vencido: sin contexto', expired.kind === 'no-workspace');
  const expiredWrite = await throughProxy(
    { user: operator, method: 'POST', path: '/api/contacts', body: { firstName: 'Tras vencer', lastName: 'Prueba' } },
    (request) => contactsRoute.POST(request),
  );
  check('Soporte vencido no escribe', expiredWrite.status === 403, `${expiredWrite.status}`);
  const afterExpired = await trail();
  check(
    'Soporte vencido: queda como bloqueado, sin intento nuevo ni exito',
    afterExpired.blocked === afterRejected.blocked + 1 &&
      afterExpired.attempted === afterRejected.attempted &&
      afterExpired.business.length === afterRejected.business.length &&
      afterExpired.fakeSuccess === 0,
    JSON.stringify(afterExpired),
  );

  await prisma.user.update({ where: { id: S.ownerId }, data: { platformRole: PlatformRole.USER } });
  const demoted = await startSupportSession({ actorUserId: S.ownerId, workspaceId: A.workspaceId, reason: 'ya no soy operador' });
  check('Degradado a USER ya no abre soporte', !demoted.ok);
}

// =============================================================================
console.log('\n== SaaS Billing vs Commerce (Mercado Pago fail-closed) ==');
{
  process.env.MERCADO_PAGO_ACCESS_TOKEN = 'TEST-foundation-token';
  process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'foundation-webhook-secret';
  const originalFetch = globalThis.fetch;

  function sign(dataId: string, requestId: string) {
    const ts = Math.floor(Date.now() / 1000);
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
    return `ts=${ts},v1=${createHmac('sha256', 'foundation-webhook-secret').update(manifest).digest('hex')}`;
  }

  function stub(payments: Record<string, unknown>, merchantOrders: Record<string, unknown> = {}) {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      for (const [id, body] of Object.entries(payments)) {
        if (url.includes(`api.mercadopago.com/v1/payments/${id}`)) return new Response(JSON.stringify(body), { status: 200 });
      }
      for (const [id, body] of Object.entries(merchantOrders)) {
        if (url.includes(`api.mercadopago.com/merchant_orders/${id}`)) return new Response(JSON.stringify(body), { status: 200 });
      }
      throw new Error(`fetch no simulado: ${url}`);
    }) as typeof fetch;
  }

  async function deliver(dataId: string) {
    const requestId = `req-${dataId}`;
    const request = new Request(`http://localhost:3001/api/billing/webhook?type=payment&data.id=${dataId}`, {
      method: 'POST',
      headers: { 'x-signature': sign(dataId, requestId), 'x-request-id': requestId, 'x-forwarded-for': '203.0.113.77' },
    });
    try {
      return await billingWebhook(request);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  async function ledger(workspaceId: string) {
    const [subscription, payments, orders] = await Promise.all([
      prisma.workspaceSubscription.findFirstOrThrow({ where: { workspaceId }, orderBy: { createdAt: 'desc' } }),
      prisma.payment.count({ where: { workspaceId } }),
      prisma.customerOrder.count({ where: { workspaceId } }),
    ]);
    return { status: subscription.status, mpPaymentId: subscription.mpPaymentId, payments, orders };
  }

  // 1. Pago sin marca, preferencia desconocida → 200, nada cambia.
  const unknownId = `unk-${stamp}`;
  stub(
    { [unknownId]: { status: 'approved', transaction_amount: 29990, external_reference: A.workspaceId, metadata: {}, order: { id: 9001 } } },
    { '9001': { id: 9001, preference_id: `pref-desconocida-${stamp}` } },
  );
  const before = await ledger(A.workspaceId);
  const unknown = await deliver(unknownId);
  const unknownBody = (await unknown.json()) as { ignored?: boolean };
  check('Pago no identificado → 200 ignorado', unknown.status === 200 && unknownBody.ignored === true);
  const afterUnknown = await ledger(A.workspaceId);
  check('No modifico WorkspaceSubscription, Payment ni CustomerOrder', JSON.stringify(before) === JSON.stringify(afterUnknown));

  // 2. Marca vieja kind=subscription sin preferencia conocida → ignorado.
  const oldKindId = `old-${stamp}`;
  stub(
    { [oldKindId]: { status: 'approved', transaction_amount: 29990, external_reference: A.workspaceId, metadata: { kind: 'subscription' }, order: { id: 9002 } } },
    { '9002': { id: 9002, preference_id: `pref-otra-${stamp}` } },
  );
  const oldKind = await deliver(oldKindId);
  check('kind=subscription sin preferencia SaaS conocida → ignorado', oldKind.status === 200 && JSON.stringify(await ledger(A.workspaceId)) === JSON.stringify(before));

  // 3. Pedido (Commerce) → crea Payment y NO toca la suscripcion.
  const order = await prisma.customerOrder.create({ data: { workspaceId: A.workspaceId, status: 'PENDING_PAYMENT', total: 5000, subtotal: 5000 } });
  const orderPayId = `ord-${stamp}`;
  stub({ [orderPayId]: { status: 'pending', transaction_amount: 5000, currency_id: 'CLP', external_reference: order.id, metadata: { kind: 'order', orderId: order.id } } });
  const orderResponse = await deliver(orderPayId);
  const afterOrder = await ledger(A.workspaceId);
  check('Pago de pedido procesado como Commerce', orderResponse.status === 200 && afterOrder.payments === before.payments + 1);
  check('Y no toco WorkspaceSubscription', afterOrder.status === before.status && afterOrder.mpPaymentId === before.mpPaymentId);

  // 4. Suscripcion SaaS marcada → activa la suscripcion y NO crea Payment/CustomerOrder.
  const plan = await prisma.subscriptionPlan.findFirstOrThrow({ where: { id: (await prisma.workspaceSubscription.findFirstOrThrow({ where: { workspaceId: B.workspaceId } })).planId } });
  const beforeB = await ledger(B.workspaceId);
  const saasId = `saas-${stamp}`;
  stub({ [saasId]: { status: 'approved', transaction_amount: plan.priceClp, external_reference: B.workspaceId, metadata: { kind: 'saas_subscription', workspaceId: B.workspaceId } } });
  const saas = await deliver(saasId);
  const afterB = await ledger(B.workspaceId);
  check('Pago SaaS activa la suscripcion', saas.status === 200 && afterB.status === SubscriptionStatus.ACTIVE && afterB.mpPaymentId === saasId);
  check('Y no creo Payment ni CustomerOrder', afterB.payments === beforeB.payments && afterB.orders === beforeB.orders);

  // 5. Preferencia SaaS legacy conocida (sin kind nuevo) → se acepta.
  const legacyPref = `pref-legacy-${stamp}`;
  await prisma.auditLog.create({ data: { workspaceId: C.workspaceId, action: 'billing.checkout_started', entity: 'WorkspaceSubscription', metadata: { preferenceId: legacyPref } } });
  const beforeC = await ledger(C.workspaceId);
  const legacyId = `leg-${stamp}`;
  stub(
    { [legacyId]: { status: 'approved', transaction_amount: plan.priceClp, external_reference: C.workspaceId, metadata: { kind: 'subscription' }, order: { id: 9003 } } },
    { '9003': { id: 9003, preference_id: legacyPref } },
  );
  const legacy = await deliver(legacyId);
  const afterC = await ledger(C.workspaceId);
  check('Preferencia SaaS legacy conocida → se procesa como suscripcion', legacy.status === 200 && afterC.mpPaymentId === legacyId);
  check('Sin tocar Commerce', afterC.payments === beforeC.payments && afterC.orders === beforeC.orders);

  // 6. La misma preferencia legacy no sirve para OTRO workspace.
  const crossId = `crs-${stamp}`;
  stub(
    { [crossId]: { status: 'approved', transaction_amount: plan.priceClp, external_reference: A.workspaceId, metadata: {}, order: { id: 9004 } } },
    { '9004': { id: 9004, preference_id: legacyPref } },
  );
  const beforeCross = await ledger(A.workspaceId);
  await deliver(crossId);
  check('Preferencia legacy de C no activa nada en A', JSON.stringify(await ledger(A.workspaceId)) === JSON.stringify(beforeCross));

  // 7. Un cobro de la cuenta de A no puede pagar un pedido de B.
  const orderB = await prisma.customerOrder.create({ data: { workspaceId: B.workspaceId, status: 'PENDING_PAYMENT', total: 1000, subtotal: 1000 } });
  const crossOrder = await processOrderPayment({
    orderId: orderB.id,
    externalPaymentId: `x-${stamp}`,
    status: 'APPROVED',
    rawStatus: 'approved',
    amount: 1000,
    currency: 'CLP',
    baseUrl: 'http://localhost:3001',
    workspaceId: A.workspaceId,
  });
  check('Pago de la cuenta de A contra pedido de B → rechazado', !crossOrder.handled);
  check('Sin Payment en B', (await prisma.payment.count({ where: { workspaceId: B.workspaceId } })) === beforeB.payments);

  delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
  delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
}

// =============================================================================
// Limpieza: los workspaces arrastran memberships, soporte, contactos y demas.
await crossTenantPrisma.job.deleteMany({ where: { workspaceId: { in: createdWorkspaces }, type: JobType.SEND_PUSH } });
await crossTenantPrisma.platformAuditLog.deleteMany({ where: { targetWorkspaceId: { in: createdWorkspaces } } });
// Step 2: borrar un workspace ya no borra la cuenta global (SetNull).
const testUsers = (await prisma.workspaceMembership.findMany({ where: { workspaceId: { in: createdWorkspaces } }, select: { userId: true } })).map((m) => m.userId);
const cleaned = await crossTenantPrisma.workspace.deleteMany({ where: { id: { in: createdWorkspaces } } });
await prisma.user.deleteMany({ where: { id: { in: [...new Set(testUsers)] } } });
console.log(`\nLimpieza: ${cleaned.count} workspaces de prueba eliminados (cascade).`);

const passed = results.filter((result) => result.ok).length;
console.log(`\n== Resultado: ${passed}/${results.length} pruebas OK ==`);
await prisma.$disconnect();
if (failures > 0) process.exit(1);
