import { NextRequest } from 'next/server';
import { createRequestStoreForAPI } from 'next/dist/server/async-storage/request-store';
import {
  workAsyncStorage,
  type WorkStore,
} from 'next/dist/server/app-render/work-async-storage.external';
import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external';
import { createSessionToken, SESSION_COOKIE } from '../../src/lib/session-token';
import { proxy } from '../../src/proxy';

type SessionUser = {
  id: string;
  /** Workspace activo de la sesion (antes: el unico workspace del usuario). */
  workspaceId: string | null;
  supportSessionId?: string | null;
};

function tokenFor(user: SessionUser | null) {
  return user
    ? createSessionToken({ userId: user.id, activeWorkspaceId: user.workspaceId, supportSessionId: user.supportSessionId })
    : '';
}

function runInRequest<T>(request: NextRequest, run: () => T) {
  const store = createRequestStoreForAPI(
    request,
    { pathname: request.nextUrl.pathname },
    { tags: [], expirationsByCacheKind: new Map() },
    undefined,
    undefined,
  );
  return workAsyncStorage.run({ route: request.nextUrl.pathname } as WorkStore, () =>
    workUnitAsyncStorage.run(store, run),
  );
}

/** Ejecuta el handler real con cookie firmada y consulta real de usuario.
 * Solo se reproduce el contexto HTTP de Next; no se reemplaza autorizacion.
 * `token` permite inyectar una cookie ya firmada (p. ej. una v1 heredada).
 */
export function asUser<T>(user: SessionUser | null, run: () => T, options: { token?: string } = {}) {
  const token = options.token ?? tokenFor(user);
  const request = new NextRequest('http://localhost/api/test', {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });
  return runInRequest(request, run);
}

/**
 * Request completo como en produccion: primero `src/proxy.ts` (409 multi-
 * pestana, soporte READ_ONLY, marcas de metodo) y, si deja pasar, el handler
 * con los headers que el proxy reenvia.
 */
export async function throughProxy(
  input: {
    user: SessionUser | null;
    method: string;
    path: string;
    body?: unknown;
    headers?: Record<string, string>;
    token?: string;
  },
  handler: (request: NextRequest) => Promise<Response> | Response,
): Promise<Response> {
  const token = input.token ?? tokenFor(input.user);
  const url = `http://localhost${input.path}`;
  const baseHeaders: Record<string, string> = {
    cookie: `${SESSION_COOKIE}=${token}`,
    ...(input.body !== undefined ? { 'content-type': 'application/json' } : {}),
    ...input.headers,
  };
  const body = input.body !== undefined ? JSON.stringify(input.body) : undefined;

  const gate = await proxy(new NextRequest(url, { method: input.method, headers: baseHeaders, body }));
  if (!gate.headers.get('x-middleware-next')) return gate;

  // NextResponse.next({ request: { headers } }) codifica los headers
  // reenviados; se reconstruyen igual que lo hace el servidor de Next.
  const forwarded = new Headers();
  const names = (gate.headers.get('x-middleware-override-headers') ?? '').split(',').filter(Boolean);
  for (const name of names) {
    const value = gate.headers.get(`x-middleware-request-${name}`);
    if (value !== null) forwarded.set(name, value);
  }
  const request = new NextRequest(url, { method: input.method, headers: forwarded, body });
  return runInRequest(request, () => handler(request));
}
