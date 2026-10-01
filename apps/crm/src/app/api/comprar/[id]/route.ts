import { NextResponse } from 'next/server';
import { startProductCheckout } from '@/lib/commerce/product-checkout';
import { callerKey, consume } from '@/lib/ops/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Compra de un producto desde su enlace publico. Solo se leen la firma del
 * enlace, la variante elegida y los datos del comprador: cualquier precio,
 * moneda o total que venga en el formulario se ignora. El pedido se crea con
 * el catalogo del servidor y el comprador sigue en el checkout canonico.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await request.formData().catch(() => null);
  const field = (name: string) => {
    const value = form?.get(name);
    return typeof value === 'string' ? value : '';
  };
  const key = field('k');

  const back = (error: string) => {
    const query = new URLSearchParams({ k: key, e: error });
    const variantId = field('variantId');
    if (variantId) query.set('v', variantId);
    return NextResponse.redirect(new URL(`/comprar/${encodeURIComponent(id)}?${query.toString()}`, request.url), 303);
  };

  const limit = await consume('capture', `product-checkout:${callerKey(request)}`);
  if (!limit.allowed) return back('RATE_LIMITED');

  const result = await startProductCheckout(id, key, { variantId: field('variantId') || null, name: field('name'), email: field('email') });
  if (!result.ok) return back(result.reason);
  return NextResponse.redirect(new URL(result.checkoutPath, request.url), 303);
}
