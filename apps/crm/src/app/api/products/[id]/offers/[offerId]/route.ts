import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { deleteProductOffer, updateProductOffer } from '@/lib/commerce/offers/service';
import { handleStudio, readJson, studioActor } from '@/lib/commerce/product-studio/http';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; offerId: string }> };

/** Copy, producto, precio especial, imagen y activacion (OWNER/ADMIN). */
export async function PATCH(request: Request, { params }: Params) {
  const user = await requireCurrentUser();
  const { id, offerId } = await params;
  const body = await readJson(request);
  return handleStudio(async () => NextResponse.json({ data: await updateProductOffer(studioActor(user), id, offerId, body) }));
}

/** Elimina la oferta (o la archiva si ya tiene medicion). OWNER/ADMIN. */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await requireCurrentUser();
  const { id, offerId } = await params;
  return handleStudio(async () => NextResponse.json({ data: await deleteProductOffer(studioActor(user), id, offerId) }));
}
