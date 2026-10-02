import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { readJson, studioActor } from '@/lib/commerce/product-studio/http';
import { removeAsset, updateAsset } from '@/lib/commerce/digital-assets/service';
import { handleAssets } from '@/lib/commerce/digital-assets/http';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; assetId: string }> };

/** Renombrar/editar, activar, desactivar o mover (OWNER/ADMIN). */
export async function PATCH(request: Request, { params }: Params) {
  const user = await requireCurrentUser();
  const { id, assetId } = await params;
  const body = await readJson(request);
  return handleAssets(async () => NextResponse.json({ data: await updateAsset(studioActor(user), id, assetId, body) }));
}

/** Quitar de la entrega. Si ya se entrego, se archiva y las entregas previas lo conservan. */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await requireCurrentUser();
  const { id, assetId } = await params;
  return handleAssets(async () => NextResponse.json({ data: await removeAsset(studioActor(user), id, assetId) }));
}
