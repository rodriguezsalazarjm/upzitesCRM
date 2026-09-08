import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { createOrderCheckout, CheckoutError } from '@/lib/commerce/checkout';

/** Genera el enlace de pago de un pedido. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  try {
    const result = await createOrderCheckout({
      workspaceId: user.workspace.id,
      orderId: id,
      actorId: user.id,
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof CheckoutError) {
      const status =
        error.code === 'NOT_FOUND' ? 404 : error.code === 'NOT_CONFIGURED' ? 503 : error.code === 'PROVIDER' ? 502 : 409;
      return NextResponse.json({ message: error.message, code: error.code }, { status });
    }
    throw error;
  }
}
