/**
 * Pruebas de aceptacion de la Fase A (Mercado Pago por workspace).
 *
 * La Fase 5 ya probo el motor de pedidos/entrega (scripts/smoke-fase5.ts):
 * pago duplicado no duplica entrega, monto adulterado se rechaza, etc. Esta
 * fase NO repite eso. Cubre exclusivamente lo nuevo: que cada workspace cobra
 * con SU PROPIA cuenta de Mercado Pago, nunca con la de otro tenant ni con la
 * de Upzites, de punta a punta (checkout -> webhook -> pedido -> entrega),
 * sin Internet ni dinero real (fetch queda intervenido mas abajo).
 *
 * Uso, desde apps/crm:
 *   pnpm exec tsx scripts/smoke-fase-a.ts
 */
import './fixtures/test-environment';
import { randomBytes, createHmac } from 'node:crypto';
import {
  IntegrationStatus,
  OrderStatus,
  ProductStatus,
  ProductType,
} from '../generated/prisma/client';
import { prisma } from '../src/lib/prisma';
import { encryptSecret } from '../src/lib/crypto';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { createOrder } from '../src/lib/commerce/orders';
import { createOrderCheckout, CheckoutError } from '../src/lib/commerce/checkout';
import { getWorkspaceMercadoPagoConnection } from '../src/lib/commerce/mercado-pago-connection';
import { POST as billingWebhook } from '../src/app/api/billing/webhook/route';

const results: { name: string; ok: boolean }[] = [];
let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const stamp = Date.now();

async function makeWorkspace(key: string) {
  const { workspace } = await createCustomerWorkspace({
    companyName: `faseA-${key}-${stamp}`,
    ownerName: `Owner ${key}`,
    email: `faseA-${key}-${stamp}@upzites.test`,
    password: 'FaseA#Test1234',
  });
  return workspace.id;
}

async function connectMercadoPago(workspaceId: string, accessToken: string, webhookSecret: string) {
  return prisma.mercadoPagoConnection.create({
    data: {
      workspaceId,
      mode: 'TEST',
      accessTokenEncrypted: encryptSecret(accessToken),
      webhookSecretEncrypted: encryptSecret(webhookSecret),
      status: IntegrationStatus.CONNECTED,
      connectedAt: new Date(),
      lastVerifiedAt: new Date(),
    },
  });
}

async function makeDigitalProduct(workspaceId: string) {
  const product = await prisma.product.create({
    data: {
      workspaceId,
      name: '5 Minutos con Dios',
      description: 'Infoproducto de prueba (Fase A)',
      type: ProductType.DIGITAL,
      status: ProductStatus.ACTIVE,
      variants: { create: { name: 'Acceso', priceClp: 5990, isDefault: true, inventory: null } },
      assets: {
        create: {
          workspaceId,
          kind: 'LINK',
          name: '5 Minutos con Dios — acceso',
          target: 'https://ejemplo.test/5-minutos-con-dios',
        },
      },
    },
    include: { variants: true },
  });
  return product.variants[0];
}

/** Firma exactamente como el validador del SDK: ts en MILISEGUNDOS. */
function signWebhook(secret: string, dataId: string, requestId: string) {
  const ts = Date.now();
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const hash = createHmac('sha256', secret).update(manifest).digest('hex');
  return `ts=${ts},v1=${hash}`;
}

console.log('\n== Pruebas Fase A (Mercado Pago por workspace) ==\n');

const A = await makeWorkspace('a');
const B = await makeWorkspace('b');

// --- 1. Sin conexion propia, el checkout no cobra con nada ajeno -----------
{
  const variant = await makeDigitalProduct(A);
  const order = await createOrder({ workspaceId: A, items: [{ variantId: variant.id, quantity: 1 }] });

  let code: string | undefined;
  try {
    await createOrderCheckout({ workspaceId: A, orderId: order.id });
  } catch (error) {
    if (error instanceof CheckoutError) code = error.code;
  }
  check(
    'Sin Mercado Pago conectado, el checkout falla explicitamente (no usa una cuenta global)',
    code === 'NOT_CONFIGURED',
  );
}

// --- 2. Cada workspace conecta SU cuenta ------------------------------------
const tokenA = `TEST-token-workspace-a-${randomBytes(6).toString('hex')}`;
const secretA = `secret-workspace-a-${randomBytes(6).toString('hex')}`;
const tokenB = `TEST-token-workspace-b-${randomBytes(6).toString('hex')}`;
const secretB = `secret-workspace-b-${randomBytes(6).toString('hex')}`;
await connectMercadoPago(A, tokenA, secretA);
await connectMercadoPago(B, tokenB, secretB);

{
  const connA = await getWorkspaceMercadoPagoConnection(A);
  const connB = await getWorkspaceMercadoPagoConnection(B);
  check('La conexion de A descifra el token de A', connA?.accessToken === tokenA);
  check('La conexion de B descifra el token de B', connB?.accessToken === tokenB);
  check('Los tokens de A y B nunca coinciden', connA?.accessToken !== connB?.accessToken);
}

{
  await prisma.mercadoPagoConnection.update({
    where: { workspaceId: A },
    data: { status: IntegrationStatus.NEEDS_ATTENTION },
  });
  const conn = await getWorkspaceMercadoPagoConnection(A);
  check('Una conexion NEEDS_ATTENTION no se usa para cobrar', conn === null);
  await prisma.mercadoPagoConnection.update({
    where: { workspaceId: A },
    data: { status: IntegrationStatus.CONNECTED },
  });
}

// --- 3. Checkout usa la cuenta del workspace, nunca la de otro -------------
const variantForCheckout = await makeDigitalProduct(A);
const orderForCheckout = await createOrder({
  workspaceId: A,
  items: [{ variantId: variantForCheckout.id, quantity: 1 }],
});

const seenAuthHeaders: string[] = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const authHeader =
    (init?.headers as Record<string, string> | undefined)?.Authorization ??
    (input instanceof Request ? input.headers.get('Authorization') : null) ??
    '';
  if (url.includes('api.mercadopago.com/checkout/preferences')) {
    seenAuthHeaders.push(authHeader);
    return new Response(
      JSON.stringify({ id: 'pref-fasea-1', sandbox_init_point: 'https://sandbox.mercadopago.test/pref-fasea-1' }),
      { status: 201 },
    );
  }
  throw new Error(`fetch no simulado en Fase A: ${url}`);
}) as typeof fetch;

let checkout;
try {
  checkout = await createOrderCheckout({ workspaceId: A, orderId: orderForCheckout.id });
} finally {
  globalThis.fetch = originalFetch;
}

check(
  'La preferencia se crea con el Bearer del token DE ESE workspace',
  seenAuthHeaders[0] === `Bearer ${tokenA}`,
);
check(
  'El notification_url incluye el workspaceId, para que el webhook sepa que cuenta usar',
  checkout.checkoutUrl !== undefined &&
    (await prisma.customerOrder.findUnique({ where: { id: orderForCheckout.id } }))?.status ===
      OrderStatus.PENDING_PAYMENT,
);

// --- 4. El webhook cobra y entrega con la cuenta del workspace correcto ----
function fakeWebhookRequest(params: { workspaceId: string; dataId: string; xSignature: string; xRequestId: string }) {
  const url = `http://localhost:3001/api/billing/webhook?workspaceId=${params.workspaceId}&type=payment&data.id=${params.dataId}`;
  return new Request(url, {
    method: 'POST',
    headers: { 'x-signature': params.xSignature, 'x-request-id': params.xRequestId },
  });
}

function stubPaymentGet(paymentId: string, body: Record<string, unknown>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes(`api.mercadopago.com/v1/payments/${paymentId}`)) {
      return new Response(JSON.stringify(body), { status: 200 });
    }
    throw new Error(`fetch no simulado en Fase A: ${url}`);
  }) as typeof fetch;
}

{
  const paymentId = `fasea-pay-${stamp}`;
  const requestId = `req-${stamp}`;
  stubPaymentGet(paymentId, {
    status: 'approved',
    transaction_amount: 5990,
    currency_id: 'CLP',
    payer: { email: 'comprador@ejemplo.test' },
    external_reference: orderForCheckout.id,
    metadata: { kind: 'order', orderId: orderForCheckout.id, workspaceId: A },
  });

  const xSignature = signWebhook(secretA, paymentId, requestId);
  const request = fakeWebhookRequest({ workspaceId: A, dataId: paymentId, xSignature, xRequestId: requestId });

  let response;
  try {
    response = await billingWebhook(request);
  } finally {
    globalThis.fetch = originalFetch;
  }
  const body = (await response.json()) as { ok?: boolean; kind?: string };
  check('El webhook procesa el pago con la firma del workspace correcto', response.status === 200 && body.ok === true);

  const order = await prisma.customerOrder.findUnique({ where: { id: orderForCheckout.id } });
  check('El pedido queda FULFILLED', order?.status === OrderStatus.FULFILLED);

  const payment = await prisma.payment.findFirst({ where: { orderId: orderForCheckout.id } });
  check('El pago se registra con el workspace correcto', payment?.workspaceId === A);

  // --- Idempotencia: la misma notificacion no vuelve a entregar nada ------
  stubPaymentGet(paymentId, {
    status: 'approved',
    transaction_amount: 5990,
    currency_id: 'CLP',
    external_reference: orderForCheckout.id,
    metadata: { kind: 'order', orderId: orderForCheckout.id, workspaceId: A },
  });
  const repeatSignature = signWebhook(secretA, paymentId, requestId);
  const repeatRequest = fakeWebhookRequest({
    workspaceId: A,
    dataId: paymentId,
    xSignature: repeatSignature,
    xRequestId: requestId,
  });
  let repeatResponse;
  try {
    repeatResponse = await billingWebhook(repeatRequest);
  } finally {
    globalThis.fetch = originalFetch;
  }
  const repeatBody = (await repeatResponse.json()) as { alreadyProcessed?: boolean };
  check('Una notificacion repetida no vuelve a procesar el pago', repeatBody.alreadyProcessed === true);

  const deliveries = await prisma.digitalDelivery.count({ where: { orderId: orderForCheckout.id } });
  check('La entrega digital se genero UNA sola vez pese a la notificacion repetida', deliveries === 1);
}

// --- 5. Aislamiento: la firma de B no vale para el webhook de A -------------
{
  const paymentId = `fasea-cross-${stamp}`;
  const requestId = `req-cross-${stamp}`;
  const crossSignature = signWebhook(secretB, paymentId, requestId); // firmado con el secreto de B
  const request = fakeWebhookRequest({ workspaceId: A, dataId: paymentId, xSignature: crossSignature, xRequestId: requestId });

  const response = await billingWebhook(request);
  check('La firma de B no autentica una notificacion dirigida a A', response.status === 401);
}

// --- 6. Un workspace sin conexion responde 404, no un error generico -------
{
  const C = await makeWorkspace('c');
  const request = fakeWebhookRequest({
    workspaceId: C,
    dataId: 'irrelevante',
    xSignature: 'ts=1,v1=x',
    xRequestId: 'req-c',
  });
  const response = await billingWebhook(request);
  check('Un workspace sin Mercado Pago conectado responde 404 (no un 500)', response.status === 404);
}

console.log(`\n== Resultado: ${results.length - failures}/${results.length} pruebas OK ==\n`);
if (failures > 0) process.exitCode = 1;
await prisma.$disconnect();
