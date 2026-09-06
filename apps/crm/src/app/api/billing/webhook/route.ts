import { NextResponse } from 'next/server';
import { SubscriptionStatus } from '../../../../../generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { nextMonthlyRenewal, MONTHLY_PLAN_KEY, ensureMonthlyPlan } from '@/lib/subscription';
import { getPaymentClient, verifyWebhookSignature } from '@/lib/mercado-pago';

/**
 * Webhook publico de Mercado Pago. Es la UNICA fuente de verdad para activar
 * una suscripcion: valida la firma, re-consulta el pago server-to-server
 * (nunca confia en el body de la notificacion) y solo entonces activa.
 *
 * Endpoint server-to-server (no CORS: no lo llama un navegador).
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const dataId = url.searchParams.get('data.id') ?? url.searchParams.get('id');
  const type = url.searchParams.get('type');

  const verification = verifyWebhookSignature({
    xSignature: request.headers.get('x-signature'),
    xRequestId: request.headers.get('x-request-id'),
    dataId,
  });

  if (!verification.valid) {
    console.warn('billing_webhook_invalid_signature', { reason: verification.reason, dataId, type });
    return NextResponse.json({ message: 'Firma invalida' }, { status: 401 });
  }

  // Solo procesamos notificaciones de pago; otros tipos (merchant_order, etc.)
  // se reconocen con 200 para que Mercado Pago no reintente indefinidamente.
  if (type !== 'payment' || !dataId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const paymentClient = getPaymentClient();
  if (!paymentClient) {
    console.error('billing_webhook_mp_not_configured');
    return NextResponse.json({ message: 'Mercado Pago no esta configurado' }, { status: 500 });
  }

  const payment = await paymentClient.get({ id: dataId });

  if (payment.status !== 'approved') {
    return NextResponse.json({ ok: true, status: payment.status ?? 'unknown' });
  }

  const workspaceId = payment.external_reference;
  if (!workspaceId) {
    console.error('billing_webhook_missing_external_reference', { paymentId: dataId });
    return NextResponse.json({ message: 'external_reference ausente' }, { status: 400 });
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) {
    console.error('billing_webhook_unknown_workspace', { paymentId: dataId, workspaceId });
    return NextResponse.json({ message: 'Workspace no encontrado' }, { status: 404 });
  }

  // Idempotencia: si este pago ya fue procesado (reintento de MP), no repetir.
  const alreadyProcessed = await prisma.workspaceSubscription.findUnique({
    where: { mpPaymentId: String(dataId) },
  });
  if (alreadyProcessed) {
    return NextResponse.json({ ok: true, alreadyProcessed: true });
  }

  const metadata = (payment.metadata ?? {}) as Record<string, unknown>;
  const planKey = typeof metadata.planKey === 'string' ? metadata.planKey : MONTHLY_PLAN_KEY;
  const plan = planKey === MONTHLY_PLAN_KEY
    ? await ensureMonthlyPlan()
    : await prisma.subscriptionPlan.findUnique({ where: { key: planKey } });

  if (!plan) {
    console.error('billing_webhook_unknown_plan', { paymentId: dataId, planKey });
    return NextResponse.json({ message: 'Plan no encontrado' }, { status: 400 });
  }

  // Validacion de monto/moneda cuando el pago los reporta (defensa adicional
  // contra manipulacion de la preferencia; no bloquea si MP no los reporta).
  if (
    typeof payment.transaction_amount === 'number' &&
    payment.transaction_amount !== plan.priceClp
  ) {
    console.error('billing_webhook_amount_mismatch', {
      paymentId: dataId,
      expected: plan.priceClp,
      received: payment.transaction_amount,
    });
    return NextResponse.json({ message: 'Monto no coincide con el plan' }, { status: 400 });
  }

  const renewsAt = nextMonthlyRenewal();
  const current = await prisma.workspaceSubscription.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
  });

  let subscription;
  try {
    subscription = current
      ? await prisma.workspaceSubscription.update({
          where: { id: current.id },
          data: {
            planId: plan.id,
            status: SubscriptionStatus.ACTIVE,
            trialEndsAt: null,
            renewsAt,
            mpPreferenceId: typeof metadata.preferenceId === 'string' ? metadata.preferenceId : current.mpPreferenceId,
            mpPaymentId: String(dataId),
          },
        })
      : await prisma.workspaceSubscription.create({
          data: {
            workspaceId,
            planId: plan.id,
            status: SubscriptionStatus.ACTIVE,
            renewsAt,
            mpPaymentId: String(dataId),
          },
        });
  } catch (error) {
    // Carrera con otra entrega del mismo webhook: el constraint unique en
    // mpPaymentId ya gano en la otra request. Tratamos como exito idempotente.
    const alreadyRace = await prisma.workspaceSubscription.findUnique({
      where: { mpPaymentId: String(dataId) },
    });
    if (alreadyRace) {
      return NextResponse.json({ ok: true, alreadyProcessed: true });
    }
    throw error;
  }

  await prisma.auditLog.create({
    data: {
      workspaceId,
      action: 'billing.payment_confirmed',
      entity: 'WorkspaceSubscription',
      entityId: subscription.id,
      metadata: { planKey: plan.key, paymentId: dataId, renewsAt: renewsAt.toISOString() },
    },
  });

  return NextResponse.json({ ok: true });
}
