import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { cache } from 'react';
import { PlatformRole, WorkspaceRole } from '../../generated/prisma/enums';
import { DEV_DEMO_USER, isDatabaseUnavailable, isDevDemoEnabled } from './dev-demo';
import { prisma } from './prisma';
import { REQUEST_ID_HEADER, REQUEST_METHOD_HEADER, REQUEST_PATH_HEADER } from './request-headers';
import { readSessionCookie, readUnverifiedSessionCookie } from './session';
import { sessionVersionMatches, type Session } from './session-token';
import { withPlatformScope } from './tenant-guard';
import {
  canWrite,
  hasPlatformRole,
  hasWorkspaceRole,
  resolveAccess,
  type AccessDecision,
  type AccessDenyReason,
} from './workspace-access';

/**
 * Contexto de workspace del request, resuelto SIEMPRE en el servidor.
 *
 * La cookie aporta userId + workspace elegido; aqui se verifica, en cada
 * request, que exista una membership ACTIVE (o una SupportSession vigente)
 * para ese par. El cliente nunca decide el workspace de una operacion.
 */

export {
  REQUEST_ID_HEADER,
  REQUEST_METHOD_HEADER,
  REQUEST_PATH_HEADER,
  SUPPORT_SESSION_HEADER,
  WORKSPACE_HEADER,
} from './request-headers';

export type WorkspaceContext = {
  user: { id: string; name: string; email: string; platformRole: PlatformRole };
  workspace: { id: string; name: string; slug: string };
  /** Rol efectivo en ESTE workspace. */
  role: WorkspaceRole;
  access: 'MEMBER' | 'SUPPORT';
  supportSession: { id: string; mode: 'READ_ONLY' | 'READ_WRITE'; expiresAt: Date } | null;
};

export type ContextState =
  | { kind: 'anonymous' }
  | { kind: 'no-workspace'; userId: string; reason: AccessDenyReason; session: Session }
  | { kind: 'ok'; ctx: WorkspaceContext; session: Session };

const DEMO_CONTEXT: WorkspaceContext = {
  user: {
    id: DEV_DEMO_USER.id,
    name: DEV_DEMO_USER.name,
    email: DEV_DEMO_USER.email,
    platformRole: PlatformRole.USER,
  },
  workspace: DEV_DEMO_USER.workspace,
  role: WorkspaceRole.OWNER,
  access: 'MEMBER',
  supportSession: null,
};

/** Carga los datos y decide. Sin cache: la usan el proxy y los tests. */
export async function resolveContextForSession(session: Session | null, now = new Date()): Promise<ContextState> {
  if (!session) return { kind: 'anonymous' };
  if (isDevDemoEnabled() && session.userId === DEV_DEMO_USER.id) {
    return { kind: 'ok', ctx: DEMO_CONTEXT, session };
  }

  let user, membership, supportSession;
  try {
    // Lecturas de identidad, no de datos del tenant: se marcan como plataforma
    // para la guardia de tests (buscan por userId, no por workspace).
    [user, membership, supportSession] = await withPlatformScope(() =>
      Promise.all([
        prisma.user.findUnique({
          where: { id: session.userId },
          select: { id: true, name: true, email: true, platformRole: true, sessionVersion: true },
        }),
        session.activeWorkspaceId && !session.supportSessionId
          ? prisma.workspaceMembership.findUnique({
              where: { userId_workspaceId: { userId: session.userId, workspaceId: session.activeWorkspaceId } },
              select: { role: true, status: true, planLimitedAt: true, workspace: { select: { id: true, name: true, slug: true } } },
            })
          : null,
        session.supportSessionId
          ? prisma.supportSession.findUnique({
              where: { id: session.supportSessionId },
              select: {
                id: true,
                actorUserId: true,
                workspaceId: true,
                mode: true,
                expiresAt: true,
                endedAt: true,
                workspace: { select: { id: true, name: true, slug: true } },
              },
            })
          : null,
      ]),
    );
  } catch (error) {
    if (isDevDemoEnabled() && isDatabaseUnavailable(error)) return { kind: 'ok', ctx: DEMO_CONTEXT, session };
    throw error;
  }

  // Credenciales cambiadas (reset, cierre global): la cookie ya no vale.
  if (user && !sessionVersionMatches(session, user)) return { kind: 'anonymous' };

  const decision = resolveAccess({
    now,
    activeWorkspaceId: session.activeWorkspaceId,
    supportSessionId: session.supportSessionId,
    user,
    membership,
    supportSession,
  });

  if (!decision.ok) {
    if (decision.reason === 'USER_NOT_FOUND') return { kind: 'anonymous' };
    return { kind: 'no-workspace', userId: session.userId, reason: decision.reason, session };
  }

  return { kind: 'ok', ctx: toContext(user!, decision), session };
}

function toContext(
  user: { id: string; name: string; email: string; platformRole: PlatformRole },
  decision: Extract<AccessDecision, { ok: true }>,
): WorkspaceContext {
  return {
    user,
    workspace: decision.workspace,
    role: decision.role,
    access: decision.access,
    supportSession: decision.access === 'SUPPORT' ? decision.supportSession : null,
  };
}

async function requestMeta() {
  const h = await headers();
  return {
    method: h.get(REQUEST_METHOD_HEADER),
    path: h.get(REQUEST_PATH_HEADER),
    requestId: h.get(REQUEST_ID_HEADER),
  };
}

/**
 * Estado del request actual, una sola vez por render (React cache).
 *
 * Defensa en profundidad: si el request es una mutacion (segun el proxy) y el
 * acceso es soporte READ_ONLY, se rechaza aqui aunque el endpoint no haya
 * llamado a `requireWorkspaceWriteAccess()`. El proxy ya lo corta antes; esto
 * cubre el caso de que un matcher mal configurado lo deje pasar.
 */
export const getContextState = cache(async (): Promise<ContextState> => {
  const state = await resolveContextForSession(await readUnverifiedSessionCookie());
  if (state.kind === 'ok' && state.ctx.access === 'SUPPORT') {
    const { method } = await requestMeta();
    const write = canWrite(
      { ok: true, access: 'SUPPORT', role: state.ctx.role, workspace: state.ctx.workspace, supportSession: state.ctx.supportSession! },
      method,
    );
    if (!write.ok) throw new SupportReadOnlyError();
  }
  return state;
});

export class SupportReadOnlyError extends Error {
  constructor() {
    super('SUPPORT_READ_ONLY: la sesion de soporte es de solo lectura.');
  }
}

export async function getWorkspaceContext(): Promise<WorkspaceContext | null> {
  const state = await getContextState();
  return state.kind === 'ok' ? state.ctx : null;
}

/**
 * Para paginas y route handlers. Sin sesion → /login. Con sesion pero sin un
 * workspace valido (membership revocada, soporte vencido) → el resolvedor,
 * que elige otro workspace permitido y reemite la cookie (un Server Component
 * no puede escribir cookies).
 */
export async function requireWorkspaceContext(): Promise<WorkspaceContext> {
  const state = await getContextState();
  if (state.kind === 'anonymous') redirect('/login');
  if (state.kind === 'no-workspace') redirect('/api/workspaces/resolve');
  return state.ctx;
}

type Guard = { ok: true; ctx: WorkspaceContext } | { ok: false; response: NextResponse };

/** Rol minimo dentro del workspace activo. 403 si no alcanza. */
export async function requireWorkspaceRole(min: WorkspaceRole): Promise<Guard> {
  const ctx = await requireWorkspaceContext();
  if (!hasWorkspaceRole(ctx.role, min)) {
    return { ok: false, response: NextResponse.json({ message: 'No tienes permiso para esta accion.' }, { status: 403 }) };
  }
  return { ok: true, ctx };
}

/**
 * Rol de plataforma minimo. No depende de tener un workspace activo. Quien no
 * alcanza recibe 404, no 403: que la ruta exista no es asunto de un cliente.
 * Se consulta en cada request (no va en la cookie): revocar es inmediato.
 */
export async function requirePlatformRole(min: PlatformRole = PlatformRole.PLATFORM_ADMIN) {
  const session = await readSessionCookie();
  if (!session || session.userId === DEV_DEMO_USER.id) notFound();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, platformRole: true },
  });
  if (!user || !hasPlatformRole(user.platformRole, min)) notFound();
  // Version de la sesion verificada, para reemitir la cookie sin refrescarla.
  return { ...user, sessionVersion: session.sessionVersion };
}

// --- Escritura: guard central -----------------------------------------------

export type WriteAccessResult =
  | { ok: true; ctx: WorkspaceContext | null }
  | { ok: false; status: 401 | 403; code: 'UNAUTHENTICATED' | 'SUPPORT_READ_ONLY' | 'NO_WORKSPACE' };

/**
 * Decide si una mutacion puede ejecutarse. Lo invoca el proxy para TODAS las
 * mutaciones con sesion de soporte, asi que ningun endpoint tiene que
 * acordarse de llamarlo.
 *
 * Auditoria de soporte, sin fingir resultados: el proxy decide ANTES de que
 * corra el handler y no ve su respuesta final (400/409/500). Por eso aqui solo
 * se registra lo que se sabe con certeza, en PlatformAuditLog:
 *  - `support.write.blocked`: rechazado aqui (READ_ONLY, sesion vencida).
 *  - `support.write.attempted`: READ_WRITE dejo pasar el request al handler.
 * Que la operacion OCURRIO lo registra el propio negocio: `recordAudit` anota
 * el `supportSessionId` en el AuditLog del workspace, y solo se llama cuando
 * la accion se completo. Un request rechazado queda como intento, nunca como
 * exito. `requestId` hace idempotente el registro.
 */
export async function checkWriteAccess(input: {
  session: Session | null;
  method: string;
  path: string;
  requestId: string;
  now?: Date;
}): Promise<WriteAccessResult> {
  const state = await resolveContextForSession(input.session, input.now);
  if (state.kind === 'anonymous') return { ok: false, status: 401, code: 'UNAUTHENTICATED' };
  if (state.kind === 'no-workspace') {
    // Una sesion de soporte vencida o cerrada no puede escribir ni por descuido.
    if (input.session?.supportSessionId) {
      await recordSupportWrite('support.write.blocked', {
        actorUserId: input.session.userId,
        workspaceId: input.session.activeWorkspaceId,
        supportSessionId: input.session.supportSessionId,
        method: input.method,
        path: input.path,
        requestId: input.requestId,
        reason: state.reason,
      });
      return { ok: false, status: 403, code: 'SUPPORT_READ_ONLY' };
    }
    return { ok: false, status: 403, code: 'NO_WORKSPACE' };
  }

  const { ctx } = state;
  if (ctx.access === 'MEMBER') return { ok: true, ctx };

  const support = {
    actorUserId: ctx.user.id,
    workspaceId: ctx.workspace.id,
    supportSessionId: ctx.supportSession!.id,
    method: input.method,
    path: input.path,
    requestId: input.requestId,
  };
  const write = canWrite(
    { ok: true, access: 'SUPPORT', role: ctx.role, workspace: ctx.workspace, supportSession: ctx.supportSession! },
    input.method,
  );
  if (!write.ok) {
    await recordSupportWrite('support.write.blocked', { ...support, reason: write.code });
    return { ok: false, status: 403, code: write.code };
  }
  if (write.audit) await recordSupportWrite('support.write.attempted', support);
  return { ok: true, ctx };
}

async function recordSupportWrite(
  action: 'support.write.attempted' | 'support.write.blocked',
  input: {
    actorUserId: string;
    workspaceId: string | null;
    supportSessionId: string;
    method: string;
    path: string;
    requestId: string;
    reason?: string;
  },
) {
  await withPlatformScope(() =>
    prisma.platformAuditLog.createMany({
      data: [
        {
          id: `pal_${action === 'support.write.attempted' ? 'swa' : 'swb'}_${input.requestId}`,
          actorUserId: input.actorUserId,
          action,
          targetWorkspaceId: input.workspaceId,
          supportSessionId: input.supportSessionId,
          metadata: {
            method: input.method,
            path: input.path,
            requestId: input.requestId,
            ...(input.reason ? { reason: input.reason } : {}),
          },
        },
      ],
      skipDuplicates: true,
    }),
  );
}

/**
 * Version para handlers: misma decision que aplica el proxy. Util cuando un
 * endpoint quiere el contexto ya validado para escribir.
 */
export async function requireWorkspaceWriteAccess(): Promise<Guard> {
  const meta = await requestMeta();
  const result = await checkWriteAccess({
    session: await readSessionCookie(),
    // Sin marca del proxy se asume escritura: falla cerrado.
    method: meta.method ?? 'POST',
    path: meta.path ?? 'unknown',
    requestId: meta.requestId ?? crypto.randomUUID(),
  });
  if (!result.ok) {
    return { ok: false, response: NextResponse.json({ code: result.code, message: writeDeniedMessage(result.code) }, { status: result.status }) };
  }
  if (!result.ctx) redirect('/login');
  return { ok: true, ctx: result.ctx };
}

export function writeDeniedMessage(code: 'UNAUTHENTICATED' | 'SUPPORT_READ_ONLY' | 'NO_WORKSPACE') {
  if (code === 'SUPPORT_READ_ONLY') return 'Sesion de soporte en solo lectura: eleva el acceso con un motivo para modificar datos.';
  if (code === 'NO_WORKSPACE') return 'No tienes acceso a este workspace.';
  return 'Inicia sesion.';
}

// --- Pertenencia -------------------------------------------------------------

export { assertMember, isActiveMember, listMyWorkspaces, NotAMemberError } from './membership';
