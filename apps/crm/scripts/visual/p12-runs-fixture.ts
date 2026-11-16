/**
 * QA visual del Punto 12 (solo crm_pruebas): crea en el workspace de owner-a un
 * flujo publicado y 3 ejecuciones con el motor real: una completa, una en
 * espera y una que falla (checkout sin producto). No envia mensajes.
 */
import { startFlowRun } from '../../src/lib/automations/engine';
import { prisma } from '../../src/lib/prisma';

const owner = await prisma.user.findFirstOrThrow({ where: { email: 'owner-a@visual.test' }, select: { memberships: { select: { workspaceId: true } } } });
const workspaceId = owner.memberships[0].workspaceId;
const contacts = await prisma.contact.findMany({ where: { workspaceId }, take: 3, select: { id: true } });
if (contacts.length === 0) throw new Error('El workspace de owner-a no tiene contactos.');

async function flow(name: string, nodes: object[]) {
  const edges = nodes.slice(1).map((node, i) => ({ id: `edge-${i}`, from: (nodes[i] as { id: string }).id, to: (node as { id: string }).id }));
  const created = await prisma.automationFlow.create({
    data: { workspaceId, name, status: 'PUBLISHED', channelScope: ['INSTAGRAM'], versions: { create: { version: 1, status: 'PUBLISHED', trigger: { type: 'COMMENT', keywords: ['GUIA'] }, nodes, edges } } },
    include: { versions: true },
  });
  return { flowId: created.id, flowVersionId: created.versions[0].id };
}

const ok = await flow('QA P12 · Comentario GUIA', [
  { id: 'tag', type: 'ACTION', action: 'ADD_TAG', params: { tag: 'guia' } },
  { id: 'wait', type: 'DELAY', minutes: 60, respectQuietHours: false },
  { id: 'end', type: 'END' },
]);
const bad = await flow('QA P12 · Checkout roto', [
  { id: 'tag', type: 'ACTION', action: 'ADD_TAG', params: { tag: 'qa' } },
  { id: 'checkout', type: 'ACTION', action: 'CREATE_CHECKOUT', params: { productId: '' } },
]);
for (const [i, target] of [ok, ok, bad].entries()) {
  const r = await startFlowRun({ workspaceId, ...target, channel: 'INSTAGRAM', contactId: contacts[i % contacts.length].id, conversationId: null, triggerDedupeKey: `qa-p12-${Date.now()}-${i}` });
  console.log(target.flowId, JSON.stringify(r));
}
console.log(`/automatizaciones/${ok.flowId}  /automatizaciones/${bad.flowId}`);
await prisma.$disconnect();
