import { NextResponse } from 'next/server';
import { BillingInterval, PaymentStatus, PlanCode } from '../../../../../generated/prisma/client';
import { classifyPayment, processOrderPayment, recordOrphanPayment } from '@/lib/commerce/payment-webhook';
import { enforce } from '@/lib/ops/rate-limit';
import { isKnownLegacySaasPreference, resolvePaymentPreferenceId } from '@/lib/billing/saas-payments';
import { prisma } from '@/lib/prisma';
import { MONTHLY_PLAN_KEY, ensureMonthlyPlan } from '@/lib/subscription';
import { ensurePlanCatalog } from '@/lib/billing/plan-catalog';
import { toMajorUnits } from '@/lib/billing/price-book';
import { providerAmountToMinor } from '@/lib/billing/money';
import { recordSaasPayment } from '@/lib/billing/subscription-admin';
import {
  getPaymentClient,
  getWorkspaceMerchantOrderClient,
  getWorkspacePaymentClient,
  verifyWebhookSignature,
  verifyWorkspaceWebhookSignature,
} from '@/lib/mercado-pago';
import {
  getValidWorkspaceMercadoPagoToken,
  getWorkspaceMercadoPagoWebhookSecret,
} from '@/lib/commerce/mercado-pago-connection';

/**
 * Webhook publico de Mercado Pago. Es la UNICA fuente de verdad para activar
 * un pago: valida la firma, re-consulta el pago server-to-server (nunca
 * confia en el body de la notificacion) y solo entonces actua.
 *
 * Atiende DOS cuentas de Mercado Pago distintas por el mismo endpoint:
 *  - `?workspaceId=...` en la URL -> venta de un producto propio del
 *    workspace (Fase A): se valida y recupera el pago con LA CUENTA DE ESE
 *    WORKSPACE. El workspaceId llega sin firmar en la URL (lo puso
 *    createOrderProviderCheckout), asi que no es de fiar por si solo: sirve solo
 *    para elegir que secreto usar, y la firma x-signature sobre ESE secreto
 *    es la que de verdad autentica la notificacion.
 *  - sin `workspaceId` -> suscripcion del CRM (cuenta de Upzites).
 *
 * FAIL-CLOSED (P0-FOUNDATION): un pago solo toca un libro si se identifica
 * explicitamente — `kind: 'order'` → Commerce; `kind: 'saas_subscription'` (o
 * preferencia SaaS legacy conocida) → Billing SaaS. Todo lo demas responde
 * 200 y se registra en el log, sin modificar WorkspaceSubscription, Payment
 * ni CustomerOrder. Asi es seguro aunque la misma cuenta legal de Mercado Pago
 * cobre el SaaS y venda en un workspace propio.
 *
 * Endpoint server-to-server (no CORS: no lo llama un navegador).
 */
export async function POST(request: Request) {
  // Fase 10: Limite alto: cortarle el webhook a Mercado Pago pierde pagos.
  const limited = await enforce('webhook', request);
  if (limited) return limited;

  const url = new URL(request.url);
  const dataId = url.searchParams.get('data.id') ?? url.searchParams.get('id');
  const type = url.searchParams.get('type');
  const workspaceIdParam = url.searchParams.get('workspaceId');

  if (workspaceIdParam) {
    return handleWorkspaceOrderWebhook({
      workspaceId: workspaceIdParam,
      dataId,
      type,
      xSignature: request.headers.get('x-signature'),
      xRequestId: request.headers.get('x-request-id'),
    });
  }

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
  const metadata = (payment.metadata ?? {}) as Record<string, unknown>;

  let paymentClass = classifyPayment(metadata);
  if (paymentClass === 'unknown') {
    // Sin marca: solo cuenta como SaaS si su preferencia es un checkout SaaS
    // legacy que este sistema creo para ese mismo workspace.
    let knownLegacySaasPreference = false;
    try {
      const preferenceId = await resolvePaymentPreferenceId(payment);
      const workspaceRef = payment.external_reference;
      knownLegacySaasPreference = Boolean(
        preferenceId && workspaceRef && (await isKnownLegacySaasPreference(preferenceId, workspaceRef)),
      );
    } catch (error) {
      console.error('billing_webhook_legacy_lookup_failed', {
        paymentId: dataId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      return NextResponse.json({ message: 'No se pudo verificar el origen del pago' }, { status: 503 });
    }
    paymentClass = classifyPayment(metadata, { knownLegacySaasPreference });
  }

  if (paymentClass === 'unknown') {
    console.warn('billing_webhook_unclassified_payment', {
      paymentId: dataId,
      kind: typeof metadata.kind === 'string' ? metadata.kind : null,
      status: payment.status ?? null,
    });
    return NextResponse.json({ ok: true, ignored: true, reason: 'unclassified_payment' });
  }

  // Bifurcacion critica (Fase 5): este webhook atiende DOS cosas distintas —
  // la suscripcion al CRM y la compra de un producto. Sin distinguirlas, el
  // primer infoproducto vendido regalaria una suscripcion mensual.
  //
  // Solo se trata como pedido lo que viene marcado explicitamente: las
  // preferencias creadas antes de la Fase 5 no llevan `kind` y son de
  // suscripcion, asi que un pago en vuelo no cambia de significado.
  //
  // Esta rama (sin workspaceId en la URL) solo se alcanza para preferencias
  // de pedido creadas ANTES de la Fase A, cuando todavia se cobraba con la
  // cuenta de Upzites. Las nuevas ya traen workspaceId y van por
  // handleWorkspaceOrderWebhook, con la cuenta propia del workspace.
  if (paymentClass === 'order') {
    const orderId = typeof metadata.orderId === 'string' ? metadata.orderId : payment.external_reference;

    if (!orderId) {
      console.error('order_webhook_missing_order_id', { paymentId: dataId });
      return NextResponse.json({ message: 'orderId ausente' }, { status: 400 });
    }

    const result = await processOrderPayment({
      orderId,
      externalPaymentId: String(dataId),
      status: mapPaymentStatus(payment.status),
      rawStatus: String(payment.status ?? 'unknown'),
      // El pedido guarda unidades menores; Mercado Pago informa mayores.
      amount: providerAmountToMinor(Number(payment.transaction_amount ?? 0), String(payment.currency_id ?? 'CLP')),
      currency: String(payment.currency_id ?? 'CLP'),
      payerEmail: payment.payer?.email ?? null,
      baseUrl: (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, ''),
    });

    if (!result.handled) {
      console.error('order_webhook_rejected', { paymentId: dataId, orderId, reason: result.reason });
      return NextResponse.json({ message: result.reason ?? 'no procesado' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, kind: 'order', ...result });
  }

  // --- A partir de aqui: pago de SUSCRIPCION, el flujo original ---
  if (payment.status !== 'approved') {
    return NextResponse.json({ ok: true, status: payment.status ?? 'unknown' });
  }

  const workspaceId = payment.external_reference;
  if (!workspaceId) {
    console.error('billing_webhook_missing_external_reference', { paymentId: dataId });
    return NextResponse.json({ message: 'external_reference ausente' }, { status: 400 });
  }

  // La preferencia SaaS declara su workspace en la metadata; si no coincide
  // con external_reference, no se activa nada.
  const declaredWorkspace = metadata.workspaceId ?? metadata.workspace_id;
  if (typeof declaredWorkspace === 'string' && declaredWorkspace !== workspaceId) {
    console.warn('billing_webhook_workspace_mismatch', { paymentId: dataId, workspaceId, declaredWorkspace });
    return NextResponse.json({ ok: true, ignored: true, reason: 'workspace_mismatch' });
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) {
    console.error('billing_webhook_unknown_workspace', { paymentId: dataId, workspaceId });
    return NextResponse.json({ message: 'Workspace no encontrado' }, { status: 404 });
  }

  // Mercado Pago devuelve la metadata en snake_case; se aceptan ambas formas.
  const meta = (camel: string, snake: string) => {
    const value = metadata[camel] ?? metadata[snake];
    return typeof value === 'string' && value ? value : null;
  };
  const priceId = meta('priceId', 'price_id');
  const declaredPlan = meta('planCode', 'plan_code');
  const reportedCurrency = typeof payment.currency_id === 'string' ? payment.currency_id.toUpperCase() : null;

  let plan: { id: string; code: PlanCode | null; key: string } | null = null;
  let price: { id: string; interval: BillingInterval; currency: string; amountMinor: number } | null = null;

  if (priceId) {
    // P0-B: el precio sale de la fila del Price Book que genero el checkout.
    // Nunca se clasifica ni se elige el plan por el monto. Se busca por id SIN
    // filtrar vigencia: si despues se publico otro precio, un checkout emitido
    // con la version anterior se valida contra ESA version (monto y moneda).
    const row = await prisma.planPrice.findUnique({ where: { id: priceId } });
    if (!row || (declaredPlan && declaredPlan !== row.planCode) || row.planCode === PlanCode.FREE) {
      console.error('billing_webhook_unknown_price', { paymentId: dataId, priceId, declaredPlan });
      return NextResponse.json({ message: 'Precio no encontrado' }, { status: 400 });
    }
    const plans = await ensurePlanCatalog();
    plan = plans[row.planCode];
    price = { id: row.id, interval: row.interval, currency: row.currency, amountMinor: row.amountMinor };
  } else {
    // Preferencias legacy en vuelo (planKey, CLP de la fila del plan).
    const planKey = meta('planKey', 'plan_key') ?? MONTHLY_PLAN_KEY;
    const legacy = planKey === MONTHLY_PLAN_KEY
      ? await ensureMonthlyPlan()
      : await prisma.subscriptionPlan.findUnique({ where: { key: planKey } });
    if (!legacy) {
      console.error('billing_webhook_unknown_plan', { paymentId: dataId, planKey });
      return NextResponse.json({ message: 'Plan no encontrado' }, { status: 400 });
    }
    plan = { id: legacy.id, code: legacy.code, key: legacy.key };
    price = null;
  }

  const currency = price?.currency ?? 'CLP';
  const expectedMinor = price?.amountMinor ?? (await prisma.subscriptionPlan.findUniqueOrThrow({ where: { id: plan.id } })).priceClp;

  // Moneda y monto deben coincidir con el precio acordado. No bloquea si MP no
  // los reporta (defensa adicional, no la unica).
  if (reportedCurrency && reportedCurrency !== currency) {
    console.error('billing_webhook_currency_mismatch', { paymentId: dataId, expected: currency, received: reportedCurrency });
    return NextResponse.json({ message: 'Moneda no coincide con el plan' }, { status: 400 });
  }
  if (typeof payment.transaction_amount === 'number' && payment.transaction_amount !== toMajorUnits(expectedMinor, currency)) {
    console.error('billing_webhook_amount_mismatch', {
      paymentId: dataId,
      expected: toMajorUnits(expectedMinor, currency),
      received: payment.transaction_amount,
    });
    return NextResponse.json({ message: 'Monto no coincide con el plan' }, { status: 400 });
  }

  // Solo WorkspaceSubscription + SubscriptionPayment (libro SaaS). Nunca
  // Payment ni CustomerOrder. Idempotente por el id de pago de Mercado Pago.
  const result = await recordSaasPayment({
    workspaceId,
    plan,
    price: price ? { id: price.id, interval: price.interval } : null,
    currency,
    amountMinor: expectedMinor,
    externalPaymentId: String(dataId),
  });

  return NextResponse.json({ ok: true, ...(result.alreadyProcessed ? { alreadyProcessed: true } : {}) });
}

function mapPaymentStatus(status: unknown): PaymentStatus {
  const statusMap: Record<string, PaymentStatus> = {
    approved: PaymentStatus.APPROVED,
    pending: PaymentStatus.PENDING,
    in_process: PaymentStatus.PENDING,
    authorized: PaymentStatus.PENDING,
    rejected: PaymentStatus.REJECTED,
    cancelled: PaymentStatus.CANCELLED,
    refunded: PaymentStatus.REFUNDED,
    charged_back: PaymentStatus.REFUNDED,
  };
  return statusMap[String(status)] ?? PaymentStatus.PENDING;
}

/**
 * Notificacion de venta de un producto propio de un workspace (Fase A):
 * se valida y recupera el pago con la cuenta de Mercado Pago DE ESE
 * workspace, nunca con la de Upzites ni con la de otro tenant.
 */
async function handleWorkspaceOrderWebhook(input: {
  workspaceId: string;
  dataId: string | null;
  type: string | null;
  xSignature: string | null;
  xRequestId: string | null;
}) {
  // El secreto se resuelve SIN tocar el access token ni intentar un refresh:
  // verificar una firma no deberia poder gastar el cupo de refresh OAuth de
  // un vendedor real solo porque alguien manda firmas invalidas.
  const secret = await getWorkspaceMercadoPagoWebhookSecret(input.workspaceId);
  if (!secret) {
    console.error('order_webhook_workspace_not_connected', { workspaceId: input.workspaceId });
    return NextResponse.json({ message: 'Workspace sin Mercado Pago conectado' }, { status: 404 });
  }

  const verification = verifyWorkspaceWebhookSignature({
    xSignature: input.xSignature,
    xRequestId: input.xRequestId,
    dataId: input.dataId,
    webhookSecret: secret.webhookSecret,
  });

  if (!verification.valid) {
    console.warn('order_webhook_invalid_signature', {
      workspaceId: input.workspaceId,
      reason: verification.reason,
      dataId: input.dataId,
    });
    await prisma.mercadoPagoConnection.update({
      where: { workspaceId: input.workspaceId },
      data: { lastErrorCode: 'INVALID_SIGNATURE', lastError: `Firma invalida: ${verification.reason}` },
    });
    return NextResponse.json({ message: 'Firma invalida' }, { status: 401 });
  }

  // Solo procesamos notificaciones de pago; otros tipos se reconocen con 200
  // para que Mercado Pago no reintente indefinidamente.
  if (input.type !== 'payment' || !input.dataId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Firma ya validada: ahora si vale la pena resolver (y de ser necesario,
  // refrescar) un access token utilizable para recuperar el pago real.
  const connection = await getValidWorkspaceMercadoPagoToken(input.workspaceId);
  if (!connection) {
    console.error('order_webhook_token_unavailable', { workspaceId: input.workspaceId });
    return NextResponse.json({ message: 'No se pudo obtener un token valido' }, { status: 409 });
  }

  const paymentClient = getWorkspacePaymentClient(connection);
  const payment = await paymentClient.get({ id: input.dataId });
  const metadata = (payment.metadata ?? {}) as Record<string, unknown>;

  // Commerce del workspace: solo pagos marcados como pedido. Cualquier otro
  // (incluido uno de suscripcion SaaS si la cuenta legal fuera la misma) se
  // ignora sin tocar Payment ni CustomerOrder.
  if (classifyPayment(metadata) !== 'order') {
    console.warn('order_webhook_unclassified_payment', {
      workspaceId: input.workspaceId,
      paymentId: input.dataId,
      kind: typeof metadata.kind === 'string' ? metadata.kind : null,
    });
    return NextResponse.json({ ok: true, ignored: true, reason: 'unclassified_payment' });
  }

  // Defensa en profundidad: el pago recuperado debe declararse a si mismo
  // como de este workspace. Si no coincide, algo raro paso (preferencia mal
  // formada, o un intento de usar la URL de un workspace para otro pago) y
  // no se procesa.
  if (metadata.workspaceId !== input.workspaceId) {
    console.error('order_webhook_workspace_mismatch', {
      urlWorkspaceId: input.workspaceId,
      paymentWorkspaceId: metadata.workspaceId,
      paymentId: input.dataId,
    });
    return NextResponse.json({ message: 'El pago no pertenece a este workspace' }, { status: 400 });
  }

  // Vinculo vendedor <-> workspace: el `collector_id` que Mercado Pago informa
  // como dueno del pago debe ser la MISMA cuenta que este workspace conecto.
  // Esto es lo que impide una asociacion cross-tenant incluso si alguien
  // manipulara el workspaceId de la URL (el resto de los controles ya lo
  // habrian rechazado, pero este ademas no depende de la URL en absoluto).
  if (
    connection.mercadoPagoUserId &&
    payment.collector_id !== undefined &&
    String(payment.collector_id) !== connection.mercadoPagoUserId
  ) {
    console.error('order_webhook_seller_mismatch', {
      workspaceId: input.workspaceId,
      expectedSeller: connection.mercadoPagoUserId,
      paymentSeller: payment.collector_id,
      paymentId: input.dataId,
    });
    await prisma.mercadoPagoConnection.update({
      where: { workspaceId: input.workspaceId },
      data: {
        lastErrorCode: 'SELLER_MISMATCH',
        lastError: 'Un pago llego con un vendedor de Mercado Pago distinto al conectado.',
      },
    });
    return NextResponse.json({ message: 'El vendedor del pago no coincide con la conexion' }, { status: 409 });
  }

  const metadataOrderId = typeof metadata.orderId === 'string' ? metadata.orderId : null;
  const externalReference = typeof payment.external_reference === 'string' ? payment.external_reference : null;
  // P31: desde aquí el cobro ya se verificó como de esta cuenta; si no se puede
  // asociar a un pedido, queda en la cola de incidencias del negocio.
  const orphan = (reason: string) => recordOrphanPayment({
    workspaceId: input.workspaceId,
    externalPaymentId: String(input.dataId),
    amount: providerAmountToMinor(Number(payment.transaction_amount ?? 0), String(payment.currency_id ?? 'CLP')),
    currency: String(payment.currency_id ?? 'CLP'),
    reason,
    referencedOrderId: metadataOrderId,
    externalReference,
    rawStatus: String(payment.status ?? 'unknown'),
  });
  if (!metadataOrderId || !externalReference) {
    console.error('order_webhook_missing_order_reference', {
      workspaceId: input.workspaceId,
      paymentId: input.dataId,
      metadataOrderId,
      externalReference,
    });
    await orphan('el pago no trae la referencia del pedido');
    return NextResponse.json({ message: 'Referencias del pedido ausentes' }, { status: 400 });
  }
  if (metadataOrderId && externalReference && metadataOrderId !== externalReference) {
    console.error('order_webhook_order_reference_mismatch', {
      workspaceId: input.workspaceId,
      paymentId: input.dataId,
      metadataOrderId,
      externalReference,
    });
    await orphan('las referencias del pago no coinciden entre sí');
    return NextResponse.json({ message: 'Las referencias del pago no coinciden' }, { status: 400 });
  }

  let preferenceId: string | null = null;
  const merchantOrderId = payment.order?.id;
  if (merchantOrderId !== undefined && merchantOrderId !== null) {
    try {
      const merchantOrder = await getWorkspaceMerchantOrderClient(connection).get({ merchantOrderId: String(merchantOrderId) });
      preferenceId = typeof merchantOrder.preference_id === 'string' && merchantOrder.preference_id
        ? merchantOrder.preference_id
        : null;
    } catch (error) {
      console.error('order_webhook_preference_lookup_failed', {
        workspaceId: input.workspaceId,
        paymentId: input.dataId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      return NextResponse.json({ message: 'No se pudo verificar la preferencia del pago' }, { status: 503 });
    }
  }

  const orderId = metadataOrderId ?? externalReference;
  if (!orderId) {
    console.error('order_webhook_missing_order_id', { paymentId: input.dataId });
    return NextResponse.json({ message: 'orderId ausente' }, { status: 400 });
  }

  const result = await processOrderPayment({
    orderId,
    externalPaymentId: String(input.dataId),
    status: mapPaymentStatus(payment.status),
    rawStatus: String(payment.status ?? 'unknown'),
    // El pedido guarda unidades menores; Mercado Pago informa mayores.
    amount: providerAmountToMinor(Number(payment.transaction_amount ?? 0), String(payment.currency_id ?? 'CLP')),
    currency: String(payment.currency_id ?? 'CLP'),
    payerEmail: payment.payer?.email ?? null,
    baseUrl: (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, ''),
    workspaceId: input.workspaceId,
    externalReference,
    preferenceId,
  });

  await prisma.mercadoPagoConnection.update({
    where: { workspaceId: input.workspaceId },
    data: {
      lastVerifiedAt: new Date(),
      lastErrorCode: result.handled ? null : 'ORDER_WEBHOOK_REJECTED',
      lastError: result.handled ? null : (result.reason ?? 'no procesado'),
    },
  });

  if (!result.handled) {
    console.error('order_webhook_rejected', {
      workspaceId: input.workspaceId,
      paymentId: input.dataId,
      orderId,
      reason: result.reason,
    });
    return NextResponse.json({ message: result.reason ?? 'no procesado' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, kind: 'order', ...result });
}
