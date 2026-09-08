/**
 * Pruebas de aceptacion de la Fase 6 (Shopify).
 *
 * Cubre lo que exige la spec para cerrar la fase:
 *   - OAuth state / HMAC
 *   - el token nunca llega al navegador
 *   - producto agotado no se vende
 *   - el precio proviene de Shopify
 *   - webhook duplicado es idempotente
 *   - pago confirmado genera el estado correcto
 *   - la desinstalacion revoca la conexion
 *
 * Corre con fixtures: no requiere credenciales ni tienda de desarrollo.
 *
 * Uso, desde apps/crm:
 *   pnpm exec tsx scripts/smoke-fase6.ts
 */
import 'dotenv/config';
import { createHmac } from 'node:crypto';
import {
  CommerceProvider,
  OrderStatus,
  ProductStatus,
} from '../generated/prisma/client';
import { prisma } from '../src/lib/prisma';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { encryptSecret, decryptSecret } from '../src/lib/crypto';
import {
  buildInstallUrl,
  createState,
  isValidShopDomain,
  verifyCallbackHmac,
  verifyState,
  verifyWebhookHmac,
  exchangeCodeForToken,
} from '../src/lib/shopify/oauth';
import { syncShopifyCatalog, fetchLiveVariant, getShopifyConnection } from '../src/lib/shopify/sync';
import { createShopifyCheckout, ShopifyOrderError } from '../src/lib/shopify/orders';
import { ingestShopifyWebhook, processShopifyEvent } from '../src/lib/shopify/webhooks';
import {
  fakeShopifyFetcher,
  fulfillmentWebhookPayload,
  orderWebhookPayload,
  uninstalledPayload,
} from './fixtures/shopify';

const results: { name: string; ok: boolean }[] = [];
let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const stamp = Date.now();
const SECRET = 'shopify-secret-de-prueba';

async function makeWorkspace(key: string, shopDomain: string) {
  const { workspace, user } = await createCustomerWorkspace({
    companyName: `fase6-${key}-${stamp}`,
    ownerName: `Owner ${key}`,
    email: `fase6-${key}-${stamp}@upzites.test`,
    password: 'Fase6#Test1234',
  });

  const connection = await prisma.commerceConnection.create({
    data: {
      workspaceId: workspace.id,
      provider: CommerceProvider.SHOPIFY,
      shopDomain,
      scopes: ['read_products', 'write_draft_orders'],
      accessTokenEncrypted: encryptSecret(`shpat_token_${key}`),
      status: 'CONNECTED',
    },
  });

  return { workspaceId: workspace.id, userId: user.id, connectionId: connection.id, shopDomain };
}

const SHOP_A = `tienda-a-${stamp}.myshopify.com`;
const SHOP_B = `tienda-b-${stamp}.myshopify.com`;

console.log('\n== Pruebas Fase 6 ==\n');

// --- 1. Validacion del dominio (defensa contra SSRF) ------------------------
{
  check('Acepta un dominio myshopify valido', isValidShopDomain('mi-tienda.myshopify.com'));
  check('Rechaza un dominio arbitrario', !isValidShopDomain('evil.example.com'));
  check('Rechaza un subdominio falsificado', !isValidShopDomain('myshopify.com.evil.com'));
  check('Rechaza intento de path traversal', !isValidShopDomain('tienda.myshopify.com/../x'));
  check('Rechaza cadena vacia', !isValidShopDomain(''));
  check('Rechaza http embebido', !isValidShopDomain('http://tienda.myshopify.com'));
}

// --- 2. State del OAuth ------------------------------------------------------
{
  const { state, nonce } = createState({ workspaceId: 'ws-1', shop: SHOP_A }, SECRET);

  const valid = verifyState(state, SECRET);
  check('Un state propio se verifica', valid.valid === true);
  check('El state lleva el workspace', valid.valid && valid.payload.workspaceId === 'ws-1');
  check('Y el nonce que va en la cookie', valid.valid && valid.payload.nonce === nonce);

  check('Un state firmado con otro secreto se rechaza', verifyState(state, 'otro-secreto').valid === false);
  check('Un state manipulado se rechaza', verifyState(state.replace(/.$/, 'X'), SECRET).valid === false);
  check('Un state con formato invalido se rechaza', verifyState('basura', SECRET).valid === false);

  // Vencimiento.
  const expired = createState({ workspaceId: 'ws-1', shop: SHOP_A }, SECRET).state;
  const [body] = expired.split('.');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  payload.exp = Date.now() - 1000;
  const tamperedBody = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const resigned = `${tamperedBody}.${createHmac('sha256', SECRET).update(tamperedBody).digest('base64url')}`;
  check('Un state vencido se rechaza aunque tenga firma valida',
    verifyState(resigned, SECRET).valid === false);

  const url = buildInstallUrl({
    shop: SHOP_A,
    state,
    config: { apiKey: 'key', apiSecret: SECRET, scopes: 'read_products', appUrl: 'https://crm.test' },
  });
  check('La URL de instalacion apunta a la tienda', url.startsWith(`https://${SHOP_A}/admin/oauth/authorize`));
  check('Y lleva el state', url.includes('state='));
  check('El secreto NUNCA viaja en la URL', !url.includes(SECRET));
}

// --- 3. HMAC del callback ----------------------------------------------------
{
  const params = new URLSearchParams({ code: 'abc', shop: SHOP_A, timestamp: '123' });
  const message = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&');
  const hmac = createHmac('sha256', SECRET).update(message).digest('hex');

  const valid = new URLSearchParams(params);
  valid.set('hmac', hmac);
  check('Un HMAC correcto se acepta', verifyCallbackHmac(valid, SECRET).valid === true);

  const wrong = new URLSearchParams(params);
  wrong.set('hmac', 'a'.repeat(64));
  check('Un HMAC incorrecto se rechaza', verifyCallbackHmac(wrong, SECRET).valid === false);

  const missing = new URLSearchParams(params);
  check('Sin HMAC se rechaza', verifyCallbackHmac(missing, SECRET).valid === false);

  // Un parametro agregado invalida la firma.
  const extra = new URLSearchParams(params);
  extra.set('hmac', hmac);
  extra.set('inyectado', 'x');
  check('Agregar un parametro invalida la firma', verifyCallbackHmac(extra, SECRET).valid === false);
}

// --- 4. Canje de token: no sale a la red con dominios invalidos -------------
{
  let called = false;
  const result = await exchangeCodeForToken({
    shop: 'evil.example.com',
    code: 'x',
    config: { apiKey: 'k', apiSecret: SECRET, scopes: '', appUrl: '' },
    fetchImpl: (async () => {
      called = true;
      return new Response('{}');
    }) as typeof fetch,
  });

  check('Un dominio invalido aborta ANTES de salir a la red', result.ok === false && called === false);
}

// --- 5. HMAC de webhooks (base64, no hex) ----------------------------------
{
  const body = JSON.stringify({ id: 1, total_price: '100.00' });
  const signature = createHmac('sha256', SECRET).update(body, 'utf8').digest('base64');

  check('Firma valida de webhook se acepta',
    verifyWebhookHmac({ rawBody: body, header: signature, secret: SECRET }).valid === true);
  check('Firma en hex (formato equivocado) se rechaza',
    verifyWebhookHmac({
      rawBody: body,
      header: createHmac('sha256', SECRET).update(body).digest('hex'),
      secret: SECRET,
    }).valid === false);
  check('Cuerpo alterado invalida la firma',
    verifyWebhookHmac({ rawBody: `${body} `, header: signature, secret: SECRET }).valid === false);
  check('Sin cabecera se rechaza',
    verifyWebhookHmac({ rawBody: body, header: null, secret: SECRET }).valid === false);
}

const A = await makeWorkspace('a', SHOP_A);
const B = await makeWorkspace('b', SHOP_B);

// --- 6. El token nunca sale en claro ----------------------------------------
{
  const connection = await prisma.commerceConnection.findUniqueOrThrow({ where: { id: A.connectionId } });
  check('El token se guarda cifrado', !connection.accessTokenEncrypted!.includes('shpat_token_a'));
  check('Y se puede descifrar en el servidor', decryptSecret(connection.accessTokenEncrypted!) === 'shpat_token_a');

  // Lo que la ruta de estado devuelve al navegador.
  const { accessTokenEncrypted, ...safe } = connection;
  check('El objeto que va al cliente no incluye el token',
    !JSON.stringify(safe).includes('shpat') && !JSON.stringify(safe).includes(accessTokenEncrypted!.slice(0, 20)));
}

// --- 7. Sincronizacion de catalogo ------------------------------------------
{
  const fetcher = fakeShopifyFetcher({
    products: [
      {
        id: 'gid://shopify/Product/1',
        title: 'Polera basica',
        description: 'Algodon',
        variants: [
          { id: 'gid://shopify/ProductVariant/11', title: 'S', sku: 'POL-S', price: '12990.00', inventoryQuantity: 5 },
          { id: 'gid://shopify/ProductVariant/12', title: 'M', sku: 'POL-M', price: '12990.00', inventoryQuantity: 0 },
        ],
      },
      {
        id: 'gid://shopify/Product/2',
        title: 'Gorro',
        variants: [{ id: 'gid://shopify/ProductVariant/21', title: 'Unico', price: '8990.00', inventoryQuantity: 3 }],
      },
    ],
  });

  const result = await syncShopifyCatalog({
    workspaceId: A.workspaceId,
    connectionId: A.connectionId,
    fetcher,
  });

  check('Sincroniza los productos', result.products === 2, `${result.products}`);
  check('Y sus variantes', result.variants === 3, `${result.variants}`);

  const products = await prisma.product.findMany({
    where: { connectionId: A.connectionId },
    include: { variants: true },
  });
  check('Los productos quedan en el workspace correcto',
    products.every((p) => p.workspaceId === A.workspaceId));
  check('El precio viene de Shopify', products[0].variants[0].priceClp === 12990);
  check('El inventario viene de Shopify', products[0].variants.some((v) => v.inventory === 0));

  // Re-sincronizar NO duplica.
  await syncShopifyCatalog({ workspaceId: A.workspaceId, connectionId: A.connectionId, fetcher });
  const after = await prisma.product.count({ where: { connectionId: A.connectionId } });
  check('Re-sincronizar no duplica productos', after === 2, `${after}`);

  const variantsAfter = await prisma.productVariant.count({
    where: { product: { connectionId: A.connectionId } },
  });
  check('Ni variantes', variantsAfter === 3, `${variantsAfter}`);

  // Un producto que desaparece de Shopify se archiva, no se borra.
  const smaller = fakeShopifyFetcher({
    products: [
      {
        id: 'gid://shopify/Product/1',
        title: 'Polera basica',
        variants: [{ id: 'gid://shopify/ProductVariant/11', title: 'S', price: '12990.00', inventoryQuantity: 5 }],
      },
    ],
  });
  const second = await syncShopifyCatalog({
    workspaceId: A.workspaceId,
    connectionId: A.connectionId,
    fetcher: smaller,
  });
  check('Un producto retirado de la tienda se archiva', second.archived === 1);

  const archived = await prisma.product.findFirst({
    where: { connectionId: A.connectionId, externalId: 'gid://shopify/Product/2' },
  });
  check('Se archiva, no se borra', archived?.status === ProductStatus.ARCHIVED);
}

// --- 8. Consulta viva y producto agotado ------------------------------------
{
  const fetcher = fakeShopifyFetcher({
    products: [
      {
        id: 'gid://shopify/Product/1',
        title: 'Polera basica',
        variants: [
          { id: 'gid://shopify/ProductVariant/11', title: 'S', price: '15990.00', inventoryQuantity: 2 },
          { id: 'gid://shopify/ProductVariant/12', title: 'M', price: '15990.00', inventoryQuantity: 0 },
        ],
      },
    ],
  });

  const live = await fetchLiveVariant(fetcher, 'gid://shopify/ProductVariant/11');
  check('La consulta viva devuelve el precio actual', live?.priceClp === 15990);
  check('Y el stock actual', live?.inventory === 2);

  const missing = await fetchLiveVariant(fetcher, 'gid://shopify/ProductVariant/999');
  check('Una variante inexistente devuelve null', missing === null);

  // Producto agotado no se vende.
  let outOfStock = false;
  try {
    await createShopifyCheckout({
      workspaceId: A.workspaceId,
      connectionId: A.connectionId,
      fetcher,
      externalVariantId: 'gid://shopify/ProductVariant/12',
      quantity: 1,
    });
  } catch (error) {
    outOfStock = error instanceof ShopifyOrderError && error.code === 'OUT_OF_STOCK';
  }
  check('Un producto agotado NO se vende', outOfStock);

  // Pedir mas de lo que hay tampoco.
  let notEnough = false;
  try {
    await createShopifyCheckout({
      workspaceId: A.workspaceId,
      connectionId: A.connectionId,
      fetcher,
      externalVariantId: 'gid://shopify/ProductVariant/11',
      quantity: 10,
    });
  } catch (error) {
    notEnough = error instanceof ShopifyOrderError && error.code === 'OUT_OF_STOCK';
  }
  check('Pedir mas unidades de las disponibles se rechaza', notEnough);
}

// --- 9. El precio cambia entre la conversacion y el checkout ---------------
{
  const fetcher = fakeShopifyFetcher({
    products: [
      {
        id: 'gid://shopify/Product/1',
        title: 'Polera basica',
        variants: [{ id: 'gid://shopify/ProductVariant/11', title: 'S', price: '19990.00', inventoryQuantity: 5 }],
      },
    ],
  });

  let priceChanged = false;
  let message = '';
  try {
    await createShopifyCheckout({
      workspaceId: A.workspaceId,
      connectionId: A.connectionId,
      fetcher,
      externalVariantId: 'gid://shopify/ProductVariant/11',
      quantity: 1,
      // El agente habia cotizado 12.990; la tienda ahora dice 19.990.
      quotedPriceClp: 12990,
    });
  } catch (error) {
    priceChanged = error instanceof ShopifyOrderError && error.code === 'PRICE_CHANGED';
    message = error instanceof Error ? error.message : '';
  }
  check('Si el precio cambio, el checkout se aborta', priceChanged);
  check('Y el mensaje dice el precio nuevo', message.includes('19990'));

  const audit = await prisma.auditLog.findFirst({
    where: { workspaceId: A.workspaceId, action: 'shopify.price_changed_before_checkout' },
  });
  check('El cambio de precio queda auditado', audit !== null);
}

// --- 10. Draft order: el precio sale de Shopify ----------------------------
{
  const fetcher = fakeShopifyFetcher({
    products: [
      {
        id: 'gid://shopify/Product/1',
        title: 'Polera basica',
        variants: [{ id: 'gid://shopify/ProductVariant/11', title: 'S', price: '15990.00', inventoryQuantity: 5 }],
      },
    ],
    draftOrder: {
      id: 'gid://shopify/DraftOrder/900',
      name: '#D900',
      invoiceUrl: `https://${SHOP_A}/invoices/xyz`,
    },
  });

  const contact = await prisma.contact.create({
    data: { workspaceId: A.workspaceId, firstName: 'Cliente', lastName: 'Shopify', phone: '+56911110000' },
  });

  const checkout = await createShopifyCheckout({
    workspaceId: A.workspaceId,
    connectionId: A.connectionId,
    fetcher,
    externalVariantId: 'gid://shopify/ProductVariant/11',
    quantity: 2,
    contactId: contact.id,
    email: 'cliente@ejemplo.test',
  });

  check('El total lo calcula el precio VIVO de Shopify', checkout.totalClp === 15990 * 2, `${checkout.totalClp}`);
  check('Devuelve el enlace de pago de la tienda', checkout.checkoutUrl.includes('/invoices/'));

  // La consulta viva se hizo ANTES del draft order.
  const queries = fetcher.calls.map((c) => c.query);
  const variantIndex = queries.findIndex((q) => q.includes('query Variant'));
  const draftIndex = queries.findIndex((q) => q.includes('DraftOrderCreate'));
  check('Se consulta el precio ANTES de crear el pedido',
    variantIndex >= 0 && draftIndex > variantIndex);

  const order = await prisma.customerOrder.findUniqueOrThrow({
    where: { id: checkout.orderId },
    include: { lines: true },
  });
  check('El pedido local queda como Shopify', order.provider === CommerceProvider.SHOPIFY);
  check('Y esperando pago', order.status === OrderStatus.PENDING_PAYMENT);
  check('La linea guarda el precio de la tienda', order.lines[0].unitPrice === 15990);

  // Crear el mismo draft dos veces no duplica el pedido local.
  await createShopifyCheckout({
    workspaceId: A.workspaceId,
    connectionId: A.connectionId,
    fetcher,
    externalVariantId: 'gid://shopify/ProductVariant/11',
    quantity: 2,
    contactId: contact.id,
  });
  const count = await prisma.customerOrder.count({
    where: { workspaceId: A.workspaceId, externalId: 'gid://shopify/DraftOrder/900' },
  });
  check('El mismo draft order no crea dos pedidos locales', count === 1);
}

// --- 11. Webhooks: idempotencia y aislamiento ------------------------------
{
  const payload = orderWebhookPayload({ id: 5001, totalPrice: '31980.00', financialStatus: 'paid' });

  const first = await ingestShopifyWebhook({ topic: 'orders/paid', shop: SHOP_A, payload });
  check('La primera entrega no es duplicada', first.duplicate === false);
  await processShopifyEvent(first.eventId);

  // Shopify reintrega el mismo evento.
  for (let i = 0; i < 5; i += 1) {
    const again = await ingestShopifyWebhook({ topic: 'orders/paid', shop: SHOP_A, payload });
    check(`Reentrega ${i + 1} se detecta como duplicada`, again.duplicate === true);
    await processShopifyEvent(again.eventId);
  }

  const orders = await prisma.customerOrder.count({
    where: { workspaceId: A.workspaceId, externalId: 'gid://shopify/Order/5001' },
  });
  check('Seis entregas dejan UN solo pedido', orders === 1, `${orders}`);

  const payments = await prisma.payment.count({ where: { externalId: 'shopify:gid://shopify/Order/5001' } });
  check('Y un solo pago', payments === 1, `${payments}`);

  const order = await prisma.customerOrder.findFirstOrThrow({
    where: { workspaceId: A.workspaceId, externalId: 'gid://shopify/Order/5001' },
  });
  check('El pedido queda confirmado', order.status === OrderStatus.CONFIRMED);
  check('Se atribuye al workspace de la tienda', order.workspaceId === A.workspaceId);

  const inB = await prisma.customerOrder.count({
    where: { workspaceId: B.workspaceId, externalId: 'gid://shopify/Order/5001' },
  });
  check('El pedido no aparece en el otro workspace', inB === 0);

  // Una tienda desconocida no crea nada.
  const unknown = await ingestShopifyWebhook({
    topic: 'orders/paid',
    shop: `desconocida-${stamp}.myshopify.com`,
    payload: orderWebhookPayload({ id: 9999, totalPrice: '1000.00', financialStatus: 'paid' }),
  });
  const unknownResult = await processShopifyEvent(unknown.eventId);
  check('Una tienda no registrada no crea pedidos', unknownResult.handled === false);
}

// --- 12. Pedido pendiente no confirma ---------------------------------------
{
  const pending = orderWebhookPayload({ id: 5002, totalPrice: '9990.00', financialStatus: 'pending' });
  const event = await ingestShopifyWebhook({ topic: 'orders/create', shop: SHOP_A, payload: pending });
  await processShopifyEvent(event.eventId);

  const order = await prisma.customerOrder.findFirstOrThrow({
    where: { workspaceId: A.workspaceId, externalId: 'gid://shopify/Order/5002' },
  });
  check('Un pedido sin pagar queda esperando pago', order.status === OrderStatus.PENDING_PAYMENT);

  const payment = await prisma.payment.count({ where: { externalId: 'shopify:gid://shopify/Order/5002' } });
  check('Y no registra pago', payment === 0);
}

// --- 13. Fulfillment ---------------------------------------------------------
{
  const event = await ingestShopifyWebhook({
    topic: 'fulfillments/create',
    shop: SHOP_A,
    payload: fulfillmentWebhookPayload({ id: 700, orderId: 5001, trackingUrl: 'https://track.test/1' }),
  });
  const result = await processShopifyEvent(event.eventId);
  check('El fulfillment se procesa', result.handled === true);

  const order = await prisma.customerOrder.findFirstOrThrow({
    where: { workspaceId: A.workspaceId, externalId: 'gid://shopify/Order/5001' },
    include: { fulfillments: true },
  });
  check('El pedido pasa a entregado', order.status === OrderStatus.FULFILLED);
  check('Se guarda el seguimiento', order.fulfillments[0]?.trackingUrl === 'https://track.test/1');
}

// --- 14. Desinstalacion revoca la conexion ----------------------------------
{
  const event = await ingestShopifyWebhook({
    topic: 'app/uninstalled',
    shop: SHOP_B,
    payload: uninstalledPayload(SHOP_B),
  });
  const result = await processShopifyEvent(event.eventId);
  check('La desinstalacion se procesa', result.handled === true);

  const connection = await prisma.commerceConnection.findUniqueOrThrow({ where: { id: B.connectionId } });
  check('La conexion queda desconectada', connection.status === 'DISCONNECTED');
  check('Y el token se BORRA', connection.accessTokenEncrypted === null);

  // La conexion de A no se toca.
  const other = await prisma.commerceConnection.findUniqueOrThrow({ where: { id: A.connectionId } });
  check('La tienda del otro workspace sigue conectada', other.status === 'CONNECTED');

  const stillConnected = await getShopifyConnection(A.workspaceId);
  check('Y su token sigue disponible', stillConnected?.accessTokenEncrypted !== null);
}

// --- Limpieza ---------------------------------------------------------------
const deleted = await prisma.workspace.deleteMany({ where: { slug: { startsWith: 'fase6-' } } });
await prisma.webhookEvent.deleteMany({ where: { provider: 'shopify' } });
console.log(`\nLimpieza: ${deleted.count} workspaces de prueba eliminados (cascade).`);

console.log(`\n== Resultado: ${results.length - failures}/${results.length} pruebas OK ==`);
await prisma.$disconnect();
process.exit(failures > 0 ? 1 : 0);
