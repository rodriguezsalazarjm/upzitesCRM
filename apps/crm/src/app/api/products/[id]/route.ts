import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { getStudioProduct, saveStudioProduct } from '@/lib/commerce/product-studio/service';
import { handleStudio, readJson, studioActor } from '@/lib/commerce/product-studio/http';

export const dynamic = 'force-dynamic';

/** Producto del workspace activo (cualquier miembro puede verlo). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  return handleStudio(async () => NextResponse.json({ data: await getStudioProduct(user.workspace.id, id) }));
}

/** Guarda informacion, precio, variantes y producto adicional (OWNER/ADMIN). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const body = await readJson(request);
  return handleStudio(async () => NextResponse.json({ data: await saveStudioProduct(studioActor(user), id, body) }));
}
