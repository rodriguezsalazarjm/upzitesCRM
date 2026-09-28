import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { catalogTerms, PLAN_CATALOG, PLAN_CODES } from '@/lib/billing/plan-catalog';
import { listCurrentPrices } from '@/lib/billing/price-book';
import { getEntitlements } from '@/lib/billing/usage';

export const dynamic = 'force-dynamic';

/**
 * Planes a la venta (FREE/START/PRO/SCALE), sus precios vigentes por moneda
 * (del Price Book, nunca escritos en la UI) y la suscripcion resuelta.
 *
 * Cambiar de plan NO se hace aqui: se paga en `/api/billing/checkout` y lo
 * activa el webhook tras confirmar el pago contra Mercado Pago. Un endpoint que
 * cambiara el plan sin pago seria una forma de subir de plan gratis.
 */
export async function GET() {
  const user = await requireCurrentUser();
  const [prices, current] = await Promise.all([listCurrentPrices(), getEntitlements(user.workspace.id)]);

  return NextResponse.json({
    data: {
      current: {
        ...current.plan,
        state: current.state,
        active: current.active,
        configuredPlan: current.subscription.configuredPlan,
        effectivePlan: current.subscription.effectivePlan,
        billingSource: current.subscription.billingSource,
        periodEnd: current.subscription.periodEnd,
        graceEndsAt: current.subscription.graceEndsAt,
      },
      available: PLAN_CODES.map((code) => ({
        code,
        ...catalogTerms(code),
        features: PLAN_CATALOG[code].features,
        position: PLAN_CATALOG[code].position,
        prices: prices
          .filter((price) => price.planCode === code)
          .map((price) => ({ id: price.id, currency: price.currency, interval: price.interval, amountMinor: price.amountMinor })),
      })),
    },
  });
}
