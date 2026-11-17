import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { canApproveQuotes } from '@/lib/quotes/roles';
import { QuoteStudioError } from '@/lib/quote-studio/service';

type Ctx = { userId: string; workspaceId: string };

/**
 * P37: cotizar lo puede cualquier miembro; marca, plantillas y catálogo son de
 * owner/admin (definen cómo se ve y cuánto cobra el negocio).
 */
export async function studioHandler(run: (ctx: Ctx) => Promise<unknown>, options: { manage?: boolean; status?: number } = {}) {
  const user = await requireCurrentUser();
  if (options.manage && !canApproveQuotes(user.role)) return NextResponse.json({ message: 'Solo el owner o un admin puede cambiar la marca, las plantillas o el catálogo.' }, { status: 403 });
  try {
    return NextResponse.json({ data: (await run({ userId: user.id, workspaceId: user.workspace.id })) ?? null }, { status: options.status ?? 200 });
  } catch (error) {
    if (error instanceof QuoteStudioError) return NextResponse.json({ message: error.message }, { status: 422 });
    if (error instanceof ZodError) return NextResponse.json({ message: error.issues[0]?.message ?? 'Datos inválidos.' }, { status: 422 });
    throw error;
  }
}

export async function jsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new QuoteStudioError('El cuerpo de la solicitud debe ser JSON válido.');
  }
}
