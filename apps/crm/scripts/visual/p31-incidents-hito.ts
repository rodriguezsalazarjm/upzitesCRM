/**
 * Hito P31 (crm_pruebas): un pago mismatch aparece solo en la cola de
 * incidencias y un operador la cierra con una nota, sin tocar la base a mano.
 * Recorre por la ruta del webhook (processOrderPayment / recordOrphanPayment):
 *  - monto distinto  → AMOUNT_MISMATCH, pedido sin confirmar; el reintento no duplica
 *  - pago correcto    → pedido confirmado
 *  - segundo pago     → DUPLICATE_PAYMENT, sin reconfirmar; su reembolso NO revoca el pedido
 *  - pago sin pedido  → ORPHAN_PAYMENT en la cola del workspace que cobró
 *  - contracargo      → CHARGEBACK, accesos revocados
 * Deja abiertas las de "QA P31" en Visual Flow A para la QA en /pedidos/incidencias.
 *
 * Uso (desde apps/crm): NODE_OPTIONS="--require ./scripts/visual/preload.cjs" node node_modules/tsx/dist/cli.mjs scripts/visual/p31-incidents-hito.ts
 */
import assert from 'node:assert/strict';
import { createOrder } from '../../src/lib/commerce/orders';
import { processOrderPayment, recordOrphanPayment } from '../../src/lib/commerce/payment-webhook';
import { countOpenIncidents, resolvePaymentIncident } from '../../src/lib/commerce/payment-incidents';
import { assignCompSubscription } from '../../src/lib/billing/subscription-admin';
import { prisma } from '../../src/lib/prisma';

const workspace = await prisma.workspace.findFirstOrThrow({ where: { name: { startsWith: 'Visual Flow A' } }, select: { id: true } });
const ws = workspace.id;
const owner = await prisma.user.findFirstOrThrow({ where: { email: 'owner-a@visual.test' }, select: { id: true } });
const currency = (await prisma.workspaceProfile.findUnique({ where: { workspaceId: ws }, select: { currency: true } }))?.currency ?? 'CLP';
const existing = await prisma.productVariant.findFirst({ where: { isActive: true, product: { workspaceId: ws, name: 'QA P31 Producto' } }, select: { id: true } });
const variantId = existing?.id ?? (await prisma.product.create({
  data: { workspaceId: ws, name: 'QA P31 Producto', status: 'ACTIVE', currency, variants: { create: { name: 'Única', priceMinor: 12000, isDefault: true } } },
  include: { variants: true },
})).variants[0].id;

const { id: _subId, workspaceId: _subWs, ...savedSubscription } = await prisma.workspaceSubscription.findUniqueOrThrow({ where: { workspaceId: ws } });
await assignCompSubscription({ workspaceId: ws, planCode: 'PRO', via: 'cli', reason: 'QA P31 incidencias (temporal)' });
try {
  const stamp = Date.now().toString(36);
  const openBefore = await countOpenIncidents(ws);
  const contact = await prisma.contact.create({ data: { workspaceId: ws, firstName: 'QA P31', lastName: `Cliente ${stamp}`, source: 'WhatsApp' } });
  const order = await createOrder({ workspaceId: ws, contactId: contact.id, items: [{ variantId, quantity: 1 }] });
  await prisma.customerOrder.updateMany({ where: { id: order.id, workspaceId: ws }, data: { status: 'PENDING_PAYMENT' } });
  const pay = (externalPaymentId: string, over: Partial<Parameters<typeof processOrderPayment>[0]> = {}) => processOrderPayment({
    orderId: order.id, workspaceId: ws, externalPaymentId, status: 'APPROVED', rawStatus: 'approved',
    amount: order.total, currency: order.currency, baseUrl: 'http://localhost:3101', simulated: true, ...over,
  });
  const incidentsOf = (externalPaymentId: string) => prisma.paymentIncident.findMany({ where: { workspaceId: ws, externalPaymentId } });

  // 1) monto distinto: no confirma, encola con evidencia; el reintento de MP no duplica
  const wrong = `qa-p31-wrong-${stamp}`;
  assert.equal((await pay(wrong, { amount: order.total - 1000 })).handled, false);
  await pay(wrong, { amount: order.total - 1000 });
  const [mismatch, ...extra] = await incidentsOf(wrong);
  assert.equal(extra.length, 0, 'el reintento no duplica la incidencia');
  assert.equal(mismatch.kind, 'AMOUNT_MISMATCH');
  assert.equal(mismatch.orderId, order.id);
  assert.deepEqual([(mismatch.evidence as Record<string, unknown>).expectedAmount, (mismatch.evidence as Record<string, unknown>).receivedAmount], [order.total, order.total - 1000]);
  assert.equal((await prisma.customerOrder.findFirstOrThrow({ where: { id: order.id, workspaceId: ws } })).status, 'PENDING_PAYMENT', 'un mismatch no confirma');

  // 2) el operador la resuelve con nota (lo mismo que hace la API de la UI)
  const note = 'Devolví el cobro incorrecto en Mercado Pago; el cliente pagó de nuevo.';
  const resolved = await resolvePaymentIncident({ workspaceId: ws, id: mismatch.id, status: 'RESOLVED', note, actorId: owner.id });
  assert.ok(resolved);
  assert.equal(await resolvePaymentIncident({ workspaceId: ws, id: mismatch.id, status: 'DISMISSED', note, actorId: owner.id }), null, 'una cerrada no se vuelve a cerrar');
  const closed = await prisma.paymentIncident.findFirstOrThrow({ where: { id: mismatch.id, workspaceId: ws } });
  assert.deepEqual([closed.status, closed.resolutionNote, closed.resolvedById], ['RESOLVED', note, owner.id]);
  await pay(wrong, { amount: order.total - 1000 });
  assert.equal((await prisma.paymentIncident.findFirstOrThrow({ where: { id: mismatch.id, workspaceId: ws } })).status, 'RESOLVED', 'un reintento no reabre');
  assert.ok(await prisma.auditLog.findFirst({ where: { workspaceId: ws, action: 'payment_incident.resolved', entityId: mismatch.id } }));

  // 3) pago correcto → confirmado; 4) segundo pago aprobado → duplicado, sin reconfirmar
  const good = `qa-p31-good-${stamp}`;
  assert.equal((await pay(good)).handled, true);
  const dup = `qa-p31-dup-${stamp}`;
  const dupResult = await pay(dup);
  assert.equal(dupResult.handled, true, 'handled: Mercado Pago no reintenta');
  assert.match(dupResult.reason ?? '', /duplicado/);
  const [dupIncident] = await incidentsOf(dup);
  assert.equal(dupIncident.kind, 'DUPLICATE_PAYMENT');
  assert.equal((dupIncident.evidence as Record<string, unknown>).previousPaymentId, good);

  // 5) devolver el duplicado: incidencia REFUND, pero el pedido sigue pagado
  await pay(dup, { status: 'REFUNDED', rawStatus: 'refunded' });
  assert.ok((await incidentsOf(dup)).some((i) => i.kind === 'REFUND'));
  assert.equal((await prisma.customerOrder.findFirstOrThrow({ where: { id: order.id, workspaceId: ws } })).status, 'CONFIRMED', 'devolver el duplicado no deshace la compra');

  // 6) contracargo del pago bueno: revoca y encola
  await pay(good, { status: 'REFUNDED', rawStatus: 'charged_back' });
  assert.ok((await incidentsOf(good)).some((i) => i.kind === 'CHARGEBACK'));
  assert.equal((await prisma.customerOrder.findFirstOrThrow({ where: { id: order.id, workspaceId: ws } })).status, 'REFUNDED');

  // 7) pago sin pedido (pedido inexistente) y sin referencias (ruta del webhook)
  const ghost = `qa-p31-ghost-${stamp}`;
  assert.equal((await processOrderPayment({ orderId: `no-existe-${stamp}`, workspaceId: ws, externalPaymentId: ghost, status: 'APPROVED', rawStatus: 'approved', amount: 5000, currency, baseUrl: 'http://localhost:3101' })).handled, false);
  const noRef = `qa-p31-noref-${stamp}`;
  await recordOrphanPayment({ workspaceId: ws, externalPaymentId: noRef, amount: 7000, currency, reason: 'el pago no trae la referencia del pedido' });
  assert.equal((await incidentsOf(ghost))[0]?.kind, 'ORPHAN_PAYMENT');
  assert.equal((await incidentsOf(ghost))[0]?.orderId, null);
  assert.equal((await incidentsOf(noRef))[0]?.kind, 'ORPHAN_PAYMENT');
  // sin workspace conocido no se encola en ninguna cola
  await recordOrphanPayment({ externalPaymentId: `qa-p31-nows-${stamp}`, amount: 1, currency, reason: 'x' });
  assert.equal(await prisma.paymentIncident.count({ where: { workspaceId: ws, externalPaymentId: `qa-p31-nows-${stamp}` } }), 0);

  const openAfter = await countOpenIncidents(ws);
  assert.equal(openAfter - openBefore, 5, 'duplicado, reembolso, contracargo y 2 sin pedido quedan abiertas');
  console.log(JSON.stringify({ order: order.id, openBefore, openAfter, resolved: mismatch.id }, null, 2));
  console.log('HITO P31 LOCAL OK (pagos simulados por la ruta del webhook; Mercado Pago real es P27)');
} finally {
  await prisma.workspaceSubscription.update({ where: { workspaceId: ws }, data: savedSubscription });
}
await prisma.$disconnect();
