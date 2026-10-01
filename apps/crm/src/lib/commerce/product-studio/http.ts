import { NextResponse } from 'next/server';
import type { CurrentUser } from '../../auth';
import { EntitlementError } from '../../entitlements';
import { entitlementResponse } from '../../entitlements/http';
import { StorageNotConfiguredError } from '../../storage';
import { CoverError } from './cover';
import { ProductStudioError, type StudioActor } from './service';

/** Actor del Studio: SIEMPRE el workspace activo y el rol de la sesion verificada. */
export function studioActor(user: CurrentUser): StudioActor {
  return { userId: user.id, workspaceId: user.workspace.id, role: user.role };
}

/** Errores del Studio → HTTP. Lo desconocido se relanza (500 con log). */
export async function handleStudio(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    const json = (status: number, code: string, message: string, field?: string) => NextResponse.json({ code, message, ...(field ? { field } : {}) }, { status });
    if (error instanceof EntitlementError) return entitlementResponse(error);
    if (error instanceof ProductStudioError) {
      const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : error.code === 'INVALID' ? 400 : 409;
      return json(status, error.code, error.message, error.field);
    }
    if (error instanceof CoverError) return json(400, error.code, error.message, 'cover');
    if (error instanceof StorageNotConfiguredError) {
      return json(503, 'STORAGE_NOT_CONFIGURED', 'El almacenamiento de imágenes no está configurado en este entorno.');
    }
    throw error;
  }
}

/** JSON del request o null (cuerpo invalido). */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
