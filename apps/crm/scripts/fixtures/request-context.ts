import { NextRequest } from 'next/server';
import { createRequestStoreForAPI } from 'next/dist/server/async-storage/request-store';
import {
  workAsyncStorage,
  type WorkStore,
} from 'next/dist/server/app-render/work-async-storage.external';
import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external';
import { createSessionToken } from '../../src/lib/auth';
import type { UserRole } from '../../generated/prisma/client';

/** Ejecuta el handler real con cookie firmada y consulta real de usuario.
 * Solo se reproduce el contexto HTTP de Next; no se reemplaza autorizacion.
 */
export function asUser<T>(
  user: { id: string; workspaceId: string; role: UserRole } | null,
  run: () => T,
) {
  const token = user
    ? createSessionToken({ userId: user.id, workspaceId: user.workspaceId, role: user.role })
    : '';
  const request = new NextRequest('http://localhost/api/test', {
    headers: { cookie: `upzites_crm_session=${token}` },
  });
  const store = createRequestStoreForAPI(
    request,
    { pathname: '/api/test' },
    { tags: [], expirationsByCacheKind: new Map() },
    undefined,
    undefined,
  );
  return workAsyncStorage.run({ route: '/api/test' } as WorkStore, () =>
    workUnitAsyncStorage.run(store, run),
  );
}
