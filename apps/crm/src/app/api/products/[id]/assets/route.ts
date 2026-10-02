import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { readJson, studioActor } from '@/lib/commerce/product-studio/http';
import { createAsset, listProductAssets } from '@/lib/commerce/digital-assets/service';
import { handleAssets } from '@/lib/commerce/digital-assets/http';

export const dynamic = 'force-dynamic';

/** Contenido entregable del producto, en orden (equipo del workspace). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  return handleAssets(async () => NextResponse.json({ data: (await listProductAssets(user.workspace.id, id)).assets }));
}

/**
 * Agrega un enlace (`source: "link"`) o confirma un archivo ya subido
 * (`source: "upload"`, con la intencion firmada). OWNER/ADMIN.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const body = await readJson(request);
  return handleAssets(async () => NextResponse.json({ data: await createAsset(studioActor(user), id, body) }, { status: 201 }));
}
