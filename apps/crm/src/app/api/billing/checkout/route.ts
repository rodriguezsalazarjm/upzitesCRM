import { NextResponse } from 'next/server';
import { z } from 'zod';
import { UserRole } from '../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { MONTHLY_PLAN_KEY, ensureMonthlyPlan } from '@/lib/subscription';
import { getPreferenceClient } from '@/lib/mercado-pago';
import { parseBody } from '@/lib/http';

const checkoutSchema = z.object({
  planKey: z.string().min(1),
});

function getBaseUrl() {
  return (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
}

/**
 * Crea una preferencia de pago (Checkout Pro) en Mercado Pago y devuelve la
 * URL de checkout. NUNCA activa la suscripcion aqui: la unica fuente de
 * verdad para "el pago se confirmo" es el webhook (/api/billing/webhook)
 * tras re-consultar el pago directamente contra la API de Mercado Pago.
 */
export async function POST(request: Request) {
  const user = await requireCurrentUser();

  if (user.role !== UserRole.OWNER && user.role !== UserRole.ADMIN) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin del workspace puede gestionar el pago.' },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, checkoutSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;
  const plan = input.planKey === MONTHLY_PLAN_KEY
    ? await ensureMonthlyPlan()
    : await prisma.subscriptionPlan.findUniqueOrThrow({
        where: { key: input.planKey },
      });

  const preferenceClient = getPreferenceClient();
  if (!preferenceClient) {
    return NextResponse.json(
      { message: 'Mercado Pago no esta configurado todavia. Contacta a soporte.' },
      { status: 503 },
    );
  }

  const baseUrl = getBaseUrl();
  const preference = await preferenceClient.create({
    body: {
      items: [
        {
          id: plan.key,
          title: plan.name,
          quantity: 1,
          currency_id: 'CLP',
          unit_price: plan.priceClp,
        },
      ],
      external_reference: user.workspace.id,
      metadata: { planKey: plan.key, workspaceId: user.workspace.id },
      back_urls: {
        success: `${baseUrl}/billing?status=success`,
        pending: `${baseUrl}/billing?status=pending`,
        failure: `${baseUrl}/billing?status=failure`,
      },
      auto_return: 'approved',
      notification_url: `${baseUrl}/api/billing/webhook`,
    },
  });

  await prisma.auditLog.create({
    data: {
      workspaceId: user.workspace.id,
      actorId: user.id,
      action: 'billing.checkout_started',
      entity: 'WorkspaceSubscription',
      metadata: { planKey: plan.key, preferenceId: preference.id ?? null },
    },
  });

  const checkoutUrl = preference.sandbox_init_point ?? preference.init_point;
  if (!checkoutUrl) {
    return NextResponse.json({ message: 'Mercado Pago no devolvio una URL de pago.' }, { status: 502 });
  }

  return NextResponse.json({ checkoutUrl });
}
