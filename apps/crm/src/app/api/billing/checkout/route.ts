import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PlanCode, WorkspaceRole } from '../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { PLAN_CATALOG } from '@/lib/billing/plan-catalog';
import { getCurrentPrice, toMajorUnits } from '@/lib/billing/price-book';
import { getPreferenceClient, preferenceCheckoutUrl } from '@/lib/mercado-pago';
import { parseBody } from '@/lib/http';
import { recordAudit } from '@/lib/domain/audit';
import { SAAS_SUBSCRIPTION_KIND } from '@/lib/commerce/payment-class';

/** Mercado Pago Chile solo cobra en CLP. USD vive en el Price Book para MANUAL. */
const MERCADO_PAGO_CURRENCY = 'CLP';

const checkoutSchema = z.object({
  planCode: z.enum([PlanCode.START, PlanCode.PRO, PlanCode.SCALE]),
  currency: z.string().default(MERCADO_PAGO_CURRENCY),
});

function getBaseUrl() {
  return (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
}

/**
 * Crea una preferencia de pago (Checkout Pro) en Mercado Pago y devuelve la
 * URL de checkout. NUNCA activa la suscripcion aqui: la unica fuente de
 * verdad para "el pago se confirmo" es el webhook (/api/billing/webhook)
 * tras re-consultar el pago directamente contra la API de Mercado Pago.
 *
 * P0-B: el importe sale del Price Book (fila vigente del plan en CLP) y la
 * preferencia declara kind, workspaceId, planCode y priceId. El webhook valida
 * contra ESA fila; nunca deduce el plan por el monto.
 */
export async function POST(request: Request) {
  const user = await requireCurrentUser();

  if (user.role !== WorkspaceRole.OWNER && user.role !== WorkspaceRole.ADMIN) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin del workspace puede gestionar el pago.' },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, checkoutSchema);
  if (!parsed.ok) return parsed.response;
  const { planCode } = parsed.data;
  const currency = parsed.data.currency.toUpperCase();

  if (currency !== MERCADO_PAGO_CURRENCY) {
    return NextResponse.json(
      { message: 'Mercado Pago solo cobra en CLP. Para pagar en otra moneda, contacta a Upzites.' },
      { status: 400 },
    );
  }

  const price = await getCurrentPrice({ planCode, currency });
  if (!price || price.amountMinor <= 0) {
    return NextResponse.json({ message: 'Ese plan no tiene precio vigente.' }, { status: 409 });
  }

  const preferenceClient = getPreferenceClient();
  if (!preferenceClient) {
    return NextResponse.json(
      { message: 'Mercado Pago no está configurado todavía. Contacta a soporte.' },
      { status: 503 },
    );
  }

  const plan = PLAN_CATALOG[planCode];
  const baseUrl = getBaseUrl();
  const preference = await preferenceClient.create({
    body: {
      items: [
        {
          id: price.id,
          title: `Upzites Flow ${plan.name}`,
          quantity: 1,
          currency_id: currency,
          unit_price: toMajorUnits(price.amountMinor, currency),
        },
      ],
      external_reference: user.workspace.id,
      // `kind` explicito: el webhook solo trata como suscripcion SaaS lo que
      // viene marcado asi (fail-closed; ver classifyPayment).
      metadata: {
        kind: SAAS_SUBSCRIPTION_KIND,
        workspaceId: user.workspace.id,
        planCode,
        priceId: price.id,
      },
      back_urls: {
        success: `${baseUrl}/billing?status=success`,
        pending: `${baseUrl}/billing?status=pending`,
        failure: `${baseUrl}/billing?status=failure`,
      },
      auto_return: 'approved',
      notification_url: `${baseUrl}/api/billing/webhook`,
    },
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'billing.checkout_started',
    entity: 'WorkspaceSubscription',
    metadata: { planCode, priceId: price.id, currency, amountMinor: price.amountMinor, preferenceId: preference.id ?? null },
  });

  const checkoutUrl = preferenceCheckoutUrl(preference, process.env.MERCADO_PAGO_ACCESS_TOKEN);
  if (!checkoutUrl) {
    return NextResponse.json({ message: 'Mercado Pago no devolvió una URL de pago.' }, { status: 502 });
  }

  return NextResponse.json({ checkoutUrl });
}
