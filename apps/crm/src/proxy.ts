import { NextResponse, type NextRequest } from 'next/server';
import {
  PROXY_OWNED_HEADERS,
  REQUEST_ID_HEADER,
  REQUEST_METHOD_HEADER,
  REQUEST_PATH_HEADER,
  SUPPORT_SESSION_HEADER,
  WORKSPACE_HEADER,
} from './lib/request-headers';
import { readSessionToken, SESSION_COOKIE } from './lib/session-token';
import { isMutationMethod } from './lib/workspace-access';
import { checkWriteAccess, writeDeniedMessage } from './lib/workspace-context';

/**
 * Punto unico por el que pasan todos los requests (P0-FOUNDATION).
 *
 * 1. Marca el request con metodo, ruta e id. El contexto de servidor los usa
 *    para saber si esta dentro de una mutacion; los que mande el cliente se
 *    borran y se reescriben, asi que no se pueden falsificar.
 * 2. Multi-pestana: si una mutacion declara `x-upzites-workspace` y no coincide
 *    con el workspace activo de la sesion → 409 WORKSPACE_CHANGED, sin tocar el
 *    handler. El header es solo una comprobacion de consistencia: NUNCA
 *    autoriza nada (la autorizacion la hace el contexto con membership).
 * 3. Soporte: toda mutacion con sesion de soporte pasa por `checkWriteAccess`.
 *    READ_ONLY se rechaza (`support.write.blocked`); READ_WRITE se registra
 *    como INTENTO (`support.write.attempted`). El proxy no ve la respuesta
 *    del handler, asi que nunca registra un exito: eso queda en el AuditLog de
 *    negocio, que `recordAudit` enlaza con la SupportSession.
 */

/** Siempre permitidas, aun en soporte READ_ONLY o con otra pestana desfasada. */
const SESSION_CONTROL_PATHS = ['/api/auth/', '/api/workspaces/switch', '/api/platform/support-sessions'];

function isSessionControl(path: string) {
  return SESSION_CONTROL_PATHS.some((prefix) => path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`));
}

export async function proxy(request: NextRequest) {
  const method = request.method.toUpperCase();
  const path = request.nextUrl.pathname;
  const requestId = crypto.randomUUID();
  const session = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  const forwarded = new Headers(request.headers);
  for (const name of PROXY_OWNED_HEADERS) forwarded.delete(name);
  forwarded.set(REQUEST_METHOD_HEADER, method);
  forwarded.set(REQUEST_PATH_HEADER, path);
  forwarded.set(REQUEST_ID_HEADER, requestId);
  // Sale de la cookie firmada, no del cliente: enlaza la auditoria de negocio.
  if (session?.supportSessionId) forwarded.set(SUPPORT_SESSION_HEADER, session.supportSessionId);

  if (session && path.startsWith('/api/') && isMutationMethod(method) && !isSessionControl(path)) {
    const claimed = request.headers.get(WORKSPACE_HEADER);
    if (claimed && claimed !== session.activeWorkspaceId) {
      return NextResponse.json(
        {
          code: 'WORKSPACE_CHANGED',
          message: 'Cambiaste de negocio en otra pestana. Recarga para continuar sin mezclar datos.',
        },
        { status: 409 },
      );
    }

    if (session.supportSessionId) {
      const result = await checkWriteAccess({ session, method, path, requestId });
      if (!result.ok) {
        return NextResponse.json({ code: result.code, message: writeDeniedMessage(result.code) }, { status: result.status });
      }
    }
  }

  return NextResponse.next({ request: { headers: forwarded } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|pdf|txt|xml|woff2?)$).*)'],
};
