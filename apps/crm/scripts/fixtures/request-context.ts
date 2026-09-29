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
  /** Version de credenciales de la cookie; por defecto 0 (usuarios nuevos). */
  sessionVersion?: number;
};

function tokenFor(user: SessionUser | null) {
  return user
    ? createSessionToken({
        userId: user.id,
        activeWorkspaceId: user.workspaceId,
        supportSessionId: user.supportSessionId,
        sessionVersion: user.sessionVersion ?? 0,
      })
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
  const workStore = { route: request.nextUrl.pathname, afterContext: { after: queueAfter } } as unknown as WorkStore;
  return workAsyncStorage.run(workStore, () =>
    workUnitAsyncStorage.run(store, run),
  );
}

/**
 * `after()` de Next dentro de la suite: como en produccion, la tarea NO corre
 * durante el handler; queda en cola hasta `flushAfterTasks()` (el "despues de
 * responder" del test). Sin esto `after` lanzaria fuera de un request real.
 */
const afterQueue: (() => unknown)[] = [];
function queueAfter(task: unknown) {
  afterQueue.push(typeof task === 'function' ? (task as () => unknown) : () => task);
}

/** Tareas `after()` programadas y aun no ejecutadas. */
export function pendingAfterTasks() {
  return afterQueue.length;
}

/** Ejecuta (y espera) las tareas `after()` en cola. Devuelve cuantas corrio. */
export async function flushAfterTasks() {
  const tasks = afterQueue.splice(0);
  for (const task of tasks) await task();
  return tasks.length;
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
 * Como `asUser`, y ademas devuelve la cookie de sesion que el handler emitio
 * (`setSessionCookie`), leida del store de cookies mutables de Next.
 */
export async function asUserCapturingSession<T>(user: SessionUser | null, run: () => Promise<T>, options: { token?: string } = {}) {
  let issued: string | undefined;
  const result = await asUser(user, async () => {
    const value = await run();
    const store = workUnitAsyncStorage.getStore() as unknown as { mutableCookies?: { get(name: string): { value: string } | undefined } };
    issued = store?.mutableCookies?.get(SESSION_COOKIE)?.value;
    return value;
  }, options);
  // El store tambien refleja la cookie del request: solo cuenta si el handler emitio otra.
  const sent = options.token ?? tokenFor(user);
  if (!issued || issued === sent) issued = undefined;
  return { result, sessionToken: issued };
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
