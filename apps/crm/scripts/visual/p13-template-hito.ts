/**
 * Hito P13 (crm_pruebas, workspace de owner-a):
 *   comp  → plan START COMP para poder publicar mensajería.
 *   fire  → con la plantilla "Postventa" ya publicada desde el wizard, simula una
 *           compra aprobada y muestra el run; repetirla no crea un segundo run.
 */
import { prisma } from '../../src/lib/prisma';
import { assignCompSubscription } from '../../src/lib/billing/subscription-admin';
import { matchAndStartFlowsForPayment } from '../../src/lib/automations/triggers';

const user = await prisma.user.findFirstOrThrow({ where: { email: 'owner-a@visual.test' }, select: { memberships: { where: { workspace: { name: { startsWith: 'Visual Flow A' } } }, select: { workspaceId: true } } } }); // desde P14 owner-a también está en Visual Flow B
const workspaceId = user.memberships[0].workspaceId;

if (process.argv[2] === 'comp') {
  await assignCompSubscription({ workspaceId, planCode: 'START', via: 'cli', reason: 'QA P13 plantillas' });
  console.log('COMP START asignado');
} else {
  const flow = await prisma.automationFlow.findFirstOrThrow({ where: { workspaceId, name: 'Postventa', status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' } });
  const wa = await prisma.whatsAppChannel.findFirstOrThrow({ where: { workspaceId, status: 'CONNECTED' } });
  const conversation = await prisma.conversation.findFirstOrThrow({ where: { workspaceId, channelId: wa.id }, orderBy: { lastMessageAt: 'desc' } });
  await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } }); // que sea la última del contacto
  const paymentId = `qa-p13-${Date.now()}`;
  const first = await matchAndStartFlowsForPayment({ workspaceId, contactId: conversation.contactId, paymentId });
  const again = await matchAndStartFlowsForPayment({ workspaceId, contactId: conversation.contactId, paymentId });
  const run = await prisma.automationFlowRun.findFirst({ where: { flowId: flow.id }, orderBy: { startedAt: 'desc' } });
  const timeline = ((run?.state as { timeline?: { type: string; result: string }[] })?.timeline ?? []).map(s => `${s.type}:${s.result}`);
  console.log(JSON.stringify({ flow: flow.id, startedFirst: first.started, startedAgain: again.started, run: run?.status, timeline }));
  if (first.started < 1 || again.started !== 0) process.exit(1);
}
await prisma.$disconnect();
