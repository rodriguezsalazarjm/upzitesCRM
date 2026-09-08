/**
 * Pruebas de aceptacion de la Fase 1 (dominio comercial y consentimiento).
 *
 * Cubre lo que exige la spec para cerrar la fase:
 *   - transiciones de ciclo de vida validas e invalidas
 *   - SUPPRESSED bloquea el envio
 *   - un pago aprobado convierte a cliente y cancela la recuperacion
 *   - aislamiento entre workspaces
 *
 * Ejercita los servicios de dominio directamente (no por HTTP): en esta fase el
 * entregable es la capa de dominio, no rutas nuevas.
 *
 * Uso, desde apps/crm:
 *   pnpm exec tsx scripts/smoke-fase1.ts
 */
import 'dotenv/config';
import {
  BuyingIntent,
  ConsentChannel,
  LifecycleStatus,
  OpportunityStage,
  OpportunityStatus,
  ScheduledActionStatus,
  ScheduledActionType,
  SuppressionReason,
} from '../generated/prisma/client';
import { prisma } from '../src/lib/prisma';
import {
  applyApprovedPayment,
  canContact,
  cancelByKey,
  canTransition,
  computeScore,
  DEFAULT_QUIET_HOURS,
  grantConsent,
  isWithinQuietHours,
  LifecycleTransitionError,
  nextValidRunAt,
  recalculateContactScore,
  revokeConsent,
  scheduleAction,
  suppressIdentifier,
  transitionLifecycle,
} from '../src/lib/domain';
import { createCustomerWorkspace } from '../src/lib/subscription';

const results: { name: string; ok: boolean }[] = [];
let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function expectThrows(name: string, fn: () => Promise<unknown>, code?: string) {
  try {
    await fn();
    check(name, false, 'no lanzo error');
  } catch (error) {
    const actual = error instanceof LifecycleTransitionError ? error.code : 'OTRO';
    check(name, code ? actual === code : true, code ? `code=${actual}` : '');
  }
}

const stamp = Date.now();

async function makeWorkspace(key: string) {
  const { workspace, user } = await createCustomerWorkspace({
    companyName: `fase1-${key}-${stamp}`,
    ownerName: `Owner ${key}`,
    email: `fase1-${key}-${stamp}@upzites.test`,
    password: 'Fase1#Test1234',
  });
  return { workspaceId: workspace.id, userId: user.id };
}

async function makeContact(workspaceId: string, suffix: string) {
  return prisma.contact.create({
    data: {
      workspaceId,
      firstName: 'Contacto',
      lastName: suffix,
      email: `c-${suffix}-${stamp}@ejemplo.test`,
      phone: `+5691111${suffix.padStart(4, '0').slice(0, 4)}`,
      source: 'fase1-test',
    },
  });
}

console.log(`\n== Pruebas Fase 1 ==\n`);

const A = await makeWorkspace('a');
const B = await makeWorkspace('b');

// --- 1. Reglas de scoring sembradas al crear el workspace -------------------
{
  const rules = await prisma.leadScoreRule.count({ where: { workspaceId: A.workspaceId } });
  check('El workspace nuevo trae reglas de scoring por defecto', rules > 0, `${rules} reglas`);
}

// --- 2. Transiciones de ciclo de vida ---------------------------------------
{
  check('LEAD -> QUALIFIED es valida', canTransition(LifecycleStatus.LEAD, LifecycleStatus.QUALIFIED));
  check('LEAD -> REPEAT_CUSTOMER es invalida', !canTransition(LifecycleStatus.LEAD, LifecycleStatus.REPEAT_CUSTOMER));
  check('LOST -> LEAD es valida (reactivacion)', canTransition(LifecycleStatus.LOST, LifecycleStatus.LEAD));
  check('REPEAT_CUSTOMER -> LEAD es invalida', !canTransition(LifecycleStatus.REPEAT_CUSTOMER, LifecycleStatus.LEAD));

  const contact = await makeContact(A.workspaceId, '1');

  const qualified = await transitionLifecycle({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    to: LifecycleStatus.QUALIFIED,
    reason: 'QUALIFIED_BY_USER',
    actorId: A.userId,
  });
  check('Transicion valida aplica y espeja el status legado',
    qualified.lifecycleStatus === LifecycleStatus.QUALIFIED && qualified.status === 'ACTIVE');

  await expectThrows(
    'Transicion invalida es rechazada',
    () => transitionLifecycle({
      workspaceId: A.workspaceId,
      contactId: contact.id,
      to: LifecycleStatus.REPEAT_CUSTOMER,
      reason: 'REPEAT_PURCHASE',
    }),
    'INVALID_TRANSITION',
  );

  await expectThrows(
    'No se puede convertir a CUSTOMER sin pago ni confirmacion humana',
    () => transitionLifecycle({
      workspaceId: A.workspaceId,
      contactId: contact.id,
      to: LifecycleStatus.CUSTOMER,
      reason: 'QUALIFIED_BY_USER',
    }),
    'REASON_REQUIRED',
  );

  const audits = await prisma.auditLog.count({
    where: { workspaceId: A.workspaceId, action: 'contact.lifecycle_changed', entityId: contact.id },
  });
  check('La transicion queda auditada', audits === 1, `${audits} registros`);
}

// --- 3. Aislamiento entre workspaces ----------------------------------------
{
  const contactB = await makeContact(B.workspaceId, '2');

  await expectThrows(
    'Un workspace no puede mover el ciclo de vida de otro',
    () => transitionLifecycle({
      workspaceId: A.workspaceId,
      contactId: contactB.id,
      to: LifecycleStatus.QUALIFIED,
      reason: 'QUALIFIED_BY_USER',
    }),
    'NOT_FOUND',
  );

  const decision = await canContact({
    workspaceId: A.workspaceId,
    contactId: contactB.id,
    channel: ConsentChannel.EMAIL,
  });
  check('canContact no ve contactos de otro workspace', decision.reason === 'NOT_FOUND');
}

// --- 4. Consentimiento y supresion ------------------------------------------
{
  const contact = await makeContact(A.workspaceId, '3');

  const before = await canContact({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.EMAIL,
  });
  check('Sin registro de consentimiento NO se puede enviar', !before.allowed && before.reason === 'NO_CONSENT');

  await grantConsent({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.EMAIL,
    source: 'formulario-web',
  });
  const granted = await canContact({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.EMAIL,
  });
  check('Con consentimiento otorgado SI se puede enviar', granted.allowed);

  const whatsapp = await canContact({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.WHATSAPP,
  });
  check('El consentimiento es por canal: email no habilita WhatsApp', !whatsapp.allowed);

  // Una accion pendiente que la revocacion debe cancelar.
  await scheduleAction({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    type: ScheduledActionType.FOLLOW_UP,
    runAt: new Date(Date.now() + 60_000),
    cancelKey: `followup:${contact.id}`,
  });

  const revoked = await revokeConsent({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.EMAIL,
  });
  check('Revocar cancela las acciones pendientes', revoked.canceledActions === 1, `${revoked.canceledActions}`);

  const after = await canContact({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.EMAIL,
  });
  check('Tras revocar NO se puede enviar', !after.allowed && (after.reason === 'SUPPRESSED' || after.reason === 'REVOKED'));

  // Reimportacion: volver a pedir consentimiento no debe resucitar al suprimido.
  const regrant = await grantConsent({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.EMAIL,
    source: 'import-csv',
  });
  check('Una reimportacion NO resucita a un contacto suprimido', !regrant.granted && regrant.reason === 'SUPPRESSED');

  const stillBlocked = await canContact({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.EMAIL,
  });
  check('Sigue bloqueado despues del intento de reimportacion', !stillBlocked.allowed);
}

// --- 5. Supresion por identidad (rebote duro, sin contacto previo) ----------
{
  const contact = await makeContact(A.workspaceId, '4');
  await grantConsent({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.EMAIL,
    source: 'formulario-web',
  });

  const result = await suppressIdentifier({
    workspaceId: A.workspaceId,
    channel: ConsentChannel.EMAIL,
    identifier: (contact.email ?? '').toUpperCase(),
    reason: SuppressionReason.HARD_BOUNCE,
  });
  check('La supresion normaliza la identidad y alcanza al contacto', result.matchedContacts === 1);

  const decision = await canContact({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.EMAIL,
  });
  check('Un rebote duro bloquea el envio', !decision.allowed && decision.reason === 'SUPPRESSED');

  const leakToB = await prisma.suppressionEntry.count({ where: { workspaceId: B.workspaceId } });
  check('La supresion no cruza a otro workspace', leakToB === 0);
}

// --- 6. Pago aprobado -------------------------------------------------------
{
  const contact = await makeContact(A.workspaceId, '5');

  const stage = await prisma.pipelineStage.findFirstOrThrow({
    where: { workspaceId: A.workspaceId, key: OpportunityStage.NEW },
  });
  const opportunity = await prisma.opportunity.create({
    data: {
      workspaceId: A.workspaceId,
      contactId: contact.id,
      stageId: stage.id,
      title: 'Oportunidad de prueba',
      value: 100000,
      probability: 20,
    },
  });

  await scheduleAction({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    type: ScheduledActionType.CHECKOUT_RECOVERY,
    runAt: new Date(Date.now() + 3_600_000),
    cancelKey: `checkout:${contact.id}`,
  });

  const applied = await applyApprovedPayment({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    paymentId: 'pago-de-prueba-1',
    amount: 100000,
  });

  check('Pago aprobado convierte a CUSTOMER', applied.lifecycleStatus === LifecycleStatus.CUSTOMER);
  check('Pago aprobado cancela la recuperacion de checkout', applied.canceledActions === 1, `${applied.canceledActions}`);
  check('Pago aprobado marca la oportunidad como ganada', applied.opportunitiesWon === 1);

  const reloadedOpp = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunity.id } });
  check('La oportunidad quedo en estado WON', reloadedOpp.status === OpportunityStatus.WON);

  const pending = await prisma.scheduledAction.count({
    where: { contactId: contact.id, status: ScheduledActionStatus.PENDING },
  });
  check('No quedan acciones pendientes tras el pago', pending === 0);

  // Segunda compra: pasa a recurrente.
  const second = await applyApprovedPayment({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    paymentId: 'pago-de-prueba-2',
  });
  check('Una segunda compra convierte en REPEAT_CUSTOMER', second.lifecycleStatus === LifecycleStatus.REPEAT_CUSTOMER);
}

// --- 7. Cancelacion por clave -----------------------------------------------
{
  const contact = await makeContact(A.workspaceId, '6');
  const key = `campaign:${contact.id}`;
  for (const offset of [1, 2, 3]) {
    await scheduleAction({
      workspaceId: A.workspaceId,
      contactId: contact.id,
      type: ScheduledActionType.FOLLOW_UP,
      runAt: new Date(Date.now() + offset * 3_600_000),
      cancelKey: key,
    });
  }
  const canceled = await cancelByKey({ workspaceId: A.workspaceId, cancelKey: key, reason: 'respondio' });
  check('cancelKey apaga toda la secuencia de una vez', canceled === 3, `${canceled} acciones`);
}

// --- 8. Quiet hours (funcion pura) ------------------------------------------
{
  const night = new Date(2026, 8, 7, 22, 15);
  const earlyMorning = new Date(2026, 8, 7, 7, 0);
  const midday = new Date(2026, 8, 7, 13, 0);

  check('22:15 cae en horario de silencio', isWithinQuietHours(night, DEFAULT_QUIET_HOURS));
  check('07:00 cae en horario de silencio', isWithinQuietHours(earlyMorning, DEFAULT_QUIET_HOURS));
  check('13:00 NO cae en horario de silencio', !isWithinQuietHours(midday, DEFAULT_QUIET_HOURS));

  const fromNight = nextValidRunAt(night);
  check('Una accion nocturna se reprograma al dia siguiente a las 09:00',
    fromNight.getDate() === night.getDate() + 1 && fromNight.getHours() === 9,
    fromNight.toISOString());

  const fromMorning = nextValidRunAt(earlyMorning);
  check('Una accion de madrugada se reprograma al mismo dia a las 09:00',
    fromMorning.getDate() === earlyMorning.getDate() && fromMorning.getHours() === 9);

  check('Un horario valido no se toca', nextValidRunAt(midday).getTime() === midday.getTime());
}

// --- 9. Scoring determinista y explicable -----------------------------------
{
  const hot = computeScore({
    buyingIntent: BuyingIntent.CHECKOUT_STARTED,
    lifecycleStatus: LifecycleStatus.QUALIFIED,
    lastActivityAt: new Date(),
    activityCount: 4,
    openOpportunities: 1,
  });
  check('Checkout iniciado + actividad reciente da HOT', hot.temperature === 'HOT', `score=${hot.score}`);
  check('El score viene con sus razones', hot.reasons.length >= 3, `${hot.reasons.length} razones`);

  const cold = computeScore({
    buyingIntent: BuyingIntent.NO_INTENT,
    lifecycleStatus: LifecycleStatus.LEAD,
    lastActivityAt: new Date(Date.now() - 40 * 24 * 3600 * 1000),
    activityCount: 0,
    openOpportunities: 0,
  });
  check('Sin interes y sin actividad da COLD', cold.temperature === 'COLD', `score=${cold.score}`);
  check('El score nunca sale del rango 0-100', cold.score >= 0 && hot.score <= 100);

  const contact = await makeContact(A.workspaceId, '7');
  await prisma.contact.update({
    where: { id: contact.id },
    data: { buyingIntent: BuyingIntent.QUOTE_REQUESTED, lastActivityAt: new Date() },
  });
  const recalculated = await recalculateContactScore({ workspaceId: A.workspaceId, contactId: contact.id });
  check('recalculateContactScore devuelve resultado', recalculated !== null);

  const reloaded = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
  check('El score queda persistido en el contacto', reloaded.leadScore === recalculated?.score);

  const snapshots = await prisma.leadScoreSnapshot.count({ where: { contactId: contact.id } });
  check('Se guarda un snapshot con las razones', snapshots === 1);
}

// --- Limpieza ---------------------------------------------------------------
const deleted = await prisma.workspace.deleteMany({ where: { slug: { startsWith: 'fase1-' } } });
console.log(`\nLimpieza: ${deleted.count} workspaces de prueba eliminados (cascade).`);

console.log(`\n== Resultado: ${results.length - failures}/${results.length} pruebas OK ==`);
await prisma.$disconnect();
process.exit(failures > 0 ? 1 : 0);
