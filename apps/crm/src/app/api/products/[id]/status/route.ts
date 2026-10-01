import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { changeStudioProductStatus } from '@/lib/commerce/product-studio/service';
import { statusActionSchema } from '@/lib/commerce/product-studio/rules';
import { handleStudio, readJson, studioActor } from '@/lib/commerce/product-studio/http';

export const dynamic = 'force-dynamic';

/** Publicar, despublicar, archivar o restaurar (OWNER/ADMIN). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const parsed = statusActionSchema.safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ code: 'INVALID', message: 'Acción no válida.' }, { status: 400 });
  return handleStudio(async () => NextResponse.json({ data: await changeStudioProductStatus(studioActor(user), id, parsed.data.action) }));
}
