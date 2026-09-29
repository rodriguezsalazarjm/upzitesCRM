import { NextResponse } from 'next/server';
import { startPublicCheckoutPayment } from '@/lib/commerce/public-checkout';
import { callerKey, consume } from '@/lib/ops/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Inicia el pago del checkout publico. Solo recibe el token del enlace: el
 * monto, la moneda y el producto salen del pedido guardado, y la cuenta de
 * Mercado Pago es la del workspace dueno del pedido.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await request.formData().catch(() => null);
  const rawToken = form?.get('t');
  const token = typeof rawToken === 'string' ? rawToken : '';
  // El browser solo expresa una decision booleana. Variante, precio, moneda y
  // total se vuelven a resolver desde la orden y el catalogo bajo lock.
  const includeBump = form?.get('includeBump') === 'on';

  const back = (error: string) => {
    const query = new URLSearchParams({ t: token, e: error });
    return NextResponse.redirect(new URL(`/checkout/${encodeURIComponent(id)}?${query.toString()}`, request.url), 303);
  };

  const limit = await consume('publicToken', `checkout:${callerKey(request)}`);
  if (!limit.allowed) return back('RATE_LIMITED');

  const result = await startPublicCheckoutPayment(id, token, includeBump);
  if (!result.ok) return back(result.reason);

  return NextResponse.redirect(new URL(result.redirectUrl, request.url), 303);
}
