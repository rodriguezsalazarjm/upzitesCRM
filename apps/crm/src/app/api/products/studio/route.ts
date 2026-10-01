import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { createStudioProduct } from '@/lib/commerce/product-studio/service';
import { handleStudio, readJson, studioActor } from '@/lib/commerce/product-studio/http';

export const dynamic = 'force-dynamic';

/**
 * Product Sales Studio: crea un producto como BORRADOR. El cuerpo se valida
 * con una whitelist estricta (lib/commerce/product-studio/rules); workspace,
 * estado y metadata los decide el servidor.
 */
export async function POST(request: Request) {
  const user = await requireCurrentUser();
  const body = await readJson(request);
  return handleStudio(async () => {
    const created = await createStudioProduct(studioActor(user), body);
    return NextResponse.json({ data: created }, { status: 201 });
  });
}
