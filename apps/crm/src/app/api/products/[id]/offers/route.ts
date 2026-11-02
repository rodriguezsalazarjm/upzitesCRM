import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { createProductOffer, listProductOffers, reorderProductOffers } from '@/lib/commerce/offers/service';
import { handleStudio, readJson, studioActor } from '@/lib/commerce/product-studio/http';

export const dynamic = 'force-dynamic';

/** Ofertas del producto con su medicion (cualquier miembro puede verlas). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  return handleStudio(async () => NextResponse.json({ data: await listProductOffers(user.workspace.id, id) }));
}

/** Nueva oferta: order bump o upsell postcompra (OWNER/ADMIN). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const body = await readJson(request);
  return handleStudio(async () => NextResponse.json({ data: await createProductOffer(studioActor(user), id, body) }, { status: 201 }));
}

/** Prioridad: el orden completo de las ofertas de un tipo (OWNER/ADMIN). */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const body = await readJson(request);
  return handleStudio(async () => NextResponse.json({ data: await reorderProductOffers(studioActor(user), id, body) }));
}
