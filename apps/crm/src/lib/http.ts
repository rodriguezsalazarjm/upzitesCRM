import { NextResponse } from 'next/server';
import type { z } from 'zod';

type ParseResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/**
 * Lee y valida el cuerpo JSON de una request contra un schema de Zod.
 * Ante JSON malformado o datos invalidos devuelve un 400 con mensaje claro
 * (en vez de propagar la excepcion como un 500 generico).
 *
 * Uso:
 *   const parsed = await parseBody(request, schema);
 *   if (!parsed.ok) return parsed.response;
 *   const input = parsed.data;
 */
export async function parseBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<ParseResult<z.infer<S>>> {
  let json: unknown;

  try {
    json = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ message: 'El cuerpo de la solicitud debe ser JSON valido.' }, { status: 400 }),
    };
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join(', ') || 'Datos invalidos.';
    return {
      ok: false,
      response: NextResponse.json({ message, issues: result.error.flatten() }, { status: 400 }),
    };
  }

  return { ok: true, data: result.data };
}

/**
 * Ejecuta una escritura de Prisma y devuelve `null` si el registro no existe.
 *
 * Existe por un defecto real (D13): rutas como `PATCH /api/contacts/[id]`
 * escriben con `where: { id, workspaceId }`, que protege el dato correctamente
 * —un id de otro workspace no toca nada— pero lanza `P2025` sin capturar y el
 * cliente recibe un **500**. La matriz de lanzamiento exige 404 o 403: un 500
 * dice "algo se rompio aqui dentro", que es informacion que no corresponde dar
 * a quien esta probando ids ajenos.
 *
 * Solo se traga `P2025` (registro no encontrado). Cualquier otro error sube:
 * un fallo de conexion no puede disfrazarse de 404.
 */
export async function orNull<T>(operation: Promise<T>): Promise<T | null> {
  try {
    return await operation;
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    if (code === 'P2025') return null;
    throw error;
  }
}

/** Respuesta 404 uniforme. No dice si el id existe en otra parte. */
export function notFound(entity = 'Recurso') {
  return NextResponse.json({ message: `${entity} no encontrado` }, { status: 404 });
}
