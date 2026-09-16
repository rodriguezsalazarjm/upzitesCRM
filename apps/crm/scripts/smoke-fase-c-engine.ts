/**
 * Pruebas de aceptacion de la Fase C — motor de automatizaciones (Flow
 * Builder), sin canales de por medio: versionado, disparadores, nodos,
 * pausas, y las protecciones contra loops.
 *
 * Uso, desde apps/crm:
 *   pnpm exec tsx scripts/smoke-fase-c-engine.ts
 */
import './fixtures/test-environment';
import { AutomationFlowRunStatus, AutomationFlowStatus, JobStatus, JobType } from '../generated/prisma/client';
import { prisma } from '../src/lib/prisma';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { startFlowRun, advanceFlowRun } from '../src/lib/automations/engine';
import { matchAndStartFlowsForChannelEvent } from '../src/lib/automations/triggers';
import type { FlowGraph } from '../src/lib/automations/schema';

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
    companyName: `faseC-e-${key}-${stamp}`,
    ownerName: `Owner ${key}`,
    email: `faseC-e-${key}-${stamp}@upzites.test`,
    password: 'FaseC#Test1234',
  });
  return workspace.id;
}

async function makeContact(workspaceId: string, suffix: string) {
  return prisma.contact.create({
    data: { workspaceId, firstName: 'Contacto', lastName: suffix, email: `c-${suffix}-${stamp}@ejemplo.test` },
  });
}

async function publishFlow(workspaceId: string, name: string, graph: FlowGraph) {
  const flow = await prisma.automationFlow.create({
    data: { workspaceId, name, status: AutomationFlowStatus.PUBLISHED },
  });
  const version = await prisma.automationFlowVersion.create({
    data: {
      flowId: flow.id,
      version: 1,
      status: AutomationFlowStatus.PUBLISHED,
      trigger: graph.trigger as never,
      nodes: graph.nodes as never,
      edges: graph.edges as never,
      publishedAt: new Date(),
    },
  });
  return { flow, version };
}

console.log('\n== Pruebas Fase C — motor de automatizaciones ==\n');

const A = await makeWorkspace('a');

// --- 1. Versionado: DRAFT no corre, PUBLISHED si -----------------------------
{
  const flow = await prisma.automationFlow.create({ data: { workspaceId: A, name: 'Draft flow', status: AutomationFlowStatus.DRAFT } });
  const draftVersion = await prisma.automationFlowVersion.create({
    data: {
      flowId: flow.id,
      version: 1,
      status: AutomationFlowStatus.DRAFT,
      trigger: { type: 'MANUAL' },
      nodes: [{ id: 'end', type: 'END' }],
      edges: [],
    },
  });
  const contact = await makeContact(A, 'draft');
  const result = await startFlowRun({ workspaceId: A, flowId: flow.id, flowVersionId: draftVersion.id, contactId: contact.id });
  check('Una version DRAFT no arranca un run', result.started === false && result.reason === 'VERSION_NOT_PUBLISHED');
}

// --- 2. Ciclo completo: MESSAGE -> CONDITION -> ACTION -> DELAY -> END ------
{
  const contact = await makeContact(A, 'full');
  await prisma.contact.update({ where: { id: contact.id }, data: { tags: ['interesado'] } });

  const graph: FlowGraph = {
    trigger: { type: 'MANUAL' },
    nodes: [
      { id: 'msg', type: 'MESSAGE', text: 'Hola, gracias por escribir' },
      { id: 'cond', type: 'CONDITION', field: 'TAG', operator: 'EXISTS', value: 'interesado' },
      { id: 'tag-si', type: 'ACTION', action: 'ADD_TAG', params: { tag: 'calificado' } },
      { id: 'tag-no', type: 'ACTION', action: 'ADD_TAG', params: { tag: 'sin_calificar' } },
      { id: 'delay', type: 'DELAY', minutes: 60, respectQuietHours: false },
      { id: 'end', type: 'END' },
    ],
    edges: [
      { id: 'e1', from: 'msg', to: 'cond' },
      { id: 'e2', from: 'cond', to: 'tag-si', branch: 'true' },
      { id: 'e3', from: 'cond', to: 'tag-no', branch: 'false' },
      { id: 'e4', from: 'tag-si', to: 'delay' },
      { id: 'e5', from: 'tag-no', to: 'delay' },
      { id: 'e6', from: 'delay', to: 'end' },
    ],
  };
  const { version } = await publishFlow(A, 'Flujo completo', graph);
  const result = await startFlowRun({ workspaceId: A, flowId: version.flowId, flowVersionId: version.id, contactId: contact.id });
  check('El run arranca', result.started === true);

  const runId = result.started ? result.runId : '';
  const afterFirstPass = await prisma.automationFlowRun.findUniqueOrThrow({ where: { id: runId } });
  check('Se detiene en el DELAY con status WAITING', afterFirstPass.status === AutomationFlowRunStatus.WAITING);
  check('currentNodeId queda en el propio nodo DELAY', afterFirstPass.currentNodeId === 'delay');

  const taggedContact = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
  check('La condicion TRUE corrio: se agrego "calificado"', taggedContact.tags.includes('calificado'));
  check('La rama FALSE NO corrio', !taggedContact.tags.includes('sin_calificar'));

  // El nodo MESSAGE no manda nada si no hay conversationId (este run no tiene
  // conversacion asociada): se verifica que no revienta, no que envie.
  check('El nodo MESSAGE sin conversationId no falla el run', afterFirstPass.error === null);

  const job = await prisma.job.findFirst({ where: { type: JobType.RUN_FLOW_STEP, payload: { path: ['runId'], equals: runId } } });
  check('Se encolo un Job para retomar el DELAY', job !== null && job.status === JobStatus.PENDING);

  // Simula que el reloj llego: se retoma directamente (como haria el worker).
  await advanceFlowRun(runId);
  const finished = await prisma.automationFlowRun.findUniqueOrThrow({ where: { id: runId } });
  check('Tras retomar, el run queda COMPLETED', finished.status === AutomationFlowRunStatus.COMPLETED);

  const finishedVersion = await prisma.automationFlowVersion.findUniqueOrThrow({ where: { id: version.id } });
  check('runsStarted/runsCompleted quedan registrados', finishedVersion.runsStarted === 1 && finishedVersion.runsCompleted === 1);
}

// --- 3. Idempotencia de arranque: mismo triggerDedupeKey no duplica --------
{
  const contact = await makeContact(A, 'dedupe');
  const graph: FlowGraph = { trigger: { type: 'MANUAL' }, nodes: [{ id: 'end', type: 'END' }], edges: [] };
  const { version } = await publishFlow(A, 'Flujo dedupe', graph);

  const first = await startFlowRun({
    workspaceId: A,
    flowId: version.flowId,
    flowVersionId: version.id,
    contactId: contact.id,
    triggerDedupeKey: 'evento-unico-1',
  });
  const second = await startFlowRun({
    workspaceId: A,
    flowId: version.flowId,
    flowVersionId: version.id,
    contactId: contact.id,
    triggerDedupeKey: 'evento-unico-1',
  });
  check('El primer arranque con ese evento si corre', first.started === true);
  check('El segundo con el MISMO evento no duplica el run', second.started === false && second.reason === 'ALREADY_STARTED');

  const runs = await prisma.automationFlowRun.count({ where: { flowVersionId: version.id } });
  check('Solo existe UN run para ese disparador', runs === 1);
}

// --- 4. Proteccion contra loops: ciclo A<->B se corta por limite de pasos --
{
  const contact = await makeContact(A, 'loop');
  const graph: FlowGraph = {
    trigger: { type: 'MANUAL' },
    nodes: [
      { id: 'a', type: 'ACTION', action: 'ADD_TAG', params: { tag: 'loop' } },
      { id: 'b', type: 'ACTION', action: 'REMOVE_TAG', params: { tag: 'loop' } },
    ],
    edges: [
      { id: 'e1', from: 'a', to: 'b' },
      { id: 'e2', from: 'b', to: 'a' },
    ],
  };
  const { version } = await publishFlow(A, 'Flujo con loop', graph);
  const result = await startFlowRun({ workspaceId: A, flowId: version.flowId, flowVersionId: version.id, contactId: contact.id });
  const run = await prisma.automationFlowRun.findUniqueOrThrow({ where: { id: result.started ? result.runId : '' } });
  check('El loop se corta (no cuelga el proceso)', run.status === AutomationFlowRunStatus.FAILED);
  check('El motivo es el limite de pasos', run.error === 'MAX_STEPS_EXCEEDED');
  check('stepsExecuted llego al tope, ni uno mas', run.stepsExecuted === 200);
}

// --- 5. START_AUTOMATION: encadena otro flujo, con limite de profundidad ---
{
  const contact = await makeContact(A, 'depth');
  // Dos flujos que se llaman entre si (A -> B -> A -> ...): el limite de
  // profundidad tiene que cortarlo, no un loop infinito de runs.
  const flowA = await prisma.automationFlow.create({ data: { workspaceId: A, name: 'Depth A', status: AutomationFlowStatus.PUBLISHED } });
  const flowB = await prisma.automationFlow.create({ data: { workspaceId: A, name: 'Depth B', status: AutomationFlowStatus.PUBLISHED } });

  const versionA = await prisma.automationFlowVersion.create({
    data: {
      flowId: flowA.id,
      version: 1,
      status: AutomationFlowStatus.PUBLISHED,
      trigger: { type: 'MANUAL' },
      nodes: [{ id: 'start-b', type: 'START_AUTOMATION', flowKey: flowB.id }, { id: 'end', type: 'END' }],
      edges: [{ id: 'e1', from: 'start-b', to: 'end' }],
      publishedAt: new Date(),
    },
  });
  await prisma.automationFlowVersion.create({
    data: {
      flowId: flowB.id,
      version: 1,
      status: AutomationFlowStatus.PUBLISHED,
      trigger: { type: 'MANUAL' },
      nodes: [{ id: 'start-a', type: 'START_AUTOMATION', flowKey: flowA.id }, { id: 'end', type: 'END' }],
      edges: [{ id: 'e1', from: 'start-a', to: 'end' }],
      publishedAt: new Date(),
    },
  });

  await startFlowRun({ workspaceId: A, flowId: flowA.id, flowVersionId: versionA.id, contactId: contact.id, triggerDedupeKey: 'depth-test' });

  // Deja que los runs hijos (creados sincronicamente por START_AUTOMATION)
  // terminen de encadenarse; cada nivel es sincronico dentro de la misma
  // llamada async, asi que para cuando startFlowRun resuelve ya deberian
  // existir todos.
  const runs = await prisma.automationFlowRun.findMany({ where: { workspaceId: A, contactId: contact.id, flowId: { in: [flowA.id, flowB.id] } } });
  const maxDepth = Math.max(...runs.map((run) => run.depth));
  check('La cadena A->B->A->... se corta en el limite de profundidad', maxDepth <= 5);
  check('Se crearon varios runs encadenados (no solo uno)', runs.length > 1);
}

// --- 6. Trigger por palabra clave: no dispara si no coincide ---------------
{
  const graph: FlowGraph = {
    trigger: { type: 'MESSAGE_RECEIVED', keywords: ['guia'] },
    nodes: [{ id: 'tag', type: 'ACTION', action: 'ADD_TAG', params: { tag: 'lead_magnet' } }],
    edges: [],
  };
  const { version } = await publishFlow(A, 'Flujo por keyword', graph);
  const contact = await makeContact(A, 'keyword');

  const noMatch = await matchAndStartFlowsForChannelEvent({
    eventId: 'evt-no-match',
    workspaceId: A,
    channel: 'INSTAGRAM',
    type: 'DM_RECEIVED',
    text: 'hola, buenas tardes',
    contactId: contact.id,
    conversationId: null,
  });
  check('Sin la palabra clave, no arranca ningun run', noMatch.started === 0);

  const match = await matchAndStartFlowsForChannelEvent({
    eventId: 'evt-match',
    workspaceId: A,
    channel: 'INSTAGRAM',
    type: 'DM_RECEIVED',
    text: 'hola, me pasas la GUIA?',
    contactId: contact.id,
    conversationId: null,
  });
  check('Con la palabra clave (sin importar mayusculas), si arranca', match.started === 1);

  const taggedContact = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
  check('El run efectivamente etiqueto al contacto', taggedContact.tags.includes('lead_magnet'));

  const versionAfter = await prisma.automationFlowVersion.findUniqueOrThrow({ where: { id: version.id } });
  check('runsStarted quedo en 1 (no 2)', versionAfter.runsStarted === 1);
}

const deleted = await prisma.workspace.deleteMany({ where: { slug: { startsWith: 'fasec-e-' } } });
console.log(`\nLimpieza: ${deleted.count} workspaces de prueba eliminados (cascade: jobs, runs, etc.).`);

console.log(`\n== Resultado: ${results.length - failures}/${results.length} pruebas OK ==\n`);
if (failures > 0) process.exitCode = 1;
await prisma.$disconnect();
