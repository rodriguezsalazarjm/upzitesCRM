/**
 * P27 — verificar el round trip REAL de Mercado Pago TEST despues de que el
 * comprador de prueba pago desde el enlace publico (ver p27-mp-prepare.ts).
 *
 * Comprueba, sin mocks ni datos simulados:
 *  1. el pedido salio del enlace publico (no del checkout demo) con preferencia de MP;
 *  2. Mercado Pago (API real, credencial del vendedor de prueba) tiene el pago:
 *     approved, live_mode=false, cobrado por la cuenta conectada y atado a este pedido;
 *  3. el webhook firmado lo registro: Payment APPROVED sin `simulated`;
 *  4. el pedido quedo pagado (CONFIRMED/FULFILLED) y con orden de fulfillment;
 *  5. hay DigitalDelivery con sus items;
 *  6. auditoria `order.payment_confirmed` sin `simulated`.
 * Solo lectura. No imprime secretos.
 *
 * Uso: NODE_OPTIONS="--require ./scripts/visual/p27-preload.cjs" node node_modules/tsx/dist/cli.mjs scripts/visual/p27-mp-verify.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getValidWorkspaceMercadoPagoToken } from '../../src/lib/commerce/mercado-pago-connection';
import { prisma } from '../../src/lib/prisma';

const root = path.resolve(import.meta.dirname, '../..');
const run = JSON.parse(readFileSync(path.join(root, '.local-visual/p27-run.json'), 'utf8')) as { workspaceId: string; productId: string; startedAt: string };
const { workspaceId } = run;
const results: [boolean, string][] = [];
const check = (ok: boolean, label: string) => results.push([ok, label]);
const asObject = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

const order = await prisma.customerOrder.findFirst({
  where: { workspaceId, createdAt: { gte: new Date(run.startedAt) }, lines: { some: { variant: { productId: run.productId } } }, payments: { some: {} } },
  orderBy: { createdAt: 'desc' },
  include: { payments: true, fulfillments: true, deliveries: { include: { items: true } } },
});
if (!order) {
  console.log('Todavía no hay un pedido pagado del producto QA P27 desde la preparación. ¿Se completó el pago y llegó el webhook?');
  await prisma.$disconnect();
  process.exit(1);
}
const meta = asObject(order.metadata);
check(meta.fake !== true && typeof meta.preferenceId === 'string', '1. pedido del enlace público con preferencia real de Mercado Pago (no checkout demo)');

const payment = order.payments.find((p) => p.provider === 'MERCADO_PAGO' && p.status === 'APPROVED') ?? order.payments[0];
const connection = await getValidWorkspaceMercadoPagoToken(workspaceId);
let mpOk = false;
if (connection && payment) {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(payment.externalId)}`, { headers: { Authorization: `Bearer ${connection.accessToken}` } });
  const body = asObject(await response.json().catch(() => ({})));
  const stored = await prisma.mercadoPagoConnection.findUnique({ where: { workspaceId }, select: { mercadoPagoUserId: true, mode: true } });
  mpOk = response.ok && body.status === 'approved' && body.live_mode === false && String(body.collector_id) === stored?.mercadoPagoUserId && body.external_reference === order.id && stored?.mode === 'TEST';
  console.log(`    MP: http ${response.status} · status ${String(body.status)} · live_mode ${String(body.live_mode)} · collector coincide ${String(body.collector_id) === stored?.mercadoPagoUserId} · external_reference coincide ${body.external_reference === order.id}`);
}
check(mpOk, '2. Mercado Pago (API real) confirma el pago: approved, live_mode=false, cuenta conectada, este pedido');
check(Boolean(payment && payment.status === 'APPROVED' && asObject(payment.metadata).simulated !== true), '3. webhook firmado registró el Payment APPROVED (no simulado)');
check(order.status === 'CONFIRMED' || order.status === 'FULFILLED', `4a. pedido pagado (estado ${order.status})`);
check(order.fulfillments.length > 0, `4b. fulfillment creado (${order.fulfillments.length})`);
check(order.deliveries.length > 0 && order.deliveries.every((d) => d.items.length > 0), `5. DigitalDelivery con contenido (${order.deliveries.length} entrega(s), ${order.deliveries.reduce((n, d) => n + d.items.length, 0)} item(s), estado ${order.deliveries.map((d) => d.status).join(',') || '—'})`);
const audit = await prisma.auditLog.findFirst({ where: { workspaceId, action: 'order.payment_confirmed', entityId: order.id }, orderBy: { createdAt: 'desc' } });
check(Boolean(audit && asObject(audit.metadata).simulated !== true), '6. auditoría order.payment_confirmed sin simulación');

for (const [ok, label] of results) console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}`);
const passed = results.filter(([ok]) => ok).length;
console.log(`\nHito P27: ${passed}/${results.length}${passed === results.length ? ' — round trip real Mercado Pago TEST completo.' : ''}`);
await prisma.$disconnect();
process.exit(passed === results.length ? 0 : 1);
