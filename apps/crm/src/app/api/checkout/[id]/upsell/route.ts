import { NextResponse } from 'next/server';
import { decideUpsell } from '@/lib/commerce/public-checkout';
import { upsellDecisionSchema } from '@/lib/commerce/offers/rules';
import { callerKey, consume } from '@/lib/ops/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Aceptar o rechazar el upsell de un pedido pagado. Solo recibe el token del
 * enlace y la decision: oferta, precio y moneda se resuelven en el servidor.
 * Aceptar lleva al pago del pedido adicional (Mercado Pago del workspace).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await request.formData().catch(() => null);
  const rawToken = form?.get('t');
  const token = typeof rawToken === 'string' ? rawToken : '';
  const decision = upsellDecisionSchema.safeParse(form?.get('decision'));

  const back = (error: string) => {
    const query = new URLSearchParams({ t: token, e: error });
    return NextResponse.redirect(new URL(`/checkout/${encodeURIComponent(id)}?${query.toString()}`, request.url), 303);
  };

  const limit = await consume('publicToken', `checkout:${callerKey(request)}`);
  if (!limit.allowed) return back('RATE_LIMITED');
  if (!decision.success) return back('UPSELL_UNAVAILABLE');

  const result = await decideUpsell(id, token, decision.data);
  if (!result.ok) return back(result.reason === 'UNAVAILABLE' ? 'UPSELL_UNAVAILABLE' : result.reason);
  return NextResponse.redirect(new URL(result.redirectUrl, request.url), 303);
}
