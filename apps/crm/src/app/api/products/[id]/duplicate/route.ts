import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { duplicateStudioProduct } from '@/lib/commerce/product-studio/service';
import { handleStudio, studioActor } from '@/lib/commerce/product-studio/http';

export const dynamic = 'force-dynamic';

/** Duplica como borrador del mismo workspace (OWNER/ADMIN). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  return handleStudio(async () => NextResponse.json({ data: await duplicateStudioProduct(studioActor(user), id) }, { status: 201 }));
}
