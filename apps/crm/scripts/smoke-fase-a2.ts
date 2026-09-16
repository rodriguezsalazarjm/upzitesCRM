/**
 * Pruebas de aceptacion de la Fase A2 (Mercado Pago OAuth/marketplace).
 *
 * La Fase A (scripts/smoke-fase-a.ts) ya probo el camino MANUAL de punta a
 * punta (checkout -> webhook -> pedido -> entrega, aislamiento entre
 * workspaces). Esta fase NO repite eso. Cubre exclusivamente lo nuevo:
 *
 *   - ciclo de vida del access token OAuth (vigente, vencido, refresh
 *     exitoso, refresh fallido -> REAUTH_REQUIRED, refresh concurrente,
 *     persistencia cifrada);
 *   - el webhook de un workspace OAuth valida con el secreto DE LA
 *     APLICACION (plataforma), no uno por fila;
 *   - vinculo vendedor<->workspace: un pago cuyo collector_id no coincide
 *     con el mercadoPagoUserId conectado se rechaza;
 *   - las conexiones MANUAL siguen funcionando sin cambios tras el
 *     refactor de esta fase.
 *
 * Las rutas HTTP de connect/callback (que usan cookies()/next/headers) no
 * se invocan aqui: no hay precedente en este repo para eso fuera de un
 * request real de Next, y forzarlo seria fragil. Lo que SI se prueba a
 * fondo es toda la logica que esas rutas delegan (mercado-pago.ts,
 * mercado-pago-connection.ts, mercado-pago-oauth-state.ts), que es donde
 * vive el riesgo real de seguridad/aislamiento.
 *
 * Uso, desde apps/crm:
 *   pnpm exec tsx scripts/smoke-fase-a2.ts
 */
import './fixtures/test-environment';
import { randomBytes, createHmac } from 'node:crypto';
import {
  MercadoPagoConnectionMethod,
  MercadoPagoConnectionStatus,
} from '../generated/prisma/client';
import { prisma } from '../src/lib/prisma';
import { encryptSecret, decryptSecret } from '../src/lib/crypto';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { getValidWorkspaceMercadoPagoToken } from '../src/lib/commerce/mercado-pago-connection';
import { POST as billingWebhook } from '../src/app/api/billing/webhook/route';

const results: { name: string; ok: boolean }[] = [];
let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const stamp = Date.now();
const originalFetch = globalThis.fetch;

async function makeWorkspace(key: string) {
  const { workspace } = await createCustomerWorkspace({
    companyName: `faseA2-${key}-${stamp}`,
    ownerName: `Owner ${key}`,
    email: `faseA2-${key}-${stamp}@upzites.test`,
    password: 'FaseA2#Test1234',
  });
  return workspace.id;
}

async function connectOAuth(input: {
  workspaceId: string;
  accessToken: string;
  refreshToken: string;
  mercadoPagoUserId: string;
  expiresAt: Date;
}) {
  return prisma.mercadoPagoConnection.create({
    data: {
      workspaceId: input.workspaceId,
      connectionMethod: MercadoPagoConnectionMethod.OAUTH,
      mode: 'TEST',
      mercadoPagoUserId: input.mercadoPagoUserId,
      accessTokenEncrypted: encryptSecret(input.accessToken),
      refreshTokenEncrypted: encryptSecret(input.refreshToken),
      accessTokenExpiresAt: input.expiresAt,
      status: MercadoPagoConnectionStatus.CONNECTED,
      connectedAt: new Date(),
      lastVerifiedAt: new Date(),
    },
  });
}

function signWebhook(secret: string, dataId: string, requestId: string) {
  const ts = Date.now();
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const hash = createHmac('sha256', secret).update(manifest).digest('hex');
  return `ts=${ts},v1=${hash}`;
}

console.log('\n== Pruebas Fase A2 (Mercado Pago OAuth) ==\n');

process.env.MERCADO_PAGO_CLIENT_ID = 'client-fasea2';
process.env.MERCADO_PAGO_CLIENT_SECRET = 'secret-fasea2';
process.env.MERCADO_PAGO_ACCESS_TOKEN = 'platform-access-token-fasea2';
process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'platform-webhook-secret-fasea2';

const A = await makeWorkspace('a');
const B = await makeWorkspace('b');

// --- 1. Token vigente: no toca la red ---------------------------------------
{
  await connectOAuth({
    workspaceId: A,
    accessToken: 'access-a-vigente',
    refreshToken: 'refresh-a-vigente',
    mercadoPagoUserId: 'seller-a-100',
    expiresAt: new Date(Date.now() + 6 * 3600_000),
  });

  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error('no deberia llamar a la red con un token vigente');
  }) as typeof fetch;

  const resolved = await getValidWorkspaceMercadoPagoToken(A);
  globalThis.fetch = originalFetch;

  check('Token OAuth vigente se devuelve sin refrescar', resolved?.accessToken === 'access-a-vigente');
  check('Un token vigente no hace ninguna llamada de red', fetchCalled === false);
}

// --- 2. Token vencido: refresca y persiste cifrado --------------------------
{
  await prisma.mercadoPagoConnection.update({
    where: { workspaceId: A },
    data: { accessTokenExpiresAt: new Date(Date.now() - 60_000) },
  });

  let refreshCalls = 0;
  globalThis.fetch = (async (_input, init) => {
    refreshCalls += 1;
    const body = JSON.parse(String(init?.body));
    if (body.refresh_token !== 'refresh-a-vigente') throw new Error('refresh token inesperado');
    return new Response(
      JSON.stringify({
        access_token: 'access-a-renovado',
        refresh_token: 'refresh-a-renovado',
        expires_in: 21600,
        user_id: 100,
        live_mode: false,
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  const resolved = await getValidWorkspaceMercadoPagoToken(A);
  globalThis.fetch = originalFetch;

  check('Token vencido dispara exactamente un refresh', refreshCalls === 1);
  check('Devuelve el access token NUEVO, no el vencido', resolved?.accessToken === 'access-a-renovado');

  const row = await prisma.mercadoPagoConnection.findUniqueOrThrow({ where: { workspaceId: A } });
  check(
    'El access token nuevo queda cifrado en la fila (no en texto plano)',
    row.accessTokenEncrypted !== 'access-a-renovado' &&
      decryptSecret(row.accessTokenEncrypted!) === 'access-a-renovado',
  );
  check(
    'El refresh token nuevo tambien queda cifrado',
    decryptSecret(row.refreshTokenEncrypted!) === 'refresh-a-renovado',
  );
  check('lastRefreshAt queda registrado', row.lastRefreshAt !== null);
  check('El estado sigue CONNECTED tras un refresh exitoso', row.status === MercadoPagoConnectionStatus.CONNECTED);
}

// --- 3. Refresh concurrente: dos llamadas a la vez, un solo refresh real ---
{
  await prisma.mercadoPagoConnection.update({
    where: { workspaceId: A },
    data: { accessTokenExpiresAt: new Date(Date.now() - 60_000) },
  });

  let refreshCalls = 0;
  globalThis.fetch = (async () => {
    refreshCalls += 1;
    if (refreshCalls > 1) throw new Error('CONCURRENCIA ROTA: se refresco dos veces el mismo token vencido');
    // Simula latencia de red para que la segunda llamada realmente compita.
    await new Promise((resolve) => setTimeout(resolve, 50));
    return new Response(
      JSON.stringify({
        access_token: 'access-a-concurrente',
        refresh_token: 'refresh-a-concurrente',
        expires_in: 21600,
        user_id: 100,
        live_mode: false,
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  const [first, second] = await Promise.all([
    getValidWorkspaceMercadoPagoToken(A),
    getValidWorkspaceMercadoPagoToken(A),
  ]);
  globalThis.fetch = originalFetch;

  check('El lock de fila serializa: solo se llamo a refresh una vez', refreshCalls === 1);
  check(
    'Ambas llamadas concurrentes devuelven el mismo token nuevo',
    first?.accessToken === 'access-a-concurrente' && second?.accessToken === 'access-a-concurrente',
  );
}

// --- 4. Refresh que falla definitivamente: REAUTH_REQUIRED ------------------
{
  await prisma.mercadoPagoConnection.update({
    where: { workspaceId: A },
    data: { accessTokenExpiresAt: new Date(Date.now() - 60_000) },
  });

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ message: 'invalid_grant: token revoked' }), { status: 400 })) as typeof fetch;

  const resolved = await getValidWorkspaceMercadoPagoToken(A);
  globalThis.fetch = originalFetch;

  check('Un refresh que falla no devuelve ningun token', resolved === null);

  const row = await prisma.mercadoPagoConnection.findUniqueOrThrow({ where: { workspaceId: A } });
  check('La fila queda en REAUTH_REQUIRED', row.status === MercadoPagoConnectionStatus.REAUTH_REQUIRED);
  check('Se guarda un errorCode y un mensaje legible (sin secretos)', row.lastErrorCode === 'REFRESH_FAILED' && !!row.lastError);

  check(
    'Mientras este en REAUTH_REQUIRED, ya no se resuelve ningun token (ni intenta refrescar solo)',
    (await getValidWorkspaceMercadoPagoToken(A)) === null,
  );

  // Se reconecta (como si el vendedor hubiera vuelto a autorizar) para el resto de las pruebas.
  await prisma.mercadoPagoConnection.update({
    where: { workspaceId: A },
    data: {
      status: MercadoPagoConnectionStatus.CONNECTED,
      accessTokenEncrypted: encryptSecret('access-a-final'),
      refreshTokenEncrypted: encryptSecret('refresh-a-final'),
      accessTokenExpiresAt: new Date(Date.now() + 6 * 3600_000),
      lastErrorCode: null,
      lastError: null,
    },
  });
}

// --- 5. Webhook OAuth: secreto de la APLICACION, no uno por fila -----------
function fakeWebhookRequest(params: { workspaceId: string; dataId: string; xSignature: string; xRequestId: string }) {
  const url = `http://localhost:3001/api/billing/webhook?workspaceId=${params.workspaceId}&type=payment&data.id=${params.dataId}`;
  return new Request(url, {
    method: 'POST',
    // IP de prueba propio: evita compartir el cupo del limitador de 'webhook'
    // con otros scripts de smoke que corren en la misma ventana.
    headers: { 'x-signature': params.xSignature, 'x-request-id': params.xRequestId, 'x-forwarded-for': '203.0.113.11' },
  });
}

{
  const dataId = `fasea2-oauth-pay-${stamp}`;
  const requestId = `req-oauth-${stamp}`;
  const goodSignature = signWebhook('platform-webhook-secret-fasea2', dataId, requestId);
  const badSignature = signWebhook('un-secreto-cualquiera', dataId, requestId);

  const rejected = await billingWebhook(
    fakeWebhookRequest({ workspaceId: A, dataId, xSignature: badSignature, xRequestId: requestId }),
  );
  check('Una firma que no es la de la aplicacion se rechaza', rejected.status === 401);

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        status: 'approved',
        transaction_amount: 5990,
        currency_id: 'CLP',
        external_reference: 'orden-inexistente-fasea2',
        collector_id: 100, // coincide con mercadoPagoUserId de A
        metadata: { kind: 'order', orderId: 'orden-inexistente-fasea2', workspaceId: A },
      }),
      { status: 200 },
    )) as typeof fetch;

  const accepted = await billingWebhook(
    fakeWebhookRequest({ workspaceId: A, dataId, xSignature: goodSignature, xRequestId: requestId }),
  );
  globalThis.fetch = originalFetch;
  const acceptedBody = (await accepted.json()) as { message?: string };
  check(
    'La firma de la aplicacion SI se acepta (llega hasta buscar el pedido, que no existe)',
    accepted.status === 400 && acceptedBody.message === 'pedido no encontrado',
  );
}

// --- 6. Vinculo vendedor<->workspace: collector_id debe coincidir ----------
{
  const dataId = `fasea2-seller-mismatch-${stamp}`;
  const requestId = `req-seller-${stamp}`;
  const signature = signWebhook('platform-webhook-secret-fasea2', dataId, requestId);

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        status: 'approved',
        transaction_amount: 5990,
        currency_id: 'CLP',
        external_reference: 'orden-cualquiera',
        collector_id: 999999, // NO es el vendedor conectado por A (100)
        metadata: { kind: 'order', orderId: 'orden-cualquiera', workspaceId: A },
      }),
      { status: 200 },
    )) as typeof fetch;

  const response = await billingWebhook(
    fakeWebhookRequest({ workspaceId: A, dataId, xSignature: signature, xRequestId: requestId }),
  );
  globalThis.fetch = originalFetch;

  check('Un pago con collector_id de otro vendedor se rechaza (409)', response.status === 409);

  const row = await prisma.mercadoPagoConnection.findUniqueOrThrow({ where: { workspaceId: A } });
  check('El incidente queda registrado (errorCode SELLER_MISMATCH)', row.lastErrorCode === 'SELLER_MISMATCH');
}

// --- 7. MANUAL sigue funcionando tal cual, sin cambios ----------------------
{
  const tokenB = `TEST-manual-b-${randomBytes(4).toString('hex')}`;
  const secretB = `secret-manual-b-${randomBytes(4).toString('hex')}`;
  await prisma.mercadoPagoConnection.create({
    data: {
      workspaceId: B,
      connectionMethod: MercadoPagoConnectionMethod.MANUAL,
      mode: 'TEST',
      accessTokenEncrypted: encryptSecret(tokenB),
      webhookSecretEncrypted: encryptSecret(secretB),
      status: MercadoPagoConnectionStatus.CONNECTED,
      connectedAt: new Date(),
      lastVerifiedAt: new Date(),
    },
  });

  const resolved = await getValidWorkspaceMercadoPagoToken(B);
  check('Una conexion MANUAL sigue devolviendo su propio token sin tocar OAuth', resolved?.accessToken === tokenB);

  const dataId = `fasea2-manual-${stamp}`;
  const requestId = `req-manual-${stamp}`;
  const signature = signWebhook(secretB, dataId, requestId);

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        status: 'approved',
        transaction_amount: 1000,
        currency_id: 'CLP',
        external_reference: 'orden-manual',
        metadata: { kind: 'order', orderId: 'orden-manual', workspaceId: B },
      }),
      { status: 200 },
    )) as typeof fetch;

  const response = await billingWebhook(
    fakeWebhookRequest({ workspaceId: B, dataId, xSignature: signature, xRequestId: requestId }),
  );
  globalThis.fetch = originalFetch;
  const body = (await response.json()) as { message?: string };
  check(
    'El webhook MANUAL sigue validando con el secreto propio de la fila',
    response.status === 400 && body.message === 'pedido no encontrado',
  );
}

const deleted = await prisma.workspace.deleteMany({ where: { slug: { startsWith: 'fasea2-' } } });
console.log(`\nLimpieza: ${deleted.count} workspaces de prueba eliminados (cascade: jobs, eventos, etc.).`);

console.log(`\n== Resultado: ${results.length - failures}/${results.length} pruebas OK ==\n`);
if (failures > 0) process.exitCode = 1;
await prisma.$disconnect();
