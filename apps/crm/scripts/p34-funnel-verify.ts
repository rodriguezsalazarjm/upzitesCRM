/**
 * Verificador P34 (solo lectura): ¿la campaña real dejó al menos un lead trazable
 * que completó el funnel dentro de Flow? Toma el último lead que llegó con el
 * anuncio (referral CTWA) y revisa cada etapa. No escribe nada.
 *
 * Uso (desde apps/crm, con DATABASE_URL de la base a revisar):
 *   node node_modules/tsx/dist/cli.mjs scripts/p34-funnel-verify.ts --anuncio <id del anuncio en Ads Manager>
 * Sale con 1 si falta alguna etapa.
 */
import { prisma } from '../src/lib/prisma';

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const adId = arg('--anuncio');
if (!adId || !/^\d{5,32}$/.test(adId)) throw new Error('Falta --anuncio <id numérico del anuncio>.');

const conversations = await prisma.conversation.findMany({
  where: { attribution: { path: ['adId'], equals: adId } },
  orderBy: { createdAt: 'desc' },
  select: { id: true, workspaceId: true, contactId: true, campaignRouteId: true, createdAt: true, contact: { select: { firstTouch: true } } },
});
const checks: [string, boolean, string?][] = [];
const check = (label: string, pass: boolean, detail?: string) => checks.push([label, pass, detail]);
check('lead llegó desde el anuncio (referral CTWA)', conversations.length > 0, `${conversations.length} conversaciones`);

// El mejor candidato: el lead más reciente del anuncio que tenga un pedido pagado.
let chosen = conversations[0];
let order = null as Awaited<ReturnType<typeof findOrder>>;
async function findOrder(c: (typeof conversations)[number]) {
  return prisma.customerOrder.findFirst({
    where: { workspaceId: c.workspaceId, conversationId: c.id, status: { in: ['CONFIRMED', 'PROCESSING', 'FULFILLED'] } },
    orderBy: { createdAt: 'desc' },
    include: { payments: { select: { status: true, provider: true, metadata: true } }, deliveries: { select: { status: true } } },
  });
}
for (const c of conversations) { const o = await findOrder(c); if (o) { chosen = c; order = o; break; } }

if (chosen) {
  const ws = chosen.workspaceId;
  check('conversación en una regla de campaña', Boolean(chosen.campaignRouteId));
  check('first touch del contacto = el anuncio', (chosen.contact?.firstTouch as { adId?: string } | null)?.adId === adId);
  const ai = await prisma.message.count({ where: { workspaceId: ws, conversationId: chosen.id, direction: 'OUTBOUND', senderType: 'AI' } });
  check('la IA respondió', ai > 0, `${ai} mensajes`);
  check('pedido pagado desde la conversación', Boolean(order), order ? `${order.id} ${order.currency} ${order.total}` : undefined);
  if (order) {
    const real = order.payments.find((p) => p.status === 'APPROVED' && !(p.metadata as { simulated?: boolean } | null)?.simulated);
    check('pago real aprobado (no simulado)', Boolean(real), real?.provider);
    check('pedido atribuido al anuncio', (order.attribution as { adId?: string } | null)?.adId === adId && order.campaignRouteId === chosen.campaignRouteId);
    check('entrega enviada', order.deliveries.some((d) => d.status === 'SENT' || d.status === 'ACCESSED'), order.deliveries.map((d) => d.status).join(','));
  }
  const followUps = await prisma.automationFlowRun.count({ where: { workspaceId: ws, contactId: chosen.contactId, startedAt: { gte: chosen.createdAt } } })
    + await prisma.journeyEnrollment.count({ where: { workspaceId: ws, contactId: chosen.contactId, createdAt: { gte: chosen.createdAt } } });
  check('follow-up arrancó (postventa o recuperación)', followUps > 0, `${followUps}`);
}

for (const [label, pass, detail] of checks) console.log(`${pass ? '✓' : '✗'} ${label}${detail ? ` (${detail})` : ''}`);
const failed = checks.filter(([, pass]) => !pass).length;
console.log(failed ? `P34 NO cumplido: faltan ${failed} etapas` : `P34 CUMPLIDO: conversación ${chosen!.id}`);
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
