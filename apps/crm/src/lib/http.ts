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
