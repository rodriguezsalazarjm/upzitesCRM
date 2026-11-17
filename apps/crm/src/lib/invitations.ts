import { createHmac, randomBytes } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import { InvitationOrigin, MembershipStatus, WorkspaceRole } from '../../generated/prisma/enums';
import { prisma } from './prisma';
import { recordAudit } from './domain/audit';
import { normalizeEmail } from './identity';
import { hashPassword } from './password';
import { getSessionSecret } from './session-token';
import { withEntitlementLock } from './entitlements/lock';
import { sendPlatformEmail, type PlatformEmailOutcome, type PlatformEmailSender } from './platform/transactional-email';
import { assertInvitationHasSeat, assertSeatAvailable, reservingInvitationWhere } from './team/seats';

/**
 * Invitaciones a un workspace (P0-D; asientos y origen en P0-F). UN solo
 * sistema: lo usan Platform Admin y la gestion de equipo del cliente.
 *
 *  - Token de 32 bytes aleatorios (base64url). En la base SOLO su HMAC: quien
 *    lea la tabla no puede aceptar nada. El token en claro se devuelve UNA vez
 *    a quien crea/reenvia; despues no se puede recuperar.
 *  - Un solo uso, TTL de 7 dias. Reenviar genera un token nuevo en la misma
 *    fila: el hash cambia, el enlace anterior deja de servir y NO se reserva
 *    un segundo asiento.
 *  - Asientos (team/seats): TODA invitacion pendiente y vigente reserva un
 *    asiento de `users.max`, sea de origen WORKSPACE o PLATFORM. Crear (y
 *    reenviar una vencida) ocurre bajo el lock de P0-C: dos invitaciones
 *    simultaneas no toman el mismo ultimo asiento. Sin bypass para
 *    PLATFORM_ADMIN ni SUPER_ADMIN: sobrepasar el limite, si alguna vez hace
 *    falta, sera una accion explicita y auditada aparte. Aceptar vuelve a
 *    comprobar el asiento como defensa adicional.
 *  - Aceptar: si el email no tiene cuenta, se crea la cuenta GLOBAL (nombre +
 *    contrasena) y la membership; si ya tiene, hay que estar autenticado como
 *    ESA cuenta y solo se agrega la membership. Nunca dos cuentas por email.
 *    Una membership SUSPENDED nunca se reactiva por invitacion. La misma cuenta
 *    que ya acepto recibe una respuesta idempotente.
 */

export const INVITATION_TTL_DAYS = 7;
const DAY_MS = 86_400_000;

export type InvitationErrorCode =
  | 'NOT_FOUND'
  | 'EXPIRED'
  | 'REVOKED'
  | 'ALREADY_ACCEPTED'
  | 'AUTH_REQUIRED'
  | 'WRONG_ACCOUNT'
  | 'ACCOUNT_EXISTS'
  | 'INVALID_INPUT'
  | 'ALREADY_MEMBER'
  | 'MEMBERSHIP_SUSPENDED'
  | 'NOT_PENDING';

export class InvitationError extends Error {
  constructor(
    readonly code: InvitationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'InvitationError';
  }
}

export function hashInvitationToken(token: string) {
  return createHmac('sha256', getSessionSecret()).update(`invitation:${token}`).digest('hex');
}

function newToken() {
  return randomBytes(32).toString('base64url');
}

export function invitationUrl(token: string) {
  const base = (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
  return `${base}/invitacion/${token}`;
}

type Actor = { actorId?: string | null; via?: 'platform' | 'workspace' | 'cli' };

/** Nombres de auditoria: la gestion de equipo usa `workspace.invitation.*`. */
function auditAction(origin: InvitationOrigin, name: 'created' | 'revoked' | 'resent') {
  if (origin === InvitationOrigin.WORKSPACE) return `workspace.invitation.${name}`;
  return name === 'resent' ? 'invitation.regenerated' : `invitation.${name}`;
}

async function platformAudit(action: string, workspaceId: string, actor: Actor, metadata: Record<string, unknown>) {
  if (actor.via !== 'platform') return;
  await prisma.platformAuditLog.create({
    data: { actorUserId: actor.actorId ?? null, action, targetWorkspaceId: workspaceId, metadata: metadata as never },
  });
}

/**
 * Crea una invitacion y devuelve el token en claro (unica vez). Si ya habia
 * una pendiente para el mismo email en el workspace, se revoca: queda una
 * sola invitacion viva por persona (y una sola reserva de asiento).
 */
export async function createInvitation(
  input: { workspaceId: string; email: string; role: WorkspaceRole; origin?: InvitationOrigin; now?: Date } & Actor,
) {
  const email = normalizeEmail(input.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InvitationError('INVALID_INPUT', 'Email invalido.');
  const now = input.now ?? new Date();
  const origin = input.origin ?? InvitationOrigin.PLATFORM;

  const membership = await prisma.workspaceMembership.findFirst({
    where: { workspaceId: input.workspaceId, user: { email } },
    select: { status: true },
  });
  if (membership?.status === MembershipStatus.ACTIVE) throw new InvitationError('ALREADY_MEMBER', 'Esa persona ya es miembro del workspace.');
  if (membership?.status === MembershipStatus.SUSPENDED) {
    throw new InvitationError('MEMBERSHIP_SUSPENDED', 'Esa persona esta suspendida en este workspace: reactivala desde Equipo en vez de invitarla.');
  }

  const token = newToken();
  const persist = async (tx: Prisma.TransactionClient) => {
    await tx.workspaceInvitation.updateMany({
      where: { workspaceId: input.workspaceId, email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    const created = await tx.workspaceInvitation.create({
      data: {
        workspaceId: input.workspaceId,
        email,
        role: input.role,
        origin,
        tokenHash: hashInvitationToken(token),
        invitedByUserId: input.actorId ?? null,
        expiresAt: new Date(now.getTime() + INVITATION_TTL_DAYS * DAY_MS),
      },
      select: { id: true, workspaceId: true, email: true, role: true, origin: true, expiresAt: true },
    });
    await recordAudit(
      {
        workspaceId: input.workspaceId,
        actorId: input.actorId ?? null,
        action: auditAction(origin, 'created'),
        entity: 'WorkspaceInvitation',
        entityId: created.id,
        metadata: { email, role: input.role, via: input.via ?? 'workspace', origin },
      },
      tx,
    );
    return created;
  };

  // Cualquier origen: lock central de asientos + chequeo de users.max.
  const invitation = await withEntitlementLock(input.workspaceId, 'users.max', async (tx) => {
    // Reinvitar al mismo email reemplaza su reserva: no suma un asiento.
    const releasing = await tx.workspaceInvitation.count({ where: { ...reservingInvitationWhere(input.workspaceId, now), email } });
    await assertSeatAvailable(input.workspaceId, tx, { releasing, now });
    return persist(tx);
  });
  await platformAudit('invitation.created', input.workspaceId, input, { invitationId: invitation.id, email, role: input.role });
  return { invitation, token, url: invitationUrl(token) };
}

async function pendingInvitation(workspaceId: string, invitationId: string) {
  const invitation = await prisma.workspaceInvitation.findFirst({ where: { id: invitationId, workspaceId } });
  if (!invitation) throw new InvitationError('NOT_FOUND', 'Invitacion no encontrada.');
  if (invitation.acceptedAt || invitation.revokedAt) throw new InvitationError('NOT_PENDING', 'La invitacion ya no esta pendiente.');
  return invitation;
}

/** Revocar libera el asiento reservado en el acto. */
export async function revokeInvitation(input: { workspaceId: string; invitationId: string; now?: Date } & Actor) {
  const invitation = await pendingInvitation(input.workspaceId, input.invitationId);
  const updated = await prisma.workspaceInvitation.updateMany({
    where: { id: input.invitationId, workspaceId: input.workspaceId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: input.now ?? new Date() },
  });
  if (updated.count === 0) throw new InvitationError('NOT_PENDING', 'La invitacion ya no esta pendiente.');
  await recordAudit({
    workspaceId: input.workspaceId,
    actorId: input.actorId ?? null,
    action: auditAction(invitation.origin, 'revoked'),
    entity: 'WorkspaceInvitation',
    entityId: input.invitationId,
    metadata: { email: invitation.email, role: invitation.role, via: input.via ?? 'workspace' },
  });
  await platformAudit('invitation.revoked', input.workspaceId, input, { invitationId: input.invitationId });
}

/**
 * Regenera el token (invalida el anterior) y renueva el vencimiento, en la
 * MISMA fila: no reserva un asiento nuevo. Si estaba vencida (ya no
 * reservaba), volver a reservar exige asiento libre, sea cual sea su origen.
 */
export async function resendInvitation(input: { workspaceId: string; invitationId: string; now?: Date } & Actor) {
  const invitation = await pendingInvitation(input.workspaceId, input.invitationId);
  const now = input.now ?? new Date();
  const token = newToken();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_DAYS * DAY_MS);
  const regenerate = async (tx: Prisma.TransactionClient) => {
    const updated = await tx.workspaceInvitation.updateMany({
      where: { id: invitation.id, workspaceId: input.workspaceId, acceptedAt: null, revokedAt: null },
      data: { tokenHash: hashInvitationToken(token), expiresAt },
    });
    if (updated.count === 0) throw new InvitationError('NOT_PENDING', 'La invitacion ya no esta pendiente.');
  };
  if (invitation.expiresAt <= now) {
    await withEntitlementLock(input.workspaceId, 'users.max', async (tx) => {
      await assertSeatAvailable(input.workspaceId, tx, { now });
      await regenerate(tx);
    });
  } else {
    await prisma.$transaction(regenerate);
  }
  await recordAudit({
    workspaceId: input.workspaceId,
    actorId: input.actorId ?? null,
    action: auditAction(invitation.origin, 'resent'),
    entity: 'WorkspaceInvitation',
    entityId: invitation.id,
    metadata: { email: invitation.email, role: invitation.role, via: input.via ?? 'workspace' },
  });
  await platformAudit('invitation.regenerated', input.workspaceId, input, { invitationId: invitation.id });
  return { invitation: { ...invitation, expiresAt }, token, url: invitationUrl(token) };
}

/**
 * Envia el enlace por el email de PLATAFORMA (no consume la cuota de email del
 * workspace). Sin proveedor devuelve NOT_CONFIGURED y la UI ofrece copiar.
 */
export async function sendInvitationEmail(
  input: { invitationId: string; workspaceId: string; token: string },
  sender?: PlatformEmailSender,
): Promise<PlatformEmailOutcome> {
  const invitation = await prisma.workspaceInvitation.findFirstOrThrow({
    where: { id: input.invitationId, workspaceId: input.workspaceId },
    include: { workspace: { select: { name: true } } },
  });
  const url = invitationUrl(input.token);
  const outcome = await sendPlatformEmail(
    {
      kind: 'INVITATION',
      to: invitation.email,
      subject: `Te invitaron a ${invitation.workspace.name} en Upzites Flow`,
      text: `Te invitaron a unirte a ${invitation.workspace.name} en Upzites Flow.\n\nAcepta aqui (vence en ${INVITATION_TTL_DAYS} dias):\n${url}\n`,
      html: `<p>Te invitaron a unirte a <strong>${escapeHtml(invitation.workspace.name)}</strong> en Upzites Flow.</p><p><a href="${escapeHtml(url)}">Aceptar invitacion</a> (vence en ${INVITATION_TTL_DAYS} dias).</p>`,
      idempotencyKey: `invitation:${invitation.id}:${hashInvitationToken(input.token).slice(0, 16)}`,
    },
    sender,
  );
  if (outcome.sent) {
    await prisma.workspaceInvitation.updateMany({ where: { id: invitation.id, workspaceId: input.workspaceId }, data: { lastSentAt: new Date() } });
  }
  return outcome;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export type InvitationView = {
  status: 'VALID' | 'EXPIRED' | 'REVOKED' | 'ACCEPTED' | 'NOT_FOUND';
  email?: string;
  role?: WorkspaceRole;
  workspaceName?: string;
  /** El email ya tiene cuenta: hay que iniciar sesion con ella. */
  accountExists?: boolean;
};

/** Lo que ve la pagina publica de aceptacion. No revela nada si el token no existe. */
export async function inspectInvitation(token: string, now = new Date()): Promise<InvitationView> {
  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    include: { workspace: { select: { name: true } } },
  });
  if (!invitation) return { status: 'NOT_FOUND' };
  const base = { email: invitation.email, role: invitation.role, workspaceName: invitation.workspace.name };
  if (invitation.acceptedAt) return { status: 'ACCEPTED', ...base };
  if (invitation.revokedAt) return { status: 'REVOKED', ...base };
  if (invitation.expiresAt <= now) return { status: 'EXPIRED', ...base };
  const account = await prisma.user.findUnique({ where: { email: invitation.email }, select: { id: true } });
  return { status: 'VALID', ...base, accountExists: Boolean(account) };
}

function suspendedError() {
  return new InvitationError(
    'MEMBERSHIP_SUSPENDED',
    'Tu acceso a este negocio esta suspendido. Pide a un owner o admin que te reactive; la invitacion no lo hace.',
  );
}

/**
 * Acepta una invitacion.
 *  - `sessionUserId`: cuenta autenticada en este navegador (si hay).
 *  - `newAccount`: nombre + contrasena, solo si el email NO tiene cuenta.
 * Lanza InvitationError o EntitlementError (sin asiento / suspendido).
 */
export async function acceptInvitation(input: {
  token: string;
  sessionUserId?: string | null;
  newAccount?: { name: string; password: string; confirmPassword: string } | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const tokenHash = hashInvitationToken(input.token);
  const found = await prisma.workspaceInvitation.findUnique({ where: { tokenHash } });
  if (!found) throw new InvitationError('NOT_FOUND', 'La invitacion no existe o el enlace ya no es valido.');
  // Idempotente para la MISMA cuenta que ya acepto (doble click, reintento).
  // Para cualquier otra cuenta, o sin sesion, el token ya no sirve.
  const repeated = () => ({ userId: found.acceptedByUserId!, workspaceId: found.workspaceId, createdAccount: false, alreadyMember: true, alreadyAccepted: true });
  if (found.acceptedAt) {
    if (input.sessionUserId && found.acceptedByUserId === input.sessionUserId) return repeated();
    throw new InvitationError('ALREADY_ACCEPTED', 'La invitacion ya fue usada.');
  }
  // Estado primero (se revalida dentro del lock): un enlace usado, revocado o
  // vencido se explica antes de pedir datos.
  if (found.revokedAt) throw new InvitationError('REVOKED', 'La invitacion fue revocada.');
  if (found.expiresAt <= now) throw new InvitationError('EXPIRED', 'La invitacion vencio. Pide que te la reenvien.');

  const existing = await prisma.user.findUnique({ where: { email: found.email }, select: { id: true } });
  if (existing) {
    if (!input.sessionUserId) throw new InvitationError('AUTH_REQUIRED', 'Inicia sesion con la cuenta invitada para aceptar.');
    if (input.sessionUserId !== existing.id) throw new InvitationError('WRONG_ACCOUNT', 'La invitacion es para otra cuenta.');
  } else {
    const account = input.newAccount;
    if (!account || account.name.trim().length < 2) throw new InvitationError('INVALID_INPUT', 'Indica tu nombre.');
    if (account.password.length < 8) throw new InvitationError('INVALID_INPUT', 'La contrasena debe tener al menos 8 caracteres.');
    if (account.password !== account.confirmPassword) throw new InvitationError('INVALID_INPUT', 'Las contrasenas no coinciden.');
  }

  return withEntitlementLock(found.workspaceId, 'users.max', async (tx) => {
    // Un solo uso: la fila se bloquea y se relee dentro del lock.
    await tx.$queryRaw`SELECT id FROM workspace_invitations WHERE id = ${found.id} FOR UPDATE`;
    const invitation = await tx.workspaceInvitation.findUniqueOrThrow({ where: { id: found.id } });
    if (invitation.tokenHash !== tokenHash) throw new InvitationError('NOT_FOUND', 'El enlace ya no es valido.');
    if (invitation.acceptedAt) {
      if (input.sessionUserId && invitation.acceptedByUserId === input.sessionUserId) {
        return { userId: invitation.acceptedByUserId!, workspaceId: invitation.workspaceId, createdAccount: false, alreadyMember: true, alreadyAccepted: true };
      }
      throw new InvitationError('ALREADY_ACCEPTED', 'La invitacion ya fue usada.');
    }
    if (invitation.revokedAt) throw new InvitationError('REVOKED', 'La invitacion fue revocada.');
    if (invitation.expiresAt <= now) throw new InvitationError('EXPIRED', 'La invitacion vencio. Pide que te la reenvien.');

    let userId = existing?.id ?? null;
    const membership = userId
      ? await tx.workspaceMembership.findUnique({ where: { userId_workspaceId: { userId, workspaceId: invitation.workspaceId } } })
      : null;
    // Suspendido por un admin: la invitacion no lo revierte en silencio.
    if (membership?.status === MembershipStatus.SUSPENDED) throw suspendedError();
    const alreadyMember = membership?.status === MembershipStatus.ACTIVE;

    // Ya era miembro: respuesta segura e idempotente, sin gastar asiento. Si
    // no, la invitacion debe conservar su asiento (un downgrade puede haberla
    // dejado fuera: PLAN_LIMIT, la invitacion sigue pendiente).
    if (!alreadyMember) await assertInvitationHasSeat(invitation.workspaceId, invitation.id, tx, now);

    if (!userId) {
      try {
        const created = await tx.user.create({
          data: {
            name: input.newAccount!.name.trim(),
            email: invitation.email,
            passwordHash: hashPassword(input.newAccount!.password),
            lastActiveWorkspaceId: invitation.workspaceId,
          },
          select: { id: true },
        });
        userId = created.id;
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          throw new InvitationError('ACCOUNT_EXISTS', 'Ya existe una cuenta con ese email: inicia sesion para aceptar.');
        }
        throw error;
      }
    }

    if (!alreadyMember) {
      await tx.workspaceMembership.create({
        data: { userId, workspaceId: invitation.workspaceId, role: invitation.role, invitedById: invitation.invitedByUserId },
      });
    }
    await tx.workspaceInvitation.update({ where: { id: invitation.id }, data: { acceptedAt: now, acceptedByUserId: userId } });
    await recordAudit(
      {
        workspaceId: invitation.workspaceId,
        actorId: userId,
        action: 'invitation.accepted',
        entity: 'WorkspaceInvitation',
        entityId: invitation.id,
        metadata: { email: invitation.email, role: invitation.role, newAccount: !existing, alreadyMember, origin: invitation.origin },
      },
      tx,
    );
    return { userId, workspaceId: invitation.workspaceId, createdAccount: !existing, alreadyMember, alreadyAccepted: false };
  });
}

export { WorkspaceRole };
