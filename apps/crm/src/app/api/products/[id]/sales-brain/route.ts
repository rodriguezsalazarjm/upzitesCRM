import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { studioActor } from '@/lib/commerce/product-studio/http';
import { getProductSalesBrain, ProductSalesBrainError, saveProductSalesBrain } from '@/lib/product-sales-brain/service';

export const dynamic = 'force-dynamic';

function failure(error: unknown) {
  if (error instanceof ProductSalesBrainError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 400;
    return NextResponse.json({ message: error.message, field: error.field }, { status });
  }
  throw error;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  try { return NextResponse.json({ data: await getProductSalesBrain(user.workspace.id, id) }); } catch (error) { return failure(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const body = await request.json().catch(() => null);
  try { return NextResponse.json({ data: await saveProductSalesBrain(studioActor(user), id, body) }); } catch (error) { return failure(error); }
}
