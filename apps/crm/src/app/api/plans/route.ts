import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { planTerms } from '@/lib/billing/plans';
import { getEntitlements } from '@/lib/billing/usage';
import { ensureBetaPlans } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

/**
 * Planes disponibles y el vigente del workspace.
 *
 * Cambiar de plan NO se hace aqui: se paga en `/api/billing/checkout` y lo
 * activa el webhook tras confirmar el pago contra Mercado Pago. Un endpoint que
 * cambiara el plan sin pago seria una forma de subir de plan gratis.
 */
export async function GET() {
  const user = await requireCurrentUser();

  const [plans, current] = await Promise.all([
    ensureBetaPlans(),
    getEntitlements(user.workspace.id),
  ]);

  return NextResponse.json({
    data: {
      current: current
        ? { ...current.plan, status: current.status, active: current.active }
        : null,
      available: plans.map((plan) => ({
        ...planTerms(plan),
        features: plan.features,
        position: plan.position,
      })),
    },
  });
}
