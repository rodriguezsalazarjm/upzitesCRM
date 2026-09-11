import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { currentPeriod, usageSummary } from '@/lib/billing/usage';

export const dynamic = 'force-dynamic';

/**
 * Consumo y cupos del periodo.
 *
 * `?period=YYYY-MM` permite mirar un mes cerrado. Sin el, el mes en curso.
 */
export async function GET(request: Request) {
  const user = await requireCurrentUser();

  const requested = new URL(request.url).searchParams.get('period');
  const period = /^\d{4}-\d{2}$/.test(requested ?? '') ? requested! : currentPeriod();

  const summary = await usageSummary(user.workspace.id, period);

  if (!summary) {
    return NextResponse.json(
      { message: 'El workspace no tiene una suscripcion.', code: 'NO_SUBSCRIPTION' },
      { status: 409 },
    );
  }

  return NextResponse.json({ data: summary });
}
