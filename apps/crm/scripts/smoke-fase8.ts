/**
 * Pruebas de aceptacion de la Fase 8 (recuperacion, email y campanas).
 *
 * Cubre lo que la spec exige para cerrar la fase:
 *   - los segmentos excluyen a los suprimidos
 *   - la desuscripcion cancela las acciones pendientes
 *   - un pago saca al contacto de la recuperacion
 *   - las quiet hours reprograman en vez de saltarse el mensaje
 *   - el tope de frecuencia impide el exceso
 *   - un rebote permanente suprime la direccion
 *
 * Y lo que la fase agrega por su cuenta: la IA no puede salirse del template,
 * el webhook sin firma no entra y nada cruza entre workspaces.
 *
 * Uso, desde apps/crm:
 *   pnpm exec tsx scripts/smoke-fase8.ts
 */
import 'dotenv/config';
import {
  CampaignRecipientStatus,
  CampaignStatus,
  ConsentChannel,
  ConsentStatus,
  EmailDomainStatus,
  EmailEventType,
  EmailMessageStatus,
  EmailTemplateStatus,
  JourneyEnrollmentStatus,
  JourneyStatus,
  JourneyStepAction,
  JourneyTrigger,
  LeadTemperature,
  LifecycleStatus,
  OrderStatus,
  ScheduledActionStatus,
  ScheduledActionType,
  SendCategory,
  SuppressionReason,
} from '../generated/prisma/client';
import { prisma } from '../src/lib/prisma';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { activateForTests } from './fixtures/workspace';
import { grantConsent, suppressIdentifier } from '../src/lib/domain/consent';
import { scheduleAction } from '../src/lib/domain/scheduled-actions';
import { computeScore } from '../src/lib/domain/scoring';
import {
  DEFAULT_POLICY,
  evaluateSend,
  instantForWallTime,
  isQuietHour,
  nextAllowedInstant,
  recordSend,
  wallTimeIn,
  type ContactPolicy,
} from '../src/lib/marketing/policy';
import {
  buildWhere,
  countSegment,
  parseDefinition,
  PRESET_SEGMENTS,
  resolveForSending,
  resolveSegment,
  SegmentError,
} from '../src/lib/marketing/segments';
import { advanceEnrollment, enroll, PRESET_JOURNEYS } from '../src/lib/marketing/journeys';
import { buildRecipients, sendCampaignBatch } from '../src/lib/marketing/campaigns';
import { sendEmail } from '../src/lib/email/send';
import { checkSlotValue, personalizeSlots, renderTemplate } from '../src/lib/email/templates';
import { applyUnsubscribe } from '../src/lib/email/unsubscribe';
import { processEmailEvent } from '../src/lib/email/events';
import { clearScriptedOutbox, createScriptedProvider, scriptedOutbox, signScriptedPayload } from '../src/lib/email/scripted';
import { verifySvixSignature } from '../src/lib/email/resend';
import { ScriptedProvider } from '../src/lib/agents/provider';

const results: { name: string; ok: boolean }[] = [];
let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const stamp = Date.now();

async function makeWorkspace(suffix: string) {
  const created = await createCustomerWorkspace({
    companyName: `fase8-${suffix}-${stamp}`,
    ownerName: 'Owner Fase8',
    email: `owner-${suffix}-${stamp}@fase8.test`,
    password: 'contrasena-de-prueba-1234',
  });

  // Desde la Fase 9 los journeys no escriben hasta que el workspace se activa.
  // Esa puerta se prueba en la suite de la Fase 9; aqui se prueba la
  // recuperacion.
  await activateForTests(created.workspace.id);

  return { workspaceId: created.workspace.id, userId: created.user.id };
}

async function makeContact(
  workspaceId: string,
  suffix: string,
  overrides: Record<string, unknown> = {},
) {
  return prisma.contact.create({
    data: {
      workspaceId,
      firstName: 'Contacto',
      lastName: suffix,
      email: `contacto-${suffix}-${stamp}@fase8.test`,
      phone: `+5691${String(stamp).slice(-7)}`,
      ...overrides,
    },
  });
}

async function makePublishedTemplate(workspaceId: string, key = 'bienvenida') {
  return prisma.emailTemplate.create({
    data: {
      workspaceId,
      key,
      name: 'Plantilla de prueba',
      subject: 'Hola {{nombre}}',
      bodyHtml: '<p>Hola {{nombre}}. {{gancho}}</p>',
      bodyText: 'Hola {{nombre}}. {{gancho}}',
      variables: ['nombre', 'gancho'],
      status: EmailTemplateStatus.PUBLISHED,
      publishedAt: new Date(),
    },
  });
}

/** Politica sin ventana de silencio: para probar lo que no es quiet hours. */
const OPEN_POLICY: ContactPolicy = {
  ...DEFAULT_POLICY,
  quietStartMinute: 0,
  quietEndMinute: 0,
  timezone: 'UTC',
};

const A = await makeWorkspace('a');
const B = await makeWorkspace('b');

// =============================================================================
console.log('\n== Politica de contacto: zona horaria y quiet hours ==');
// =============================================================================
{
  const policy: ContactPolicy = { ...DEFAULT_POLICY, timezone: 'America/Santiago' };

  // 2026-06-15 es invierno en Chile: UTC-4.
  const nightUtc = new Date('2026-06-16T01:00:00Z'); // 21:00 en Santiago
  const dayUtc = new Date('2026-06-15T18:00:00Z'); // 14:00 en Santiago

  check('Las 21:00 en Santiago caen en la ventana de silencio', isQuietHour(nightUtc, policy));
  check('Las 14:00 en Santiago no', !isQuietHour(dayUtc, policy));

  // La misma hora UTC en otra zona da otra respuesta: la zona importa de verdad.
  const tokyo: ContactPolicy = { ...policy, timezone: 'Asia/Tokyo' };
  check(
    'La zona horaria cambia la decision, no solo la etiqueta',
    isQuietHour(nightUtc, policy) !== isQuietHour(nightUtc, tokyo),
  );

  const rescheduled = nextAllowedInstant(nightUtc, policy);
  const wall = wallTimeIn(rescheduled, policy.timezone);

  check('Reprograma a las 09:00 hora local', wall.hour === 9 && wall.minute === 0, `${wall.hour}:${wall.minute}`);
  check('Y al dia siguiente', wall.day === 16, `dia ${wall.day}`);
  check('Lo reprogramado ya no cae en silencio', !isQuietHour(rescheduled, policy));

  const allowed = nextAllowedInstant(dayUtc, policy);
  check('Una hora habil no se mueve', allowed.getTime() === dayUtc.getTime());

  // Cambio de horario de verano en Chile: la primera semana de septiembre.
  const dstNight = new Date('2026-09-07T01:00:00Z');
  const dstResult = nextAllowedInstant(dstNight, policy);
  const dstWall = wallTimeIn(dstResult, policy.timezone);
  check(
    'El calculo sigue dando 09:00 local aunque cambie el desfase',
    dstWall.hour === 9 && dstWall.minute === 0,
    `${dstWall.hour}:${dstWall.minute}`,
  );

  // Ida y vuelta: hora de pared -> instante -> hora de pared.
  const roundTrip = wallTimeIn(
    instantForWallTime({ year: 2026, month: 12, day: 24, hour: 18, minute: 30 }, 'America/Santiago'),
    'America/Santiago',
  );
  check(
    'Convertir hora de pared a instante y de vuelta no pierde nada',
    roundTrip.hour === 18 && roundTrip.minute === 30 && roundTrip.day === 24,
  );

  // Fin de mes: dia 31 + 1 tiene que caer en el 1 del mes siguiente.
  const endOfMonth = nextAllowedInstant(new Date('2026-07-31T23:30:00Z'), { ...policy, timezone: 'UTC' });
  const endWall = wallTimeIn(endOfMonth, 'UTC');
  check('Cruza el fin de mes sin inventar un 32', endWall.day === 1 && endWall.month === 8);
}

// =============================================================================
console.log('\n== Consentimiento, silencio y topes de frecuencia ==');
// =============================================================================
{
  const contact = await makeContact(A.workspaceId, 'politica');

  const sinConsentimiento = await evaluateSend({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.EMAIL,
    policy: OPEN_POLICY,
  });
  check('Sin consentimiento no se envia nada promocional', !sinConsentimiento.allowed);

  // Lo operacional NO exige consentimiento promocional: la confirmacion de una
  // compra tiene que llegar igual.
  const operacional = await evaluateSend({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.EMAIL,
    category: SendCategory.OPERATIONAL,
    policy: OPEN_POLICY,
  });
  check('Lo operacional si sale sin consentimiento promocional', operacional.allowed);

  await grantConsent({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.EMAIL,
    source: 'prueba',
  });

  const conConsentimiento = await evaluateSend({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.EMAIL,
    policy: OPEN_POLICY,
  });
  check('Con consentimiento si', conConsentimiento.allowed);

  // Quiet hours: no bloquea, posterga.
  const quiet = await evaluateSend({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.EMAIL,
    policy: { ...DEFAULT_POLICY, timezone: 'UTC' },
    now: new Date('2026-06-15T23:00:00Z'),
  });
  check(
    'En quiet hours se posterga y se dice cuando',
    !quiet.allowed && quiet.reason === 'QUIET_HOURS' && quiet.retryAt instanceof Date,
  );

  // Tope de email: 3 por semana por defecto.
  for (let i = 0; i < 3; i += 1) {
    await recordSend({
      workspaceId: A.workspaceId,
      contactId: contact.id,
      channel: ConsentChannel.EMAIL,
      sentAt: new Date(Date.now() - i * 3_600_000),
    });
  }

  const capped = await evaluateSend({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.EMAIL,
    policy: OPEN_POLICY,
  });
  check(
    'El tope de frecuencia impide el cuarto email de la semana',
    !capped.allowed && capped.reason === 'FREQUENCY_CAP',
    capped.allowed ? '' : (capped.detail ?? ''),
  );
  check('Y dice cuando se libera', !capped.allowed && capped.retryAt instanceof Date);

  // Un envio operacional no queda frenado por un tope de marketing.
  const operacionalConTope = await evaluateSend({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.EMAIL,
    category: SendCategory.OPERATIONAL,
    policy: OPEN_POLICY,
  });
  check('Un tope de marketing no frena un mensaje operativo', operacionalConTope.allowed);

  // Regla 9: no mezclar canales promocionales el mismo dia.
  const otro = await makeContact(A.workspaceId, 'multicanal');
  await grantConsent({
    workspaceId: A.workspaceId,
    contactId: otro.id,
    channel: ConsentChannel.WHATSAPP,
    source: 'prueba',
  });
  await grantConsent({
    workspaceId: A.workspaceId,
    contactId: otro.id,
    channel: ConsentChannel.EMAIL,
    source: 'prueba',
  });
  await recordSend({
    workspaceId: A.workspaceId,
    contactId: otro.id,
    channel: ConsentChannel.EMAIL,
  });

  const cruzado = await evaluateSend({
    workspaceId: A.workspaceId,
    contactId: otro.id,
    channel: ConsentChannel.WHATSAPP,
    policy: OPEN_POLICY,
  });
  check(
    'No se manda WhatsApp promocional el mismo dia que un email',
    !cruzado.allowed && cruzado.reason === 'MULTICHANNEL_SAME_DAY',
  );

  const permitido = await evaluateSend({
    workspaceId: A.workspaceId,
    contactId: otro.id,
    channel: ConsentChannel.WHATSAPP,
    policy: { ...OPEN_POLICY, allowSameDayMultichannel: true },
  });
  check('Salvo que el workspace lo habilite a proposito', permitido.allowed);

  // Los envios de un workspace no cuentan para el tope de otro.
  const contactoB = await makeContact(B.workspaceId, 'aislado');
  await grantConsent({
    workspaceId: B.workspaceId,
    contactId: contactoB.id,
    channel: ConsentChannel.EMAIL,
    source: 'prueba',
  });
  const otroWorkspace = await evaluateSend({
    workspaceId: B.workspaceId,
    contactId: contactoB.id,
    channel: ConsentChannel.EMAIL,
    policy: OPEN_POLICY,
  });
  check('Los topes no cruzan entre workspaces', otroWorkspace.allowed);
}

// =============================================================================
console.log('\n== Segmentos ==');
// =============================================================================
{
  const suprimido = await makeContact(A.workspaceId, 'suprimido', {
    temperature: LeadTemperature.HOT,
  });
  const visible = await makeContact(A.workspaceId, 'visible', {
    temperature: LeadTemperature.HOT,
  });

  await suppressIdentifier({
    workspaceId: A.workspaceId,
    channel: ConsentChannel.EMAIL,
    identifier: suprimido.email!,
    reason: SuppressionReason.USER_REQUEST,
  });

  const calientes = PRESET_SEGMENTS.find((s) => s.key === 'leads-calientes-sin-compra')!;

  const resueltos = await resolveSegment({
    workspaceId: A.workspaceId,
    definition: calientes.definition,
    channel: ConsentChannel.EMAIL,
  });

  const ids = resueltos.map((c) => c.id);
  check('El segmento incluye al lead caliente', ids.includes(visible.id));
  check('El segmento EXCLUYE al suprimido', !ids.includes(suprimido.id));

  // La consulta SQL por si sola si lo devuelve: la exclusion es de resolveSegment.
  const sinFiltrar = await prisma.contact.count({
    where: buildWhere(calientes.definition, A.workspaceId),
  });
  check(
    'Y la exclusion la hace el resolvedor, no el azar de la consulta',
    sinFiltrar > resueltos.length,
    `${sinFiltrar} en SQL vs ${resueltos.length} resueltos`,
  );

  // El segmento de suprimidos es de solo consulta.
  const suprimidos = PRESET_SEGMENTS.find((s) => s.key === 'suprimidos')!;
  const lista = await resolveSegment({
    workspaceId: A.workspaceId,
    definition: suprimidos.definition,
    channel: ConsentChannel.EMAIL,
  });
  check('El segmento de suprimidos si los lista', lista.some((c) => c.id === suprimido.id));

  let rechazado = false;
  try {
    await resolveForSending({
      workspaceId: A.workspaceId,
      definition: suprimidos.definition,
      channel: ConsentChannel.EMAIL,
    });
  } catch (error) {
    rechazado = error instanceof SegmentError && error.code === 'QUERY_ONLY';
  }
  check('Pero no se le puede enviar', rechazado);

  // Aislamiento: el segmento de A no ve contactos de B.
  await makeContact(B.workspaceId, 'caliente-b', { temperature: LeadTemperature.HOT });
  const deA = await resolveSegment({
    workspaceId: A.workspaceId,
    definition: calientes.definition,
    channel: ConsentChannel.EMAIL,
  });
  const contactosDeB = await prisma.contact.findMany({
    where: { workspaceId: B.workspaceId },
    select: { id: true },
  });
  check(
    'Un segmento nunca alcanza contactos de otro workspace',
    !deA.some((c) => contactosDeB.some((b) => b.id === c.id)),
  );

  // Los ocho presets tienen definicion valida.
  const validos = PRESET_SEGMENTS.every((preset) => parseDefinition(preset.definition) !== null);
  check('Los 8 segmentos de fabrica tienen definicion valida', validos && PRESET_SEGMENTS.length === 8);

  // Ninguno nombra un rubro: la beta es multivertical.
  const texto = JSON.stringify(PRESET_SEGMENTS).toLowerCase();
  const rubros = ['malla', 'reja', 'iron', 'cerco', 'seguridad'];
  check('Ningun segmento de fabrica nombra un rubro', !rubros.some((r) => texto.includes(r)));

  // Un contacto sin email queda fuera de un envio por email.
  const sinEmail = await prisma.contact.create({
    data: {
      workspaceId: A.workspaceId,
      firstName: 'Sin',
      lastName: 'Email',
      temperature: LeadTemperature.HOT,
      phone: '+56911112222',
    },
  });
  const porEmail = await resolveSegment({
    workspaceId: A.workspaceId,
    definition: calientes.definition,
    channel: ConsentChannel.EMAIL,
  });
  check('Quien no tiene email no entra a un envio por email', !porEmail.some((c) => c.id === sinEmail.id));

  const porWhatsapp = await resolveSegment({
    workspaceId: A.workspaceId,
    definition: calientes.definition,
    channel: ConsentChannel.WHATSAPP,
  });
  check('Pero si a uno por WhatsApp', porWhatsapp.some((c) => c.id === sinEmail.id));

  const conteo = await countSegment({
    workspaceId: A.workspaceId,
    definition: calientes.definition,
    channel: ConsentChannel.EMAIL,
  });
  check('El recuento coincide con la resolucion', conteo === porEmail.length);
}

// =============================================================================
console.log('\n== Plantillas y personalizacion con IA acotada ==');
// =============================================================================
{
  const rendered = renderTemplate(
    { subject: 'Hola {{nombre}}', bodyHtml: '<p>{{saludo}}</p>', bodyText: '{{saludo}}' },
    { nombre: 'Ana & Co', saludo: '<b>hola</b>' },
  );

  check('El asunto no queda escapado', rendered.subject === 'Hola Ana & Co');
  check('El HTML si escapa el valor', rendered.html.includes('&lt;b&gt;hola&lt;/b&gt;'));
  check('El texto plano no escapa', rendered.text === '<b>hola</b>');

  const faltante = renderTemplate(
    { subject: 'x', bodyHtml: '<p>Hola {{nadie}}</p>', bodyText: 'Hola {{nadie}}' },
    {},
  );
  check(
    'Un placeholder sin valor no llega crudo al cliente',
    !faltante.html.includes('{{') && !faltante.text.includes('{{'),
  );

  const slot = {
    key: 'gancho',
    guide: 'Una frase corta',
    maxLength: 60,
    fallback: 'Quedamos atentos.',
  };

  check('Un texto normal se acepta', checkSlotValue(slot, 'Nos quedo pendiente tu consulta.').ok);
  check('Un enlace se rechaza', !checkSlotValue(slot, 'Mira https://oferta.test').ok);
  check('HTML se rechaza', !checkSlotValue(slot, '<script>x</script>').ok);
  check('Un monto inventado se rechaza', !checkSlotValue(slot, 'Te lo dejo en $19.990').ok);
  check('Un descuento inventado se rechaza', !checkSlotValue(slot, 'Tienes 30% de descuento').ok);
  check('Un texto demasiado largo se rechaza', !checkSlotValue(slot, 'a'.repeat(61)).ok);
  check('Un placeholder inyectado se rechaza', !checkSlotValue(slot, 'Hola {{admin}}').ok);
  check('Vacio se rechaza', !checkSlotValue(slot, '   ').ok);

  // Modelo hostil: intenta meter un enlace y un precio.
  const hostil = new ScriptedProvider([
    { text: '{"gancho":"Compra ya en https://spam.test por $9.990"}' },
  ]);

  const personalizado = await personalizeSlots({
    slots: [slot],
    context: { nombre: 'Ana' },
    provider: hostil,
  });

  check(
    'Un modelo que intenta salirse del template no lo consigue',
    personalizado.values.gancho === slot.fallback && personalizado.rejected.length === 1,
  );

  // Modelo que devuelve basura: se usa el respaldo, no se rompe el envio.
  const roto = new ScriptedProvider([{ text: 'perdon, no puedo' }]);
  const conRespaldo = await personalizeSlots({
    slots: [slot],
    context: {},
    provider: roto,
  });
  check('Si el modelo falla, el email igual sale con el texto de respaldo', conRespaldo.usedFallback);

  const bueno = new ScriptedProvider([{ text: 'Aqui va: {"gancho":"Seguimos disponibles."}' }]);
  const aceptado = await personalizeSlots({ slots: [slot], context: {}, provider: bueno });
  check('Una respuesta valida si se usa', aceptado.values.gancho === 'Seguimos disponibles.');
  check('Y no se marca como respaldo', !aceptado.usedFallback);

  const sinModelo = await personalizeSlots({ slots: [slot], context: {}, provider: null });
  check('Sin proveedor de modelo se usa el respaldo', sinModelo.values.gancho === slot.fallback);
}

// =============================================================================
console.log('\n== Envio de email ==');
// =============================================================================
{
  clearScriptedOutbox();
  const provider = createScriptedProvider();

  const contact = await makeContact(A.workspaceId, 'envio');
  await grantConsent({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.EMAIL,
    source: 'prueba',
  });

  // Sin dominio registrado no sale nada.
  const sinDominio = await sendEmail({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    subject: 'Hola',
    bodyHtml: '<p>Hola</p>',
    bodyText: 'Hola',
    provider,
    policy: OPEN_POLICY,
  });
  check(
    'Sin dominio de envio no sale ningun email',
    sinDominio.status === 'SKIPPED' && sinDominio.reason === 'NO_SENDER_DOMAIN',
  );

  // Con dominio sin verificar tampoco sale lo promocional.
  const dominio = await prisma.emailDomain.create({
    data: { workspaceId: A.workspaceId, domain: 'envios.fase8.test', status: EmailDomainStatus.PENDING },
  });

  const sinVerificar = await sendEmail({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    subject: 'Hola',
    bodyHtml: '<p>Hola</p>',
    bodyText: 'Hola',
    provider,
    policy: OPEN_POLICY,
  });
  check(
    'Con dominio sin verificar tampoco sale lo promocional',
    sinVerificar.status === 'SKIPPED' && sinVerificar.reason === 'DOMAIN_NOT_VERIFIED',
  );

  // Pero lo operacional si: un aviso de compra no puede esperar al DNS.
  const operacional = await sendEmail({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    category: SendCategory.OPERATIONAL,
    subject: 'Tu compra',
    bodyHtml: '<p>Listo</p>',
    bodyText: 'Listo',
    provider,
    policy: OPEN_POLICY,
  });
  check('Lo operacional si sale con dominio pendiente', operacional.status === 'SENT');

  await prisma.emailDomain.update({
    where: { id: dominio.id },
    data: {
      status: EmailDomainStatus.VERIFIED,
      verifiedAt: new Date(),
      fromEmail: 'hola@envios.fase8.test',
    },
  });

  clearScriptedOutbox();

  const enviado = await sendEmail({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    subject: 'Hola {{nombre}}',
    bodyHtml: '<p>Hola {{nombre}}</p>',
    bodyText: 'Hola {{nombre}}',
    provider,
    policy: OPEN_POLICY,
  });

  check('Con dominio verificado el email sale', enviado.status === 'SENT');

  const salida = scriptedOutbox();
  check('Y llego al proveedor una sola vez', salida.length === 1);
  check(
    'El nombre del contacto se sustituyo',
    salida[0]?.subject === `Hola ${contact.firstName}`,
    salida[0]?.subject,
  );

  // Regla 4 de la spec: todo email comercial lleva baja funcional.
  check('El email promocional lleva enlace de baja', salida[0]?.html.includes('/baja/') === true);
  check('Y en el texto plano tambien', salida[0]?.text.includes('/baja/') === true);
  check(
    'Y el encabezado List-Unsubscribe',
    typeof salida[0]?.listUnsubscribeUrl === 'string' && salida[0].listUnsubscribeUrl.length > 0,
  );

  const guardado = await prisma.emailMessage.findUniqueOrThrow({
    where: { id: enviado.status === 'SENT' ? enviado.emailMessageId : '' },
  });

  const tokenEnviado = salida[0].listUnsubscribeUrl!.split('/baja/')[1];

  check('Se guarda el hash del token, no el token', guardado.unsubscribeTokenHash !== null);
  check('El token en claro no queda en la base', !JSON.stringify(guardado).includes(tokenEnviado));
  check(
    'El cuerpo guardado conserva el marcador como evidencia',
    guardado.bodyHtml.includes('{{unsubscribe_url}}'),
  );
  check('Queda registrado como enviado', guardado.status === EmailMessageStatus.SENT);
  check('Con el id del proveedor', guardado.providerMessageId !== null);

  // El envio dejo rastro para los topes de frecuencia.
  const log = await prisma.contactSendLog.count({
    where: { workspaceId: A.workspaceId, contactId: contact.id, channel: ConsentChannel.EMAIL },
  });
  check('El envio queda contado para el tope de frecuencia', log >= 1);

  // Una plantilla puede colocar el enlace de baja donde quiera.
  await prisma.emailTemplate.create({
    data: {
      workspaceId: A.workspaceId,
      key: 'con-baja-propia',
      name: 'Con baja propia',
      subject: 'Hola',
      bodyHtml: '<p>Hola. <a href="{{unsubscribe_url}}">Baja</a></p>',
      bodyText: 'Hola. Baja: {{unsubscribe_url}}',
      status: EmailTemplateStatus.PUBLISHED,
      publishedAt: new Date(),
    },
  });

  clearScriptedOutbox();
  await sendEmail({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    templateKey: 'con-baja-propia',
    provider,
    policy: { ...OPEN_POLICY, maxEmailPerWeek: 10 },
  });

  const conBajaPropia = scriptedOutbox()[0];
  check(
    'Una plantilla puede colocar el enlace de baja donde quiera',
    conBajaPropia?.html.includes('/baja/') === true &&
      !conBajaPropia.html.includes('{{unsubscribe_url}}'),
  );
  check(
    'Y entonces no se le agrega un segundo pie',
    (conBajaPropia?.html.match(/\/baja\//g) ?? []).length === 1,
  );

  // Una plantilla sin publicar no se usa.
  await prisma.emailTemplate.create({
    data: {
      workspaceId: A.workspaceId,
      key: 'borrador',
      name: 'Borrador',
      subject: 'x',
      bodyHtml: '<p>x</p>',
      bodyText: 'x',
    },
  });

  const borrador = await sendEmail({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    templateKey: 'borrador',
    provider,
    policy: OPEN_POLICY,
  });
  check(
    'Una plantilla sin publicar no se envia',
    borrador.status === 'SKIPPED' && borrador.reason === 'TEMPLATE_NOT_PUBLISHED',
  );

  // Un contacto de otro workspace no se puede alcanzar.
  const ajeno = await makeContact(B.workspaceId, 'ajeno');
  const cruzado = await sendEmail({
    workspaceId: A.workspaceId,
    contactId: ajeno.id,
    subject: 'x',
    bodyHtml: '<p>x</p>',
    bodyText: 'x',
    provider,
    policy: OPEN_POLICY,
  });
  check(
    'No se puede enviar a un contacto de otro workspace',
    cruzado.status === 'SKIPPED' && cruzado.reason === 'NOT_FOUND',
  );
}

// =============================================================================
console.log('\n== Baja: cancela acciones, journeys y suprime ==');
// =============================================================================
{
  clearScriptedOutbox();
  const provider = createScriptedProvider();

  const contact = await makeContact(A.workspaceId, 'baja');
  await grantConsent({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.EMAIL,
    source: 'prueba',
  });

  await scheduleAction({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    type: ScheduledActionType.FOLLOW_UP,
    runAt: new Date(Date.now() + 3_600_000),
  });

  // Un journey de email activo, para comprobar que la baja lo detiene.
  const template = await makePublishedTemplate(A.workspaceId, 'journey-baja');
  const journey = await prisma.journey.create({
    data: {
      workspaceId: A.workspaceId,
      key: `baja-${stamp}`,
      name: 'Journey de email',
      trigger: JourneyTrigger.MANUAL,
      status: JourneyStatus.PUBLISHED,
      publishedAt: new Date(),
      steps: {
        create: [
          {
            position: 1,
            label: 'Correo',
            action: JourneyStepAction.SEND_EMAIL,
            delayHours: 0,
            templateId: template.id,
          },
        ],
      },
    },
  });

  await enroll({ workspaceId: A.workspaceId, journeyId: journey.id, contactId: contact.id });

  const enviado = await sendEmail({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    subject: 'Hola',
    bodyHtml: '<p>Hola</p>',
    bodyText: 'Hola',
    provider,
    policy: OPEN_POLICY,
  });

  const token = scriptedOutbox()[0].listUnsubscribeUrl!.split('/baja/')[1];

  const resultado = await applyUnsubscribe({ token, source: 'prueba' });
  check('El enlace de baja funciona', resultado?.ok === true);

  const consent = await prisma.contactChannelConsent.findUniqueOrThrow({
    where: { contactId_channel: { contactId: contact.id, channel: ConsentChannel.EMAIL } },
  });
  check('El consentimiento queda revocado', consent.status === ConsentStatus.REVOKED);

  const supresion = await prisma.suppressionEntry.findFirst({
    where: { workspaceId: A.workspaceId, channel: ConsentChannel.EMAIL, identifier: contact.email! },
  });
  check('La direccion entra a la lista de supresion', supresion !== null);

  const pendientes = await prisma.scheduledAction.count({
    where: { contactId: contact.id, status: ScheduledActionStatus.PENDING },
  });
  check('La baja cancela las acciones pendientes', pendientes === 0);

  const inscripcion = await prisma.journeyEnrollment.findFirstOrThrow({
    where: { journeyId: journey.id, contactId: contact.id },
  });
  check(
    'Y saca al contacto del journey de email',
    inscripcion.status === JourneyEnrollmentStatus.CANCELED,
    inscripcion.status,
  );

  // Idempotencia: abrir el enlace de nuevo no vuelve a contar.
  const repetido = await applyUnsubscribe({ token, source: 'prueba' });
  check('Volver a abrir el enlace no cuenta dos veces', repetido?.alreadyUnsubscribed === true);

  const eventos = await prisma.emailEvent.count({
    where: {
      emailMessageId: enviado.status === 'SENT' ? enviado.emailMessageId : '',
      type: EmailEventType.UNSUBSCRIBED,
    },
  });
  check('Y queda un solo evento de baja', eventos === 1);

  // Volver a pedir consentimiento no resucita al suprimido.
  const regrant = await grantConsent({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.EMAIL,
    source: 'importacion csv',
  });
  check('Una reimportacion no resucita a quien pidio la baja', regrant.granted === false);

  const trasBaja = await sendEmail({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    subject: 'Hola otra vez',
    bodyHtml: '<p>Hola</p>',
    bodyText: 'Hola',
    provider,
    policy: OPEN_POLICY,
  });
  check(
    'Y despues de la baja no le llega nada mas',
    trasBaja.status === 'SKIPPED' && trasBaja.reason === 'SUPPRESSED',
  );

  // Un token inventado no da informacion ni da de baja a nadie.
  const inventado = await applyUnsubscribe({ token: 'x'.repeat(43) });
  check('Un token inventado no da de baja a nadie', inventado === null);
}

// =============================================================================
console.log('\n== Webhook del proveedor: firma y eventos ==');
// =============================================================================
{
  const provider = createScriptedProvider();
  const secret = 'secreto-de-prueba-fase8';
  const original = process.env.EMAIL_WEBHOOK_SECRET;
  process.env.EMAIL_WEBHOOK_SECRET = secret;

  const body = JSON.stringify({ type: 'DELIVERED', messageId: 'abc', id: 'evt-1' });

  const sinFirma = provider.verifySignature(body, new Headers());
  check('Un webhook sin firma se rechaza', !sinFirma.valid);

  const firmaMala = provider.verifySignature(body, new Headers({ 'x-email-signature': 'no' }));
  check('Una firma incorrecta se rechaza', !firmaMala.valid);

  const firmaBuena = provider.verifySignature(
    body,
    new Headers({ 'x-email-signature': signScriptedPayload(body, secret) }),
  );
  check('Una firma correcta se acepta', firmaBuena.valid);

  // Un cuerpo alterado invalida la firma: se verifica sobre los bytes crudos.
  const alterado = provider.verifySignature(
    body.replace('abc', 'xyz'),
    new Headers({ 'x-email-signature': signScriptedPayload(body, secret) }),
  );
  check('Alterar el cuerpo invalida la firma', !alterado.valid);

  // Svix (Resend): sin ventana de tiempo, una captura serviria para siempre.
  const svixSecret = 'whsec_' + Buffer.from('clave-svix-de-prueba').toString('base64');
  const viejo = verifySvixSignature(
    '{}',
    new Headers({
      'svix-id': 'msg_1',
      'svix-timestamp': String(Math.floor(Date.now() / 1000) - 3600),
      'svix-signature': 'v1,cualquiera',
    }),
    svixSecret,
  );
  check('Un webhook de Resend viejo se rechaza aunque venga firmado', !viejo.valid);

  process.env.EMAIL_WEBHOOK_SECRET = original;

  // --- Eventos ---
  const contact = await makeContact(A.workspaceId, 'eventos');
  await grantConsent({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.EMAIL,
    source: 'prueba',
  });

  const message = await prisma.emailMessage.create({
    data: {
      workspaceId: A.workspaceId,
      contactId: contact.id,
      toEmail: contact.email!,
      fromEmail: 'hola@envios.fase8.test',
      subject: 'x',
      bodyHtml: '<p>x</p>',
      bodyText: 'x',
      status: EmailMessageStatus.SENT,
      providerMessageId: `prov-${stamp}`,
      sentAt: new Date(),
    },
  });

  const entregado = await processEmailEvent({
    type: EmailEventType.DELIVERED,
    providerMessageId: message.providerMessageId,
    recipient: contact.email,
    dedupeKey: `d-${stamp}`,
    occurredAt: new Date(),
  });
  check('Un evento de entrega se aplica', entregado.applied);

  const duplicado = await processEmailEvent({
    type: EmailEventType.DELIVERED,
    providerMessageId: message.providerMessageId,
    recipient: contact.email,
    dedupeKey: `d-${stamp}`,
    occurredAt: new Date(),
  });
  check(
    'El mismo evento repetido no se cuenta dos veces',
    !duplicado.applied && duplicado.reason === 'DUPLICATE',
  );

  await processEmailEvent({
    type: EmailEventType.OPENED,
    providerMessageId: message.providerMessageId,
    recipient: contact.email,
    dedupeKey: `o-${stamp}`,
    occurredAt: new Date(),
  });

  const abierto = await prisma.emailMessage.findUniqueOrThrow({ where: { id: message.id } });
  check('La apertura avanza el estado', abierto.status === EmailMessageStatus.OPENED);
  check('Y guarda cuando ocurrio', abierto.openedAt !== null);

  // Un "delivered" que llega tarde no debe hacer retroceder el estado.
  await processEmailEvent({
    type: EmailEventType.DELIVERED,
    providerMessageId: message.providerMessageId,
    recipient: contact.email,
    dedupeKey: `d2-${stamp}`,
    occurredAt: new Date(),
  });
  const trasTardio = await prisma.emailMessage.findUniqueOrThrow({ where: { id: message.id } });
  check('Un evento que llega tarde no hace retroceder el estado', trasTardio.status === EmailMessageStatus.OPENED);

  // La apertura sube el score del contacto.
  const puntuado = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
  check('Abrir un email sube el score', puntuado.leadScore > 0, `${puntuado.leadScore}`);

  const snapshot = await prisma.leadScoreSnapshot.findFirst({
    where: { contactId: contact.id },
    orderBy: { createdAt: 'desc' },
  });
  const razones = JSON.stringify(snapshot?.reasons ?? []);
  check('Y la razon queda explicada en el snapshot', razones.includes('email_opened'));

  // Un evento de un mensaje que no conocemos no se atribuye a nadie.
  const desconocido = await processEmailEvent({
    type: EmailEventType.OPENED,
    providerMessageId: 'no-existe',
    recipient: 'x@y.test',
    dedupeKey: `u-${stamp}`,
    occurredAt: new Date(),
  });
  check(
    'Un evento sin mensaje conocido no se aplica a ciegas',
    !desconocido.applied && desconocido.reason === 'UNKNOWN_MESSAGE',
  );
}

// =============================================================================
console.log('\n== Rebotes y quejas ==');
// =============================================================================
{
  const duro = await makeContact(A.workspaceId, 'rebote-duro');
  const blando = await makeContact(A.workspaceId, 'rebote-blando');

  for (const [contact, permanent, key] of [
    [duro, true, 'hard'],
    [blando, false, 'soft'],
  ] as const) {
    const message = await prisma.emailMessage.create({
      data: {
        workspaceId: A.workspaceId,
        contactId: contact.id,
        toEmail: contact.email!,
        fromEmail: 'hola@envios.fase8.test',
        subject: 'x',
        bodyHtml: '<p>x</p>',
        bodyText: 'x',
        status: EmailMessageStatus.SENT,
        providerMessageId: `bounce-${key}-${stamp}`,
        sentAt: new Date(),
      },
    });

    await processEmailEvent({
      type: EmailEventType.BOUNCED,
      providerMessageId: message.providerMessageId,
      recipient: contact.email,
      dedupeKey: `b-${key}-${stamp}`,
      occurredAt: new Date(),
      permanent,
    });
  }

  const supDuro = await prisma.suppressionEntry.findFirst({
    where: { workspaceId: A.workspaceId, identifier: duro.email!, channel: ConsentChannel.EMAIL },
  });
  check('Un rebote permanente suprime la direccion', supDuro !== null);
  check('Con el motivo correcto', supDuro?.reason === SuppressionReason.HARD_BOUNCE);

  const supBlando = await prisma.suppressionEntry.findFirst({
    where: { workspaceId: A.workspaceId, identifier: blando.email!, channel: ConsentChannel.EMAIL },
  });
  check('Un rebote transitorio NO suprime', supBlando === null);

  // Queja de spam: siempre suprime.
  const quejoso = await makeContact(A.workspaceId, 'queja');
  const message = await prisma.emailMessage.create({
    data: {
      workspaceId: A.workspaceId,
      contactId: quejoso.id,
      toEmail: quejoso.email!,
      fromEmail: 'hola@envios.fase8.test',
      subject: 'x',
      bodyHtml: '<p>x</p>',
      bodyText: 'x',
      status: EmailMessageStatus.SENT,
      providerMessageId: `spam-${stamp}`,
      sentAt: new Date(),
    },
  });

  await processEmailEvent({
    type: EmailEventType.COMPLAINED,
    providerMessageId: message.providerMessageId,
    recipient: quejoso.email,
    dedupeKey: `c-${stamp}`,
    occurredAt: new Date(),
  });

  const supQueja = await prisma.suppressionEntry.findFirst({
    where: { workspaceId: A.workspaceId, identifier: quejoso.email!, channel: ConsentChannel.EMAIL },
  });
  check('Una queja de spam suprime la direccion', supQueja?.reason === SuppressionReason.SPAM_COMPLAINT);
}

// =============================================================================
console.log('\n== Journeys ==');
// =============================================================================
{
  // Sin proveedor explicito: el envio resuelve el del dominio del workspace,
  // que es parte de lo que se quiere comprobar.
  clearScriptedOutbox();

  const template = await makePublishedTemplate(A.workspaceId, `journey-${stamp}`);

  const journey = await prisma.journey.create({
    data: {
      workspaceId: A.workspaceId,
      key: `seguimiento-${stamp}`,
      name: 'Seguimiento de prueba',
      trigger: JourneyTrigger.MANUAL,
      status: JourneyStatus.DRAFT,
      steps: {
        create: [
          {
            position: 1,
            label: 'Primer correo',
            action: JourneyStepAction.SEND_EMAIL,
            delayHours: 0,
            templateId: template.id,
          },
          {
            position: 2,
            label: 'Segundo correo',
            action: JourneyStepAction.SEND_EMAIL,
            delayHours: 24,
            templateId: template.id,
          },
          { position: 3, label: 'Fin', action: JourneyStepAction.EXIT, delayHours: 0 },
        ],
      },
    },
  });

  const contact = await makeContact(A.workspaceId, 'journey');
  await grantConsent({
    workspaceId: A.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.EMAIL,
    source: 'prueba',
  });

  const enBorrador = await enroll({
    workspaceId: A.workspaceId,
    journeyId: journey.id,
    contactId: contact.id,
  });
  check(
    'Un journey en borrador no inscribe a nadie',
    !enBorrador.enrolled && enBorrador.reason === 'NOT_PUBLISHED',
  );

  await prisma.journey.update({
    where: { id: journey.id },
    data: { status: JourneyStatus.PUBLISHED, publishedAt: new Date() },
  });

  const inscrito = await enroll({
    workspaceId: A.workspaceId,
    journeyId: journey.id,
    contactId: contact.id,
  });
  check('Publicado si inscribe', inscrito.enrolled);

  const repetido = await enroll({
    workspaceId: A.workspaceId,
    journeyId: journey.id,
    contactId: contact.id,
  });
  check(
    'Un barrido repetido no vuelve a inscribir',
    !repetido.enrolled && repetido.reason === 'ALREADY_ENROLLED',
  );

  // Un contacto de otro workspace no se puede inscribir.
  const ajeno = await makeContact(B.workspaceId, 'journey-ajeno');
  const cruzado = await enroll({
    workspaceId: A.workspaceId,
    journeyId: journey.id,
    contactId: ajeno.id,
  });
  check('No se inscribe un contacto de otro workspace', !cruzado.enrolled);

  const enrollmentId = inscrito.enrolled ? inscrito.enrollmentId : '';

  // --- Quiet hours: reprograma, no consume el paso ---
  await prisma.messagingPolicy.update({
    where: { workspaceId: A.workspaceId },
    data: { timezone: 'UTC', quietStartMinute: 0, quietEndMinute: 1439 },
  });

  const enSilencio = await advanceEnrollment(enrollmentId, new Date());
  check('En quiet hours el paso se reprograma', enSilencio.outcome === 'RESCHEDULE', enSilencio.detail);

  const tras = await prisma.journeyEnrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
  check('Y NO se consume el paso', tras.currentPosition === 1 && tras.stepsCompleted === 0);
  check('Queda con una nueva fecha', tras.nextRunAt !== null);
  check('Nada se envio', scriptedOutbox().length === 0);

  // --- Fuera de quiet hours si avanza ---
  await prisma.messagingPolicy.update({
    where: { workspaceId: A.workspaceId },
    data: { quietStartMinute: 0, quietEndMinute: 0, maxEmailPerWeek: 10 },
  });

  await prisma.journeyEnrollment.update({
    where: { id: enrollmentId },
    data: { nextRunAt: new Date(Date.now() - 1000) },
  });

  const avanzo = await advanceEnrollment(enrollmentId, new Date());
  check('Fuera del silencio el paso si se ejecuta', avanzo.outcome === 'DONE', avanzo.detail);

  const despues = await prisma.journeyEnrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
  check('Avanza al paso siguiente', despues.currentPosition === 2);
  check('Y guarda cuando toca el proximo', despues.nextRunAt !== null);

  const enviados = await prisma.emailMessage.count({
    where: { workspaceId: A.workspaceId, journeyId: journey.id },
  });
  check('Se envio exactamente un email del journey', enviados === 1);

  // Reiniciar no pierde el estado: el proximo paso queda en la base.
  const persistido = await prisma.journeyEnrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
  check(
    'El proximo paso sobrevive a un reinicio (esta en la base, no en memoria)',
    persistido.currentPosition === 2 && persistido.nextRunAt !== null,
  );

  // --- Salida por pago ---
  const comprador = await makeContact(A.workspaceId, 'comprador');
  await grantConsent({
    workspaceId: A.workspaceId,
    contactId: comprador.id,
    channel: ConsentChannel.EMAIL,
    source: 'prueba',
  });

  const suyo = await enroll({
    workspaceId: A.workspaceId,
    journeyId: journey.id,
    contactId: comprador.id,
  });

  await prisma.customerOrder.create({
    data: {
      workspaceId: A.workspaceId,
      contactId: comprador.id,
      status: OrderStatus.CONFIRMED,
      total: 10000,
      confirmedAt: new Date(),
    },
  });

  await prisma.journeyEnrollment.update({
    where: { id: suyo.enrolled ? suyo.enrollmentId : '' },
    data: { nextRunAt: new Date(Date.now() - 1000) },
  });

  const trasPago = await advanceEnrollment(suyo.enrolled ? suyo.enrollmentId : '', new Date());
  check('Un pago saca al contacto de la recuperacion', trasPago.outcome === 'EXIT', trasPago.detail);

  const salido = await prisma.journeyEnrollment.findUniqueOrThrow({
    where: { id: suyo.enrolled ? suyo.enrollmentId : '' },
  });
  check('La inscripcion queda EXITED', salido.status === JourneyEnrollmentStatus.EXITED);
  check('Con el motivo guardado', (salido.exitReason ?? '').includes('compro'));

  const emailsAlComprador = await prisma.emailMessage.count({
    where: { workspaceId: A.workspaceId, contactId: comprador.id },
  });
  check('Y no le llego ningun correo de recuperacion', emailsAlComprador === 0);

  // --- Un journey pausado no escribe pero conserva la inscripcion ---
  const pausable = await makeContact(A.workspaceId, 'pausa');
  await grantConsent({
    workspaceId: A.workspaceId,
    contactId: pausable.id,
    channel: ConsentChannel.EMAIL,
    source: 'prueba',
  });

  const enPausa = await enroll({
    workspaceId: A.workspaceId,
    journeyId: journey.id,
    contactId: pausable.id,
  });

  await prisma.journey.update({ where: { id: journey.id }, data: { status: JourneyStatus.PAUSED } });
  await prisma.journeyEnrollment.update({
    where: { id: enPausa.enrolled ? enPausa.enrollmentId : '' },
    data: { nextRunAt: new Date(Date.now() - 1000) },
  });

  const pausado = await advanceEnrollment(enPausa.enrolled ? enPausa.enrollmentId : '', new Date());
  check('Un journey pausado no ejecuta pasos', pausado.outcome === 'NOT_ACTIVE');

  const conservada = await prisma.journeyEnrollment.findUniqueOrThrow({
    where: { id: enPausa.enrolled ? enPausa.enrollmentId : '' },
  });
  check(
    'Pero la inscripcion se conserva para cuando lo reactiven',
    conservada.status === JourneyEnrollmentStatus.ACTIVE && conservada.currentPosition === 1,
  );

  // --- Los cuatro journeys de fabrica ---
  check('Hay 4 journeys de fabrica', PRESET_JOURNEYS.length === 4);
  const claves = PRESET_JOURNEYS.map((j) => j.key);
  check(
    'Cubren lead silencioso, checkout, cotizacion y postventa',
    ['lead-silencioso', 'checkout-abandonado', 'cotizacion-pendiente', 'postventa'].every((k) =>
      claves.includes(k),
    ),
  );

  const textoPresets = JSON.stringify(PRESET_JOURNEYS).toLowerCase();
  check(
    'Ningun journey de fabrica nombra un rubro',
    !['malla', 'reja', 'iron', 'cerco'].some((r) => textoPresets.includes(r)),
  );

  const silencioso = PRESET_JOURNEYS.find((j) => j.key === 'lead-silencioso')!;
  const esperas = silencioso.steps.filter((s) => s.action === JourneyStepAction.SEND_WHATSAPP);
  check(
    'El lead silencioso respeta los tiempos de la spec: 2 h, 24 h y 3 dias',
    esperas[0].delayHours === 2 && esperas[1].delayHours === 22 && esperas[2].delayHours === 48,
  );
  check(
    'Y termina enfriando al contacto',
    silencioso.steps.some((s) => s.action === JourneyStepAction.SET_TEMPERATURE && s.body === 'COLD'),
  );

  // Un workspace nuevo nace con ellos, en borrador.
  const deFabrica = await prisma.journey.findMany({
    where: { workspaceId: B.workspaceId },
    select: { key: true, status: true },
  });
  check('Un workspace nuevo nace con los 4 journeys', deFabrica.length === 4);
  check(
    'Todos en borrador: publicar es decision del cliente',
    deFabrica.every((j) => j.status === JourneyStatus.DRAFT),
  );

  const segmentosDeFabrica = await prisma.segment.count({ where: { workspaceId: B.workspaceId } });
  check('Y con los 8 segmentos', segmentosDeFabrica === 8);

  const politica = await prisma.messagingPolicy.findUnique({ where: { workspaceId: B.workspaceId } });
  check('Y con su politica de contacto ya puesta', politica !== null);
  check(
    'Con las quiet hours de la spec: 20:30 a 09:00',
    politica?.quietStartMinute === 1230 && politica?.quietEndMinute === 540,
  );
}

// =============================================================================
console.log('\n== Campanas ==');
// =============================================================================
{
  clearScriptedOutbox();

  const workspaceId = A.workspaceId;
  await prisma.messagingPolicy.update({
    where: { workspaceId },
    data: { quietStartMinute: 0, quietEndMinute: 0, maxEmailPerWeek: 10, allowSameDayMultichannel: true },
  });

  const template = await makePublishedTemplate(workspaceId, `campana-${stamp}`);

  // Tres contactos: uno normal, uno suprimido y uno sin consentimiento.
  const recibe = await makeContact(workspaceId, 'campana-ok', { tags: ['campana-fase8'] });
  const suprimido = await makeContact(workspaceId, 'campana-sup', { tags: ['campana-fase8'] });
  const sinConsentimiento = await makeContact(workspaceId, 'campana-sin', { tags: ['campana-fase8'] });

  for (const contact of [recibe, suprimido]) {
    await grantConsent({
      workspaceId,
      contactId: contact.id,
      channel: ConsentChannel.EMAIL,
      source: 'prueba',
    });
  }

  await suppressIdentifier({
    workspaceId,
    channel: ConsentChannel.EMAIL,
    identifier: suprimido.email!,
    reason: SuppressionReason.USER_REQUEST,
  });

  const segment = await prisma.segment.create({
    data: {
      workspaceId,
      key: `campana-${stamp}`,
      name: 'Etiquetados para la prueba',
      definition: {
        match: 'ALL',
        queryOnly: false,
        filters: [{ field: 'tags', operator: 'has', value: 'campana-fase8' }],
      },
    },
  });

  const campaign = await prisma.campaign.create({
    data: {
      workspaceId,
      name: 'Campana de prueba',
      segmentId: segment.id,
      templateId: template.id,
    },
  });

  const construida = await buildRecipients({ workspaceId, campaignId: campaign.id });
  check(
    'La lista de la campana excluye al suprimido',
    construida.recipientCount === 2,
    `${construida.recipientCount} destinatarios`,
  );

  const enLista = await prisma.campaignRecipient.findMany({
    where: { campaignId: campaign.id },
    select: { contactId: true },
  });
  check(
    'El suprimido no aparece ni como destinatario omitido',
    !enLista.some((r) => r.contactId === suprimido.id),
  );

  // Reconstruir no duplica.
  await buildRecipients({ workspaceId, campaignId: campaign.id });
  const trasReconstruir = await prisma.campaignRecipient.count({ where: { campaignId: campaign.id } });
  check('Reconstruir la lista no duplica destinatarios', trasReconstruir === 2);

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: CampaignStatus.SCHEDULED, scheduledAt: new Date() },
  });

  const tanda = await sendCampaignBatch({ workspaceId, campaignId: campaign.id });

  check('Se envio al contacto con consentimiento', tanda.sent === 1, `${tanda.sent} enviados`);
  check('Y se omitio al que no lo dio', tanda.skipped === 1, `${tanda.skipped} omitidos`);
  check('La campana queda como enviada', tanda.status === CampaignStatus.SENT);

  const omitido = await prisma.campaignRecipient.findFirstOrThrow({
    where: { campaignId: campaign.id, contactId: sinConsentimiento.id },
  });
  check('El omitido queda con su motivo', omitido.status === CampaignRecipientStatus.SKIPPED);
  check('Y el motivo es la falta de consentimiento', omitido.skipReason === 'NO_CONSENT');

  const enviadoA = await prisma.campaignRecipient.findFirstOrThrow({
    where: { campaignId: campaign.id, contactId: recibe.id },
  });
  check('El enviado queda enlazado a su email', enviadoA.emailMessageId !== null);

  // Reenviar la misma campana no vuelve a escribirle a nadie.
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: CampaignStatus.SENDING },
  });
  const segunda = await sendCampaignBatch({ workspaceId, campaignId: campaign.id });
  check('Reejecutar la campana no reenvia nada', segunda.sent === 0 && segunda.skipped === 0);

  const totalEmails = await prisma.emailMessage.count({ where: { campaignId: campaign.id } });
  check('Sigue habiendo un solo email de la campana', totalEmails === 1);

  // Metricas: un evento del proveedor mueve el contador.
  const mensaje = await prisma.emailMessage.findFirstOrThrow({ where: { campaignId: campaign.id } });

  await processEmailEvent({
    type: EmailEventType.OPENED,
    providerMessageId: mensaje.providerMessageId,
    recipient: mensaje.toEmail,
    dedupeKey: `camp-open-${stamp}`,
    occurredAt: new Date(),
  });

  const conMetricas = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
  check('Las aperturas suben el contador de la campana', conMetricas.openedCount === 1);

  // Una baja desde la campana queda atribuida a ella.
  const salida = scriptedOutbox().find((mail) => mail.to === recibe.email);
  const token = salida?.listUnsubscribeUrl?.split('/baja/')[1] ?? '';
  await applyUnsubscribe({ token, source: 'prueba' });

  const conBaja = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
  check('La baja se atribuye a la campana que la provoco', conBaja.unsubscribedCount === 1);
}

// =============================================================================
console.log('\n== Scoring explicable ==');
// =============================================================================
{
  const base = {
    buyingIntent: 'UNKNOWN' as const,
    lifecycleStatus: LifecycleStatus.LEAD,
    lastActivityAt: null,
    activityCount: 0,
    openOpportunities: 0,
  };

  const conApertura = computeScore({ ...base, emailOpened: true });
  check('Abrir un email suma 5', conApertura.score === 5);
  check('Y la razon aparece con su etiqueta', conApertura.reasons[0]?.label === 'Abrio un email');

  const conClic = computeScore({ ...base, emailOpened: true, emailClicked: true });
  check('Un clic suma 10', conClic.score === 10);
  check(
    'Y no se cuenta ademas la apertura: es la misma señal',
    conClic.reasons.filter((r) => r.key.startsWith('email_')).length === 1,
  );

  const sinEmail = computeScore(base);
  check('Sin señal de email no se suma nada', sinEmail.score === 0);

  // Las reglas nuevas llegaron tambien a los workspaces que ya existian.
  const reglas = await prisma.leadScoreRule.findMany({
    where: { workspaceId: A.workspaceId, key: { in: ['email_opened', 'email_clicked'] } },
  });
  check('Las reglas de email existen en el workspace', reglas.length === 2);
}

// --- Limpieza ---------------------------------------------------------------
const deleted = await prisma.workspace.deleteMany({ where: { slug: { startsWith: 'fase8-' } } });
console.log(`\nLimpieza: ${deleted.count} workspaces de prueba eliminados (cascade).`);

console.log(`\n== Resultado: ${results.length - failures}/${results.length} pruebas OK ==`);
await prisma.$disconnect();
process.exit(failures > 0 ? 1 : 0);
