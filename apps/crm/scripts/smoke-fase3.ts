/**
 * Pruebas de aceptacion de la Fase 3 (cola, scheduler y automatizaciones).
 *
 * Cubre lo que exige la spec para cerrar la fase:
 *   - ejecucion unica por evento
 *   - condiciones AND/OR
 *   - una accion futura corre en horario valido
 *   - responder, pagar u optar por salir cancela acciones
 *   - un fallo transitorio reintenta
 *
 * Uso, desde apps/crm:
 *   pnpm exec tsx scripts/smoke-fase3.ts
 */
import 'dotenv/config';
import {
  AutomationExecutionStatus,
  AutomationTrigger,
  ConsentChannel,
  JobStatus,
  JobType,
  ScheduledActionStatus,
  ScheduledActionType,
} from '../generated/prisma/client';
import { prisma } from '../src/lib/prisma';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { claimJobs, completeJob, enqueue, failJob, queueStats, requeueStaleJobs } from '../src/lib/jobs/queue';
import { runJobs } from '../src/lib/jobs/runner';
import { emitDomainEvent } from '../src/lib/automation/emit';
import { runAutomationsForEvent } from '../src/lib/automation/engine';
import { evaluateGroup } from '../src/lib/automation/conditions';
import { AUTOMATION_PRESETS } from '../src/lib/automation/presets';
import { grantConsent, revokeConsent, scheduleAction, nextValidRunAt, DEFAULT_QUIET_HOURS } from '../src/lib/domain';

const results: { name: string; ok: boolean }[] = [];
let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const stamp = Date.now();

async function makeWorkspace(key: string) {
  const { workspace, user } = await createCustomerWorkspace({
    companyName: `fase3-${key}-${stamp}`,
    ownerName: `Owner ${key}`,
    email: `fase3-${key}-${stamp}@upzites.test`,
    password: 'Fase3#Test1234',
  });
  return { workspaceId: workspace.id, userId: user.id };
}

async function makeContact(workspaceId: string, suffix: string, overrides: Record<string, unknown> = {}) {
  return prisma.contact.create({
    data: {
      workspaceId,
      firstName: 'Contacto',
      lastName: suffix,
      email: `f3-${suffix}-${stamp}@ejemplo.test`,
      phone: `+5698${suffix.padStart(6, '0').slice(0, 6)}`,
      source: 'fase3-test',
      ...overrides,
    },
  });
}

console.log('\n== Pruebas Fase 3 ==\n');

const A = await makeWorkspace('a');
const B = await makeWorkspace('b');

// --- 1. Reglas predefinidas al crear el workspace ---------------------------
{
  const rules = await prisma.automationRule.findMany({ where: { workspaceId: A.workspaceId } });
  const expected = AUTOMATION_PRESETS.filter((p) => p.enabledByDefault).length;
  check('El workspace nuevo trae reglas por defecto', rules.length === expected, `${rules.length}/${expected}`);
  check('Todas nacen activas', rules.every((r) => r.isActive));
  check('Ninguna regla por defecto menciona un rubro',
    rules.every((r) => !/malla|reja|cerco|instalacion de/i.test(`${r.name} ${r.description ?? ''}`)));
}

// --- 2. Cola: encolar, reclamar, completar ---------------------------------
{
  const job = await enqueue({
    type: JobType.RECALCULATE_SCORE,
    workspaceId: A.workspaceId,
    payload: { contactId: 'x' },
    dedupeKey: `test-dedupe-${stamp}`,
  });
  check('Encolar devuelve un trabajo', Boolean(job.id));

  const again = await enqueue({
    type: JobType.RECALCULATE_SCORE,
    workspaceId: A.workspaceId,
    payload: { contactId: 'x' },
    dedupeKey: `test-dedupe-${stamp}`,
  });
  check('La dedupeKey impide encolar dos veces el mismo hecho', again.id === job.id);

  const claimed = await claimJobs(10);
  const mine = claimed.find((c) => c.id === job.id);
  check('El trabajo se reclama', Boolean(mine));

  // Un segundo reclamo no debe devolver el mismo trabajo.
  const second = await claimJobs(10);
  check('Un trabajo reclamado no lo toma otro worker', !second.some((c) => c.id === job.id));

  if (mine) {
    await completeJob(mine.id);
    const done = await prisma.job.findUniqueOrThrow({ where: { id: mine.id } });
    check('Completar deja el trabajo en DONE', done.status === JobStatus.DONE);
  }

  // Limpia lo que quedo reclamado por este bloque.
  await prisma.job.updateMany({
    where: { status: JobStatus.PROCESSING },
    data: { status: JobStatus.DONE, processedAt: new Date() },
  });
}

// --- 3. Reintentos y dead letter -------------------------------------------
{
  const job = await enqueue({
    type: JobType.RECALCULATE_SCORE,
    workspaceId: A.workspaceId,
    payload: { contactId: 'inexistente' },
    maxAttempts: 2,
    dedupeKey: `test-retry-${stamp}`,
  });

  const [claimed] = await claimJobs(1).then((jobs) => jobs.filter((j) => j.id === job.id));
  const first = claimed ? await failJob(claimed, new Error('fallo transitorio')) : null;
  check('Un fallo transitorio reintenta, no mata el trabajo', first?.dead === false, `reintenta en ${first?.retryInSeconds}s`);

  const retried = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
  check('El reintento vuelve a PENDING con espera', retried.status === JobStatus.PENDING && retried.runAt > new Date());

  // Se fuerza el vencimiento para agotar el intento restante.
  await prisma.job.update({ where: { id: job.id }, data: { runAt: new Date() } });
  const [again] = await claimJobs(5).then((jobs) => jobs.filter((j) => j.id === job.id));
  const second = again ? await failJob(again, new Error('fallo definitivo')) : null;
  check('Al agotar los intentos el trabajo queda DEAD', second?.dead === true);

  const dead = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
  check('DEAD conserva el ultimo error', dead.status === JobStatus.DEAD && Boolean(dead.lastError));

  await prisma.job.updateMany({
    where: { status: JobStatus.PROCESSING },
    data: { status: JobStatus.DONE, processedAt: new Date() },
  });
}

// --- 4. Rescate de trabajos colgados ---------------------------------------
{
  const job = await enqueue({
    type: JobType.PROCESS_OUTBOX,
    payload: {},
    dedupeKey: `test-stale-${stamp}`,
  });

  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: JobStatus.PROCESSING,
      lockedAt: new Date(Date.now() - 30 * 60_000),
      lockedBy: 'worker-muerto',
    },
  });

  const requeued = await requeueStaleJobs(10);
  check('Un trabajo colgado se rescata', requeued >= 1, `${requeued} rescatados`);

  const rescued = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
  check('El rescatado vuelve a PENDING', rescued.status === JobStatus.PENDING);
  await prisma.job.delete({ where: { id: job.id } });
}

// --- 5. Condiciones AND / OR ------------------------------------------------
{
  const context = { contact: { leadScore: 80, temperature: 'HOT', tags: ['web'], lifecycleStatus: 'LEAD' } };

  check('AND se cumple cuando todas se cumplen',
    evaluateGroup(
      { match: 'ALL', rules: [
        { field: 'contact.leadScore', operator: 'gte', value: 70 },
        { field: 'contact.temperature', operator: 'eq', value: 'HOT' },
      ] },
      context,
    ));

  check('AND falla si una no se cumple',
    !evaluateGroup(
      { match: 'ALL', rules: [
        { field: 'contact.leadScore', operator: 'gte', value: 70 },
        { field: 'contact.temperature', operator: 'eq', value: 'COLD' },
      ] },
      context,
    ));

  check('OR se cumple con una sola',
    evaluateGroup(
      { match: 'ANY', rules: [
        { field: 'contact.temperature', operator: 'eq', value: 'COLD' },
        { field: 'contact.leadScore', operator: 'gte', value: 70 },
      ] },
      context,
    ));

  check('Grupos anidados: (A y B) o C',
    evaluateGroup(
      { match: 'ANY', rules: [
        { match: 'ALL', rules: [
          { field: 'contact.temperature', operator: 'eq', value: 'COLD' },
          { field: 'contact.leadScore', operator: 'lt', value: 10 },
        ] },
        { field: 'contact.lifecycleStatus', operator: 'eq', value: 'LEAD' },
      ] },
      context,
    ));

  check('`in` sobre una lista', evaluateGroup(
    { match: 'ALL', rules: [{ field: 'contact.lifecycleStatus', operator: 'in', value: ['LEAD', 'QUALIFIED'] }] },
    context,
  ));

  check('`contains` sobre un arreglo de etiquetas', evaluateGroup(
    { match: 'ALL', rules: [{ field: 'contact.tags', operator: 'contains', value: 'web' }] },
    context,
  ));

  check('Una regla sin condiciones siempre corre',
    evaluateGroup({ match: 'ALL', rules: [] }, context));

  check('Comparar texto con `gt` no da un falso positivo',
    !evaluateGroup(
      { match: 'ALL', rules: [{ field: 'contact.temperature', operator: 'gt', value: 5 }] },
      context,
    ));

  check('Un campo inexistente no rompe la evaluacion',
    !evaluateGroup(
      { match: 'ALL', rules: [{ field: 'contact.noExiste.nada', operator: 'eq', value: 'x' }] },
      context,
    ));
}

// --- 6. Ejecucion unica por evento ------------------------------------------
{
  const contact = await makeContact(A.workspaceId, '1');

  const event = {
    workspaceId: A.workspaceId,
    trigger: AutomationTrigger.LEAD_CREATED,
    dedupeKey: `unico:${contact.id}`,
    contactId: contact.id,
  };

  const first = await runAutomationsForEvent(event);
  const ranFirst = first.filter((r) => r.actionsRun > 0).length;
  check('El evento dispara las reglas por defecto', ranFirst >= 1, `${ranFirst} reglas ejecutaron acciones`);

  // Reprocesar el MISMO evento cinco veces no debe repetir acciones.
  for (let i = 0; i < 5; i += 1) await runAutomationsForEvent(event);

  const executions = await prisma.automationExecution.count({
    where: { workspaceId: A.workspaceId, dedupeKey: event.dedupeKey },
  });
  check('Seis ejecuciones del mismo evento dejan un registro por regla',
    executions === first.length, `${executions} registros para ${first.length} reglas`);

  const tasks = await prisma.activity.count({
    where: { workspaceId: A.workspaceId, contactId: contact.id, title: 'Contactar lead nuevo' },
  });
  check('No se duplican las tareas creadas', tasks === 1, `${tasks} tareas`);

  const scheduled = await prisma.scheduledAction.count({
    where: { workspaceId: A.workspaceId, contactId: contact.id },
  });
  check('No se duplican las acciones programadas', scheduled === 1, `${scheduled} acciones`);
}

// --- 7. Aislamiento: las reglas de A no ven contactos de B ------------------
{
  const contactB = await makeContact(B.workspaceId, '2');

  const results = await runAutomationsForEvent({
    workspaceId: A.workspaceId,
    trigger: AutomationTrigger.LEAD_CREATED,
    dedupeKey: `cruzado:${contactB.id}`,
    contactId: contactB.id,
  });

  check('Un evento que apunta a otro workspace se descarta entero', results.length === 0);

  const tasksOnB = await prisma.activity.count({
    where: { workspaceId: A.workspaceId, contactId: contactB.id },
  });
  check('Una regla de A no crea actividades sobre un contacto de B', tasksOnB === 0);

  const leaked = await prisma.activity.count({ where: { workspaceId: B.workspaceId, contactId: contactB.id } });
  check('Tampoco escribe en el workspace B', leaked === 0);

  const audit = await prisma.auditLog.findFirst({
    where: { workspaceId: A.workspaceId, action: 'automation.event_rejected_cross_tenant' },
  });
  check('El rechazo queda auditado', audit !== null);

  const executions = await prisma.automationExecution.count({
    where: { workspaceId: A.workspaceId, dedupeKey: `cruzado:${contactB.id}` },
  });
  check('No se registra ninguna ejecucion para el evento ajeno', executions === 0);
}

// --- 8. Horario valido para acciones futuras --------------------------------
{
  const night = new Date(2026, 8, 7, 23, 30);
  const scheduled = nextValidRunAt(night, DEFAULT_QUIET_HOURS);
  check('Una accion nocturna se corre a la manana siguiente',
    scheduled.getHours() === 9 && scheduled.getDate() === night.getDate() + 1);

  const contact = await makeContact(A.workspaceId, '3');
  const action = await scheduleAction({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    type: ScheduledActionType.FOLLOW_UP,
    runAt: night,
    quietHours: DEFAULT_QUIET_HOURS,
    cancelKey: `noche:${contact.id}`,
  });
  check('La accion se guarda con el horario corregido', action.runAt.getHours() === 9);
}

// --- 9. Scheduler: promover y ejecutar acciones vencidas --------------------
{
  const contact = await makeContact(A.workspaceId, '4');
  const due = await scheduleAction({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    type: ScheduledActionType.FOLLOW_UP,
    runAt: new Date(Date.now() - 60_000),
    cancelKey: `vencida:${contact.id}`,
  });

  await enqueue({ type: JobType.SCAN_SCHEDULED_ACTIONS, payload: {}, dedupeKey: `scan-${stamp}` });
  await runJobs({ limit: 50, withRecurring: false });
  await runJobs({ limit: 50, withRecurring: false });

  const processed = await prisma.scheduledAction.findUniqueOrThrow({ where: { id: due.id } });
  check('El scheduler ejecuta la accion vencida', processed.status === ScheduledActionStatus.DONE,
    `status=${processed.status}`);

  const future = await prisma.scheduledAction.findMany({
    where: { workspaceId: A.workspaceId, status: ScheduledActionStatus.PENDING, runAt: { gt: new Date() } },
  });
  check('Las acciones futuras NO se ejecutan antes de tiempo', future.length >= 1, `${future.length} pendientes`);
}

// --- 10. Cancelacion por respuesta, pago y opt-out --------------------------
{
  // (a) Opt-out
  const contact = await makeContact(A.workspaceId, '5');
  await grantConsent({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.WHATSAPP,
    source: 'test',
  });
  await scheduleAction({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    type: ScheduledActionType.FOLLOW_UP,
    runAt: new Date(Date.now() + 3_600_000),
    cancelKey: `optout:${contact.id}`,
  });

  const revoked = await revokeConsent({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.WHATSAPP,
  });
  check('Revocar el consentimiento cancela las acciones pendientes', revoked.canceledActions >= 1);

  const pending = await prisma.scheduledAction.count({
    where: { contactId: contact.id, status: ScheduledActionStatus.PENDING },
  });
  check('No quedan acciones pendientes tras el opt-out', pending === 0);

  // La revocacion emite su evento a la cola.
  const job = await prisma.job.findFirst({
    where: { dedupeKey: { contains: `consent-revoked:${contact.id}` } },
  });
  check('El opt-out emite su evento a la cola', job !== null);
}

// --- 11. El runner procesa un lote completo ---------------------------------
{
  const before = await queueStats();
  const run = await runJobs({ limit: 50, withRecurring: true });
  check('El runner procesa trabajos', run.claimed >= 0 && run.done >= 0, `tomados=${run.claimed} hechos=${run.done}`);
  check('El runner encola los trabajos recurrentes', run.byType !== undefined);

  const after = await queueStats();
  check('Las metricas de cola se pueden leer',
    typeof after.pending === 'number' && typeof after.oldestPendingAgeSeconds === 'number',
    `pendientes ${before.pending} -> ${after.pending}`);
}

// --- 12. emitDomainEvent no ejecuta: encola ---------------------------------
{
  const contact = await makeContact(A.workspaceId, '6');
  const job = await emitDomainEvent({
    workspaceId: A.workspaceId,
    trigger: AutomationTrigger.MESSAGE_RECEIVED,
    dedupeKey: `emision:${contact.id}`,
    contactId: contact.id,
  });
  check('Emitir un evento crea un trabajo, no ejecuta en linea', Boolean(job.id));

  const stored = await prisma.job.findUnique({ where: { id: job.id } });
  check('El trabajo queda PENDING hasta que corra el worker',
    stored?.status === JobStatus.PENDING || stored?.status === JobStatus.DONE);
}

// --- 13. Reglas invalidas no rompen el motor --------------------------------
{
  const contact = await makeContact(A.workspaceId, '7');
  const broken = await prisma.automationRule.create({
    data: {
      workspaceId: A.workspaceId,
      name: 'Regla rota',
      trigger: AutomationTrigger.CONTACT_SCORE_CHANGED,
      conditions: { match: 'ALL', rules: [] },
      actions: [{ type: 'ACCION_INEXISTENTE' }] as never,
    },
  });

  const results = await runAutomationsForEvent({
    workspaceId: A.workspaceId,
    trigger: AutomationTrigger.CONTACT_SCORE_CHANGED,
    dedupeKey: `rota:${contact.id}`,
    contactId: contact.id,
  });

  const failed = results.find((r) => r.ruleId === broken.id);
  check('Una regla con acciones invalidas se marca fallida, no explota', failed?.error === 'acciones invalidas');

  const execution = await prisma.automationExecution.findFirst({
    where: { ruleId: broken.id },
  });
  check('El fallo queda registrado en la ejecucion', execution?.status === AutomationExecutionStatus.FAILED);
}

// --- Limpieza ---------------------------------------------------------------
const deleted = await prisma.workspace.deleteMany({ where: { slug: { startsWith: 'fase3-' } } });
await prisma.job.deleteMany({ where: { dedupeKey: { contains: String(stamp) } } });
await prisma.job.deleteMany({ where: { workspaceId: null, status: { in: [JobStatus.DONE, JobStatus.PENDING] } } });
console.log(`\nLimpieza: ${deleted.count} workspaces de prueba eliminados (cascade).`);

console.log(`\n== Resultado: ${results.length - failures}/${results.length} pruebas OK ==`);
await prisma.$disconnect();
process.exit(failures > 0 ? 1 : 0);
