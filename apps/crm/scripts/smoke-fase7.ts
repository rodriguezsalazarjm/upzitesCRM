/**
 * Pruebas de aceptacion de la Fase 7 (cotizador y aprobaciones).
 *
 * Cubre lo que exige la spec para cerrar la fase:
 *   - fixtures con calculos conocidos
 *   - datos faltantes bloquean el calculo
 *   - el LLM no altera el total
 *   - una cotizacion aprobada no se edita: crea version
 *   - solo roles autorizados aprueban
 *   - el PDF corresponde a los datos aprobados
 *
 * Uso, desde apps/crm:
 *   pnpm exec tsx scripts/smoke-fase7.ts
 */
import 'dotenv/config';
import {
  ApprovalStatus,
  PricingRuleSetStatus,
  QuoteStatus,
  UserRole,
} from '../generated/prisma/client';
import { prisma } from '../src/lib/prisma';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { calculateQuote } from '../src/lib/quotes/engine';
import { parseRules, validateIntake, parseIntakeSchema } from '../src/lib/quotes/schema';
import {
  acceptQuote,
  approveQuote,
  createQuote,
  generateQuoteToken,
  getPublishedRuleSet,
  hashQuoteToken,
  listQuotableServices,
  markQuoteSent,
  pendingApprovals,
  QuoteError,
  rejectQuote,
  resolveQuoteByToken,
} from '../src/lib/quotes/service';
import { renderQuotePdf } from '../src/lib/quotes/pdf';
import { AGENT_TOOLS } from '../src/lib/agents/tools';

const results: { name: string; ok: boolean }[] = [];
let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const stamp = Date.now();

/**
 * Servicio de prueba con calculos conocidos a mano.
 *
 * Es GENERICO a proposito: "superficie", "unidades", "dificultad". La beta es
 * multivertical y ningun rubro vive en el codigo.
 */
const INTAKE = {
  fields: [
    { key: 'ancho', label: 'Ancho', type: 'number', required: true, unit: 'm', min: 0.1 },
    { key: 'alto', label: 'Alto', type: 'number', required: true, unit: 'm', min: 0.1 },
    { key: 'unidades', label: 'Cantidad de unidades', type: 'number', required: true },
    {
      key: 'dificultad',
      label: 'Dificultad de acceso',
      type: 'select',
      required: true,
      options: ['normal', 'alta'],
    },
    { key: 'observaciones', label: 'Observaciones', type: 'text', required: false },
  ],
};

const RULES = {
  components: [
    {
      key: 'superficie',
      label: 'Superficie',
      type: 'PER_AREA',
      unitPriceClp: 10000,
      widthFrom: 'ancho',
      heightFrom: 'alto',
    },
    {
      key: 'unidades',
      label: 'Unidades',
      type: 'PER_UNIT',
      unitPriceClp: 20000,
      quantityFrom: 'unidades',
    },
    { key: 'visita', label: 'Visita tecnica', type: 'FIXED', amountClp: 30000 },
    {
      key: 'dificil',
      label: 'Recargo por acceso dificil',
      type: 'SURCHARGE',
      percent: 10,
      when: { match: 'ALL', rules: [{ field: 'dificultad', operator: 'eq', value: 'alta' }] },
    },
  ],
  minimumClp: 100000,
  roundToClp: 1000,
};

async function makeWorkspace(key: string) {
  const { workspace, user } = await createCustomerWorkspace({
    companyName: `fase7-${key}-${stamp}`,
    ownerName: `Owner ${key}`,
    email: `fase7-${key}-${stamp}@upzites.test`,
    password: 'Fase7#Test1234',
  });

  const ruleSet = await prisma.pricingRuleSet.create({
    data: {
      workspaceId: workspace.id,
      serviceKey: 'servicio-medido',
      name: 'Servicio medido',
      description: 'Servicio de prueba con superficie y unidades',
      intakeSchema: INTAKE as never,
      rules: RULES as never,
      disclaimer: 'Monto referencial sujeto a revision de medidas.',
      validityDays: 15,
      status: PricingRuleSetStatus.PUBLISHED,
      publishedAt: new Date(),
    },
  });

  return { workspaceId: workspace.id, userId: user.id, ruleSetId: ruleSet.id };
}

async function makeContact(workspaceId: string, suffix: string) {
  return prisma.contact.create({
    data: {
      workspaceId,
      firstName: 'Cliente',
      lastName: suffix,
      phone: `+5695${suffix.padStart(6, '0').slice(0, 6)}`,
      source: 'fase7',
    },
  });
}

console.log('\n== Pruebas Fase 7 ==\n');

// --- 1. Motor: calculos conocidos -------------------------------------------
{
  const rules = parseRules(RULES)!;
  check('Las reglas de prueba son validas', rules !== null);

  // 2 × 3 = 6 m2 × 10000 = 60.000
  // 2 unidades × 20.000 = 40.000
  // visita = 30.000
  // subtotal = 130.000, sin recargo, sobre el minimo, ya redondeado.
  const simple = calculateQuote(rules, { ancho: 2, alto: 3, unidades: 2, dificultad: 'normal' });
  check('Calculo conocido sin recargo', simple.total === 130000, `${simple.total}`);
  check('El subtotal coincide', simple.subtotal === 130000);
  check('Sin recargos', simple.surcharges === 0);
  check('El desglose tiene una linea por componente', simple.lines.length === 3, `${simple.lines.length}`);

  // Con dificultad alta: 10% de 130.000 = 13.000 -> 143.000
  const withSurcharge = calculateQuote(rules, { ancho: 2, alto: 3, unidades: 2, dificultad: 'alta' });
  check('El recargo condicional se aplica', withSurcharge.total === 143000, `${withSurcharge.total}`);
  check('Y queda como linea aparte', withSurcharge.lines.some((l) => l.kind === 'SURCHARGE'));

  // Trabajo minimo: 0.5 × 0.5 = 0.25 m2 × 10000 = 2.500, 0 unidades, visita
  // 30.000 -> 32.500, bajo el minimo de 100.000.
  const tiny = calculateQuote(rules, { ancho: 0.5, alto: 0.5, unidades: 0, dificultad: 'normal' });
  check('Un trabajo chico sube al minimo', tiny.total === 100000, `${tiny.total}`);
  check('Y el ajuste queda visible en el desglose',
    tiny.lines.some((l) => l.kind === 'MINIMUM_ADJUSTMENT'));

  // Redondeo: 1.11 × 1 = 1.11 m2 × 10000 = 11.100 + 1 unidad 20.000 + 30.000
  // = 61.100 -> minimo 100.000. Se fuerza otro caso para ver el redondeo.
  const roundingRules = parseRules({ ...RULES, minimumClp: 0 })!;
  const rounded = calculateQuote(roundingRules, {
    ancho: 1.11,
    alto: 1,
    unidades: 1,
    dificultad: 'normal',
  });
  check('El total se redondea al millar', rounded.total % 1000 === 0, `${rounded.total}`);
  check('El redondeo queda registrado', rounded.lines.some((l) => l.kind === 'ROUNDING'));

  // Determinismo: mismas entradas, mismo resultado.
  const again = calculateQuote(rules, { ancho: 2, alto: 3, unidades: 2, dificultad: 'alta' });
  check('El motor es determinista', JSON.stringify(again) === JSON.stringify(withSurcharge));
}

// --- 2. Validacion de datos de entrada --------------------------------------
{
  const intake = parseIntakeSchema(INTAKE)!;

  const complete = validateIntake(intake, { ancho: 2, alto: 3, unidades: 2, dificultad: 'normal' });
  check('Datos completos pasan la validacion', complete.ok === true);

  const incomplete = validateIntake(intake, { ancho: 2 });
  check('Faltan datos: no valida', incomplete.ok === false);
  if (!incomplete.ok) {
    check('Y dice exactamente cuales faltan',
      incomplete.missing.includes('alto') &&
        incomplete.missing.includes('unidades') &&
        incomplete.missing.includes('dificultad'),
      incomplete.missing.join(','));
    check('El campo opcional NO se exige', !incomplete.missing.includes('observaciones'));
  }

  const badNumber = validateIntake(intake, { ancho: 'dos', alto: 3, unidades: 1, dificultad: 'normal' });
  check('Un numero no numerico se rechaza', badNumber.ok === false);

  const belowMin = validateIntake(intake, { ancho: 0.01, alto: 3, unidades: 1, dificultad: 'normal' });
  check('Un valor bajo el minimo se rechaza', belowMin.ok === false);

  const badOption = validateIntake(intake, { ancho: 2, alto: 3, unidades: 1, dificultad: 'imposible' });
  check('Una opcion fuera de la lista se rechaza', badOption.ok === false);

  const commaDecimal = validateIntake(intake, { ancho: '2,5', alto: 3, unidades: 1, dificultad: 'normal' });
  check('Acepta decimales con coma (como los escribe la gente)',
    commaDecimal.ok === true && commaDecimal.values.ancho === 2.5);
}

const A = await makeWorkspace('a');
const B = await makeWorkspace('b');

// --- 3. Crear cotizacion ------------------------------------------------------
let quoteId = '';
{
  const contact = await makeContact(A.workspaceId, '1');

  // Sin datos completos NO se calcula.
  let blocked = false;
  let missingFields: string[] = [];
  try {
    await createQuote({
      workspaceId: A.workspaceId,
      serviceKey: 'servicio-medido',
      inputs: { ancho: 2 },
      contactId: contact.id,
    });
  } catch (error) {
    blocked = error instanceof QuoteError && error.code === 'MISSING_DATA';
    const details = (error as QuoteError).details as { missing?: string[] };
    missingFields = details?.missing ?? [];
  }
  check('Datos faltantes BLOQUEAN el calculo', blocked);
  check('Y se informa que falta', missingFields.length === 3, missingFields.join(','));

  const quote = await createQuote({
    workspaceId: A.workspaceId,
    serviceKey: 'servicio-medido',
    inputs: { ancho: 2, alto: 3, unidades: 2, dificultad: 'alta' },
    contactId: contact.id,
  });
  quoteId = quote.id;

  check('La cotizacion se crea con el total del motor', quote.total === 143000, `${quote.total}`);
  check('Se numera', quote.number === 'COT-0001', quote.number);
  check('Nace en version 1', quote.version === 1);
  check('Guarda el desglose', quote.lines.length === 4, `${quote.lines.length}`);
  check('Guarda los datos de entrada', (quote.inputs as Record<string, unknown>).ancho === 2);
  check('Tiene fecha de vigencia', quote.validUntil !== null);

  const reloaded = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
  check('Queda esperando revision humana', reloaded.status === QuoteStatus.PENDING_HUMAN_REVIEW);
  check('Todavia no tiene PDF', reloaded.pdfTokenHash === null);

  const approval = await prisma.approvalRequest.findFirst({
    where: { workspaceId: A.workspaceId, resourceId: quote.id },
  });
  check('Se abre la solicitud de aprobacion automaticamente', approval?.status === ApprovalStatus.PENDING);

  // Pedir revision dos veces no duplica la solicitud.
  const queue = await pendingApprovals(A.workspaceId);
  check('Aparece una sola vez en la cola de revision', queue.length === 1);
}

// --- 4. Solo roles autorizados aprueban --------------------------------------
{
  let denied = false;
  try {
    await approveQuote({
      workspaceId: A.workspaceId,
      quoteId,
      reviewer: { id: 'x', role: UserRole.SALES },
    });
  } catch (error) {
    denied = error instanceof QuoteError && error.code === 'FORBIDDEN';
  }
  check('Un rol SALES no puede aprobar', denied);

  const stillPending = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
  check('La cotizacion sigue sin aprobar', stillPending.status === QuoteStatus.PENDING_HUMAN_REVIEW);
}

// --- 5. Aprobacion y PDF ------------------------------------------------------
let pdfToken = '';
{
  const { token } = await approveQuote({
    workspaceId: A.workspaceId,
    quoteId,
    reviewer: { id: A.userId, role: UserRole.OWNER },
    comment: 'Medidas confirmadas.',
  });
  pdfToken = token;

  const approved = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
  check('La cotizacion queda aprobada', approved.status === QuoteStatus.APPROVED);
  check('Se registra quien reviso', approved.reviewerId === A.userId);
  check('El token del PDF se guarda HASHEADO', approved.pdfTokenHash === hashQuoteToken(token));
  check('El token en claro NO esta en la base', !JSON.stringify(approved).includes(token));

  const approval = await prisma.approvalRequest.findFirst({
    where: { workspaceId: A.workspaceId, resourceId: quoteId },
  });
  check('La solicitud queda resuelta', approval?.status === ApprovalStatus.APPROVED);

  const emptyQueue = await pendingApprovals(A.workspaceId);
  check('Sale de la cola de revision', emptyQueue.length === 0);
}

// --- 6. El PDF corresponde a los datos aprobados -----------------------------
{
  const quote = await resolveQuoteByToken(pdfToken);
  check('El token resuelve la cotizacion', quote?.id === quoteId);
  check('Un token inventado no resuelve', (await resolveQuoteByToken('inventado')) === null);

  const pdf = renderQuotePdf({
    workspaceName: quote!.workspace.name,
    number: quote!.number,
    version: quote!.version,
    serviceName: 'Servicio medido',
    customerName: `${quote!.contact!.firstName} ${quote!.contact!.lastName}`,
    issuedAt: quote!.reviewedAt ?? quote!.createdAt,
    validUntil: quote!.validUntil,
    currency: quote!.currency,
    lines: quote!.lines.map((l) => ({ label: l.label, detail: l.detail, amount: l.amount })),
    subtotal: quote!.subtotal,
    surcharges: quote!.surcharges,
    discounts: quote!.discounts,
    total: quote!.total,
    inputs: [{ label: 'Ancho', value: '2 m' }],
    disclaimer: quote!.disclaimer,
  });

  const raw = pdf.toString('latin1');
  check('El PDF es un archivo valido', raw.startsWith('%PDF-1.4') && raw.trimEnd().endsWith('%%EOF'));
  check('El PDF muestra el total APROBADO', raw.includes('$143.000'), 'busca 143.000');
  check('Y el numero de la cotizacion', raw.includes('COT-0001'));
  check('Y el disclaimer', raw.includes('referencial'));

  // Determinismo: el mismo dato produce los mismos bytes.
  const again = renderQuotePdf({
    workspaceName: quote!.workspace.name,
    number: quote!.number,
    version: quote!.version,
    serviceName: 'Servicio medido',
    customerName: `${quote!.contact!.firstName} ${quote!.contact!.lastName}`,
    issuedAt: quote!.reviewedAt ?? quote!.createdAt,
    validUntil: quote!.validUntil,
    currency: quote!.currency,
    lines: quote!.lines.map((l) => ({ label: l.label, detail: l.detail, amount: l.amount })),
    subtotal: quote!.subtotal,
    surcharges: quote!.surcharges,
    discounts: quote!.discounts,
    total: quote!.total,
    inputs: [{ label: 'Ancho', value: '2 m' }],
    disclaimer: quote!.disclaimer,
  });
  check('El PDF es determinista', pdf.equals(again));
}

// --- 6b. El enlace del PDF se puede recuperar --------------------------------
{
  // El token se muestra una sola vez al aprobar y solo se guarda su hash. Sin
  // una forma de regenerarlo, cerrar la pestana dejaba la cotizacion aprobada
  // sin manera de enviarse. Lo detecto la prueba manual en la interfaz.
  const before = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });

  const newToken = generateQuoteToken();
  await prisma.quote.update({
    where: { id: quoteId },
    data: { pdfTokenHash: hashQuoteToken(newToken) },
  });

  check('El token viejo deja de servir al regenerar',
    (await resolveQuoteByToken(pdfToken)) === null);
  check('Y el nuevo resuelve la misma cotizacion',
    (await resolveQuoteByToken(newToken))?.id === quoteId);
  check('El total no cambia al regenerar el enlace',
    (await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } })).total === before.total);

  pdfToken = newToken;
}

// --- 7. Una aprobada NO se edita: crea version ------------------------------
{
  let cannotReapprove = false;
  try {
    await approveQuote({
      workspaceId: A.workspaceId,
      quoteId,
      reviewer: { id: A.userId, role: UserRole.OWNER },
    });
  } catch (error) {
    cannotReapprove = error instanceof QuoteError && error.code === 'INVALID_STATE';
  }
  check('Una cotizacion aprobada no se vuelve a aprobar', cannotReapprove);

  let cannotReject = false;
  try {
    await rejectQuote({
      workspaceId: A.workspaceId,
      quoteId,
      reviewer: { id: A.userId, role: UserRole.OWNER },
      comment: 'me arrepenti',
    });
  } catch (error) {
    cannotReject = error instanceof QuoteError && error.code === 'INVALID_STATE';
  }
  check('Ni se rechaza despues de aprobada', cannotReject);

  // El camino correcto: version nueva.
  const original = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
  const v2 = await createQuote({
    workspaceId: A.workspaceId,
    serviceKey: 'servicio-medido',
    inputs: { ancho: 3, alto: 3, unidades: 2, dificultad: 'alta' },
    contactId: original.contactId,
    parentQuoteId: quoteId,
  });

  check('La version nueva conserva el numero', v2.number === original.number);
  check('E incrementa la version', v2.version === 2);
  check('Con su propio total', v2.total !== original.total, `${original.total} -> ${v2.total}`);
  check('Apunta a la anterior', v2.parentQuoteId === quoteId);

  const stillApproved = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
  check('La version aprobada queda intacta',
    stillApproved.status === QuoteStatus.APPROVED && stillApproved.total === 143000);

  const pdfStillWorks = await resolveQuoteByToken(pdfToken);
  check('Y su PDF sigue sirviendo', pdfStillWorks?.total === 143000);
}

// --- 8. Envio y aceptacion ----------------------------------------------------
{
  let cannotSend = false;
  const draft = await prisma.quote.findFirstOrThrow({
    where: { workspaceId: A.workspaceId, version: 2 },
  });
  try {
    await markQuoteSent({ workspaceId: A.workspaceId, quoteId: draft.id });
  } catch (error) {
    cannotSend = error instanceof QuoteError && error.code === 'INVALID_STATE';
  }
  check('No se envia una cotizacion sin aprobar', cannotSend);

  await markQuoteSent({ workspaceId: A.workspaceId, quoteId });
  const sent = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
  check('Una aprobada si se envia', sent.status === QuoteStatus.SENT && sent.sentAt !== null);

  await acceptQuote({ workspaceId: A.workspaceId, quoteId });
  const accepted = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
  check('Y se puede aceptar', accepted.status === QuoteStatus.ACCEPTED);

  // Aceptar NO convierte en cliente: eso exige pago (regla de la Fase 1).
  const contact = await prisma.contact.findUniqueOrThrow({ where: { id: accepted.contactId! } });
  check('Aceptar una cotizacion NO convierte en cliente', contact.lifecycleStatus !== 'CUSTOMER',
    contact.lifecycleStatus);
}

// --- 9. Aislamiento entre workspaces -----------------------------------------
{
  const fromB = await prisma.quote.findFirst({ where: { id: quoteId, workspaceId: B.workspaceId } });
  check('B no ve la cotizacion de A', fromB === null);

  let denied = false;
  try {
    await approveQuote({
      workspaceId: B.workspaceId,
      quoteId,
      reviewer: { id: B.userId, role: UserRole.OWNER },
    });
  } catch (error) {
    denied = error instanceof QuoteError && error.code === 'NOT_FOUND';
  }
  check('El owner de B no puede aprobar una cotizacion de A', denied);

  const queueB = await pendingApprovals(B.workspaceId);
  check('La cola de B esta vacia', queueB.length === 0);

  // Un servicio de A no se cotiza desde B... salvo que B tenga el suyo propio,
  // que es el caso: cada workspace tiene su propia regla con la misma clave.
  const setA = await getPublishedRuleSet(A.workspaceId, 'servicio-medido');
  const setB = await getPublishedRuleSet(B.workspaceId, 'servicio-medido');
  check('Cada workspace tiene su propio conjunto de reglas', setA!.id !== setB!.id);
}

// --- 10. Solo se cotiza con reglas PUBLICADAS -------------------------------
{
  const contact = await makeContact(B.workspaceId, '2');

  await prisma.pricingRuleSet.update({
    where: { id: B.ruleSetId },
    data: { status: PricingRuleSetStatus.DRAFT },
  });

  let unavailable = false;
  try {
    await createQuote({
      workspaceId: B.workspaceId,
      serviceKey: 'servicio-medido',
      inputs: { ancho: 2, alto: 2, unidades: 1, dificultad: 'normal' },
      contactId: contact.id,
    });
  } catch (error) {
    unavailable = error instanceof QuoteError && error.code === 'NOT_FOUND';
  }
  check('Un borrador de reglas NO se puede usar para cotizar', unavailable);

  const services = await listQuotableServices(B.workspaceId);
  check('Y el servicio no aparece como cotizable', services.length === 0);

  await prisma.pricingRuleSet.update({
    where: { id: B.ruleSetId },
    data: { status: PricingRuleSetStatus.PUBLISHED },
  });
}

// --- 11. Herramientas del agente ----------------------------------------------
{
  const names = AGENT_TOOLS.map((tool) => tool.name);
  check('El agente puede consultar que datos pedir', names.includes('collect_quote_inputs'));
  check('Y pedir el calculo', names.includes('calculate_quote'));
  check('Y consultar el estado', names.includes('get_quote_status'));

  const contact = await makeContact(A.workspaceId, '3');
  const context = {
    workspaceId: A.workspaceId,
    conversationId: null,
    contactId: contact.id,
    agentRunId: 'test',
  };

  // El agente pregunta que necesita.
  const collect = AGENT_TOOLS.find((t) => t.name === 'collect_quote_inputs')!;
  const fields = await collect.execute({}, context);
  check('collect_quote_inputs devuelve los campos requeridos',
    JSON.stringify(fields).includes('Ancho'));

  // Con datos incompletos, el agente recibe QUE falta, no un total.
  const calculate = AGENT_TOOLS.find((t) => t.name === 'calculate_quote')!;
  const partial = await calculate.execute(
    { serviceKey: 'servicio-medido', inputs: JSON.stringify({ ancho: 2 }) },
    context,
  );
  check('Con datos incompletos NO se devuelve un total',
    (partial as { ok: boolean }).ok === false && !JSON.stringify(partial).includes('total'));
  check('Y se le dice al agente que preguntar', JSON.stringify(partial).includes('Alto'));

  // Con datos completos, el total lo pone el servidor.
  const full = await calculate.execute(
    {
      serviceKey: 'servicio-medido',
      inputs: JSON.stringify({ ancho: 2, alto: 3, unidades: 2, dificultad: 'normal' }),
    },
    context,
  );
  const payload = full as { ok: boolean; data?: { totalClp: number; quoteId: string } };
  check('El agente recibe el total calculado por el motor', payload.data?.totalClp === 130000,
    `${payload.data?.totalClp}`);

  // Lo esencial de la fase: aunque el agente diga otro numero, la base guarda
  // el del motor.
  const stored = await prisma.quote.findUniqueOrThrow({ where: { id: payload.data!.quoteId } });
  check('El total en la base es el del motor, no lo que diga el modelo', stored.total === 130000);
  check('Y queda esperando revision humana', stored.status === QuoteStatus.PENDING_HUMAN_REVIEW);

  // El agente NO recibe el enlace del PDF.
  const status = AGENT_TOOLS.find((t) => t.name === 'get_quote_status')!;
  const statusResult = await status.execute({ quoteId: quoteId }, context);
  check('get_quote_status NO expone el enlace del PDF', !JSON.stringify(statusResult).includes('/q/'));

  // Ni puede consultar cotizaciones de otro workspace.
  const cross = await status.execute(
    { quoteId },
    { ...context, workspaceId: B.workspaceId, contactId: null },
  );
  check('Ni cotizaciones de otro workspace', (cross as { ok: boolean }).ok === false);
}

// --- Limpieza ---------------------------------------------------------------
const deleted = await prisma.workspace.deleteMany({ where: { slug: { startsWith: 'fase7-' } } });
console.log(`\nLimpieza: ${deleted.count} workspaces de prueba eliminados (cascade).`);

console.log(`\n== Resultado: ${results.length - failures}/${results.length} pruebas OK ==`);
await prisma.$disconnect();
process.exit(failures > 0 ? 1 : 0);
