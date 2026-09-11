/**
 * Pruebas de aceptacion de la Fase 9 (onboarding, planes y consumo).
 *
 * Lo que la fase tiene que demostrar:
 *   - un workspace nuevo puede quedar operativo con onboarding guiado, sin
 *     cambios de codigo especificos
 *   - el avance del wizard refleja el estado REAL, no una casilla guardada
 *   - los limites del plan limitan de verdad: contactos, IA, email y campanas
 *   - las capacidades del plan cierran funciones completas
 *   - ningun cupo es ilimitado
 *
 * Uso, desde apps/crm:
 *   pnpm exec tsx scripts/smoke-fase9.ts
 */
import 'dotenv/config';
import {
  ActivationStatus,
  AgentRunStatus,
  BusinessType,
  ConsentChannel,
  EmailDomainStatus,
  EmailTemplateStatus,
  JourneyStatus,
  JourneyStepAction,
  JourneyTrigger,
  SendCategory,
  SubscriptionStatus,
  UserRole,
  WhatsAppChannelStatus,
} from '../generated/prisma/client';
import { prisma } from '../src/lib/prisma';
import { createCustomerWorkspace, ensureBetaPlans } from '../src/lib/subscription';
import { grantConsent } from '../src/lib/domain/consent';
import {
  ALLOWANCE_METRICS,
  BETA_PLANS,
  parseAllowances,
  planTerms,
  PLAN_CAPABILITIES,
} from '../src/lib/billing/plans';
import {
  checkAllowance,
  currentPeriod,
  getEntitlements,
  hasCapability,
  recordUsage,
  usageSummary,
  usedFor,
} from '../src/lib/billing/usage';
import { openAlerts, raiseAlert, resolveAlert, scanWorkspaceHealth } from '../src/lib/billing/alerts';
import { getOnboardingState } from '../src/lib/onboarding/steps';
import {
  activateWorkspace,
  ActivationError,
  isWorkspaceActive,
  suspendWorkspace,
} from '../src/lib/onboarding/activation';
import { sendEmail } from '../src/lib/email/send';
import { buildRecipients, CampaignError } from '../src/lib/marketing/campaigns';
import { createScriptedProvider, clearScriptedOutbox } from '../src/lib/email/scripted';
import { createQuote, QuoteError } from '../src/lib/quotes/service';
import { advanceEnrollment, enroll } from '../src/lib/marketing/journeys';
import { runAgent } from '../src/lib/agents/runner';
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
    companyName: `fase9-${suffix}-${stamp}`,
    ownerName: 'Owner Fase9',
    email: `owner-${suffix}-${stamp}@fase9.test`,
    password: 'contrasena-de-prueba-1234',
  });

  return { workspaceId: created.workspace.id, userId: created.user.id };
}

/** Cambia el plan del workspace sin pasar por el pago. Solo para pruebas. */
async function setPlan(
  workspaceId: string,
  terms: { capabilities: string[]; allowances: Record<string, number>; overages?: Record<string, number> },
) {
  const plan = await prisma.subscriptionPlan.upsert({
    where: { key: `prueba-${workspaceId}` },
    create: {
      key: `prueba-${workspaceId}`,
      name: 'Plan de prueba',
      priceClp: 1000,
      maxUsers: terms.allowances.users ?? 5,
      maxContacts: terms.allowances.contacts ?? 100,
      capabilities: terms.capabilities,
      allowances: terms.allowances,
      overages: terms.overages ?? {},
    },
    update: {
      capabilities: terms.capabilities,
      allowances: terms.allowances,
      overages: terms.overages ?? {},
      maxUsers: terms.allowances.users ?? 5,
      maxContacts: terms.allowances.contacts ?? 100,
    },
  });

  await prisma.workspaceSubscription.updateMany({
    where: { workspaceId },
    data: { planId: plan.id, status: SubscriptionStatus.ACTIVE, trialEndsAt: null },
  });

  return plan;
}

const A = await makeWorkspace('a');
const B = await makeWorkspace('b');

// =============================================================================
console.log('\n== Planes: capacidades y cupos ==');
// =============================================================================
{
  const plans = await ensureBetaPlans();
  check('Se siembran los planes de la beta', plans.length >= 3);

  // Regla de la spec: nunca ilimitado.
  const sinLimite = BETA_PLANS.filter((plan) =>
    ALLOWANCE_METRICS.some((metric) => plan.allowances[metric] === undefined),
  );
  check(
    'Ningun plan deja una metrica sin declarar',
    sinLimite.length === 0,
    sinLimite.map((p) => p.key).join(', '),
  );

  const infinitos = BETA_PLANS.filter((plan) =>
    Object.values(plan.allowances).some((value) => value === null || value === Infinity),
  );
  check('Ningun cupo es ilimitado', infinitos.length === 0);

  // Las capacidades declaradas existen.
  const desconocidas = BETA_PLANS.flatMap((plan) =>
    plan.capabilities.filter((capability) => !PLAN_CAPABILITIES.includes(capability)),
  );
  check('Todas las capacidades declaradas son validas', desconocidas.length === 0);

  // Un plan barato no incluye Shopify; uno caro si.
  const inicial = BETA_PLANS.find((plan) => plan.key === 'beta-inicial')!;
  const completo = BETA_PLANS.find((plan) => plan.key === 'beta-completo')!;
  check('El plan de arranque no incluye Shopify', !inicial.capabilities.includes('SHOPIFY'));
  check('El plan completo si', completo.capabilities.includes('SHOPIFY'));

  // Una definicion corrupta no rompe: se ignora lo invalido.
  check('Un JSON de cupos invalido no rompe la lectura',
    Object.keys(parseAllowances({ inventado: 5 })).length === 0);
  check('Un JSON nulo devuelve cupos vacios', Object.keys(parseAllowances(null)).length === 0);

  // `maxContacts` heredado sigue mandando si el JSON no lo dice.
  const legado = await prisma.subscriptionPlan.create({
    data: { key: `legado-${stamp}`, name: 'Legado', priceClp: 1, maxUsers: 2, maxContacts: 77 },
  });
  check('Un plan sin JSON conserva su cupo de contactos anterior',
    planTerms(legado).allowances.contacts === 77);
}

// =============================================================================
console.log('\n== Onboarding: el avance se calcula, no se guarda ==');
// =============================================================================
{
  const state = await getOnboardingState(A.workspaceId);

  check('Un workspace nuevo arranca en ONBOARDING', state.status === ActivationStatus.ONBOARDING);
  check('Con los 10 pasos de la spec', state.steps.length === 10);
  check('Y no se puede activar todavia', !state.canActivate);
  check('Se dice exactamente que falta', state.blockers.length > 0, `${state.blockers.length} pendientes`);

  const tipo = state.steps.find((step) => step.key === 'tipo-negocio')!;
  check('El tipo de negocio empieza sin definir', !tipo.done);

  // Al guardarlo, el paso pasa a hecho SIN tocar ningun contador.
  await prisma.workspaceProfile.update({
    where: { workspaceId: A.workspaceId },
    data: { businessType: BusinessType.SERVICES },
  });

  const tras = await getOnboardingState(A.workspaceId);
  check(
    'Definir el tipo lo marca como hecho, sin guardar ninguna casilla',
    tras.steps.find((step) => step.key === 'tipo-negocio')?.done === true,
  );

  // Lo esencial: deshacer el estado real vuelve a marcar el paso pendiente.
  await prisma.workspaceProfile.update({
    where: { workspaceId: A.workspaceId },
    data: { businessType: BusinessType.UNDEFINED },
  });

  const revertido = await getOnboardingState(A.workspaceId);
  check(
    'Y deshacerlo lo vuelve a marcar pendiente: el wizard no puede mentir',
    revertido.steps.find((step) => step.key === 'tipo-negocio')?.done === false,
  );

  // Lo que exige el wizard depende del tipo de negocio, no de un rubro.
  await prisma.workspaceProfile.update({
    where: { workspaceId: A.workspaceId },
    data: { businessType: BusinessType.SERVICES },
  });
  const servicios = await getOnboardingState(A.workspaceId);
  const catalogoServicios = servicios.steps.find((step) => step.key === 'catalogo')!;
  check(
    'Un negocio de servicios necesita reglas de precio publicadas',
    (catalogoServicios.hint ?? '').includes('cotizable'),
  );

  await prisma.workspaceProfile.update({
    where: { workspaceId: A.workspaceId },
    data: { businessType: BusinessType.ECOMMERCE },
  });
  const ecommerce = await getOnboardingState(A.workspaceId);
  const catalogoEcommerce = ecommerce.steps.find((step) => step.key === 'catalogo')!;
  check(
    'Un ecommerce necesita productos o Shopify',
    (catalogoEcommerce.hint ?? '').includes('productos'),
  );

  // El paso de email solo es obligatorio si el plan lo incluye.
  await setPlan(A.workspaceId, {
    capabilities: ['WHATSAPP', 'AI_AGENTS'],
    allowances: { users: 5, contacts: 100, whatsapp_numbers: 1, conversations: 10, ai_cost_clp: 1000, emails: 0, campaign_contacts: 0 },
  });

  const sinEmail = await getOnboardingState(A.workspaceId);
  check(
    'Sin email en el plan, ese paso no es obligatorio',
    sinEmail.steps.find((step) => step.key === 'email')?.required === false,
  );

  await setPlan(A.workspaceId, {
    capabilities: ['WHATSAPP', 'AI_AGENTS', 'EMAIL', 'CAMPAIGNS', 'QUOTES', 'PAYMENTS', 'SHOPIFY'],
    allowances: { users: 5, contacts: 100, whatsapp_numbers: 1, conversations: 10, ai_cost_clp: 1000, emails: 50, campaign_contacts: 50 },
  });

  const conEmail = await getOnboardingState(A.workspaceId);
  check(
    'Con email en el plan si lo es',
    conEmail.steps.find((step) => step.key === 'email')?.required === true,
  );
}

// =============================================================================
console.log('\n== Activacion ==');
// =============================================================================
{
  // Activar con pasos pendientes tiene que fallar y decir cuales.
  let incompleto: ActivationError | null = null;
  try {
    await activateWorkspace({ workspaceId: A.workspaceId, actorId: A.userId, role: UserRole.OWNER });
  } catch (error) {
    incompleto = error instanceof ActivationError ? error : null;
  }

  check('No se activa con pasos obligatorios pendientes', incompleto?.code === 'INCOMPLETE');
  check('Y se devuelve la lista de lo que falta', (incompleto?.blockers.length ?? 0) > 0);

  // Se completan todos los pasos obligatorios con estado REAL.
  await prisma.workspaceProfile.update({
    where: { workspaceId: A.workspaceId },
    data: {
      businessType: BusinessType.ECOMMERCE,
      about: 'Tienda de prueba de la Fase 9.',
      policies: 'Despacho en 48 horas, cambios dentro de 10 dias.',
    },
  });

  await prisma.whatsAppChannel.create({
    data: {
      workspaceId: A.workspaceId,
      wabaId: `waba-${stamp}`,
      phoneNumberId: `phone-${stamp}`,
      displayPhoneNumber: '+56900000000',
      status: WhatsAppChannelStatus.CONNECTED,
    },
  });

  await prisma.product.create({
    data: { workspaceId: A.workspaceId, name: 'Producto de prueba' },
  });

  await prisma.integration.updateMany({
    where: { workspaceId: A.workspaceId, provider: 'MERCADO_PAGO' },
    data: { status: 'CONNECTED' },
  });

  await prisma.emailDomain.create({
    data: {
      workspaceId: A.workspaceId,
      domain: 'envios.fase9.test',
      status: EmailDomainStatus.VERIFIED,
      fromEmail: 'hola@envios.fase9.test',
      verifiedAt: new Date(),
    },
  });

  const agent = await prisma.agentDefinition.findFirstOrThrow({
    where: { workspaceId: A.workspaceId },
    include: { versions: true },
  });

  await prisma.agentVersion.update({
    where: { id: agent.versions[0].id },
    data: { status: 'PUBLISHED', publishedAt: new Date() },
  });

  await prisma.agentRun.create({
    data: {
      workspaceId: A.workspaceId,
      agentDefinitionId: agent.id,
      agentVersionId: agent.versions[0].id,
      status: AgentRunStatus.COMPLETED,
      trigger: 'simulador',
    },
  });

  const listo = await getOnboardingState(A.workspaceId);
  check('Con todo conectado, el wizard deja activar', listo.canActivate, listo.blockers.join(' · '));

  // Solo el owner activa.
  let forbidden: ActivationError | null = null;
  try {
    await activateWorkspace({ workspaceId: A.workspaceId, actorId: A.userId, role: UserRole.SALES });
  } catch (error) {
    forbidden = error instanceof ActivationError ? error : null;
  }
  check('Un usuario de ventas no puede activar', forbidden?.code === 'FORBIDDEN');

  const activation = await activateWorkspace({
    workspaceId: A.workspaceId,
    actorId: A.userId,
    role: UserRole.OWNER,
  });

  check('El owner si', activation.status === ActivationStatus.ACTIVE);
  check('Y queda registrado quien y cuando', activation.activatedById === A.userId);
  check('El workspace figura activo', await isWorkspaceActive(A.workspaceId));

  const auditoria = await prisma.auditLog.findFirst({
    where: { workspaceId: A.workspaceId, action: 'workspace.activated' },
  });
  check('La activacion queda auditada', auditoria !== null);

  // Activar dos veces no es un error silencioso.
  let repetido: ActivationError | null = null;
  try {
    await activateWorkspace({ workspaceId: A.workspaceId, actorId: A.userId, role: UserRole.OWNER });
  } catch (error) {
    repetido = error instanceof ActivationError ? error : null;
  }
  check('Activar dos veces avisa en vez de fingir', repetido?.code === 'ALREADY_ACTIVE');

  // Suspender es reversible y no borra nada.
  const contactosAntes = await prisma.contact.count({ where: { workspaceId: A.workspaceId } });
  await suspendWorkspace({
    workspaceId: A.workspaceId,
    actorId: A.userId,
    role: UserRole.OWNER,
    note: 'prueba',
  });

  check('Suspender apaga el workspace', !(await isWorkspaceActive(A.workspaceId)));
  check(
    'Pero no borra los datos',
    (await prisma.contact.count({ where: { workspaceId: A.workspaceId } })) === contactosAntes,
  );

  await activateWorkspace({ workspaceId: A.workspaceId, actorId: A.userId, role: UserRole.OWNER });
  check('Y se puede volver a activar', await isWorkspaceActive(A.workspaceId));
}

// =============================================================================
console.log('\n== Consumo: detalle y contador ==');
// =============================================================================
{
  const period = currentPeriod();

  await recordUsage({
    workspaceId: A.workspaceId,
    provider: 'openai',
    metric: 'ai_cost_clp',
    quantity: 500,
    costClp: 1200,
    referenceType: 'AgentRun',
    referenceId: 'x',
  });

  const detalle = await prisma.usageRecord.count({
    where: { workspaceId: A.workspaceId, metric: 'ai_cost_clp' },
  });
  check('Se guarda el detalle auditable', detalle === 1);

  const contador = await prisma.usageCounter.findUniqueOrThrow({
    where: { workspaceId_period_metric: { workspaceId: A.workspaceId, period, metric: 'ai_cost_clp' } },
  });
  check('Y el contador del periodo', contador.costClp === 1200 && contador.quantity === 500);

  await recordUsage({
    workspaceId: A.workspaceId,
    provider: 'openai',
    metric: 'ai_cost_clp',
    quantity: 300,
    costClp: 800,
  });

  const acumulado = await prisma.usageCounter.findUniqueOrThrow({
    where: { workspaceId_period_metric: { workspaceId: A.workspaceId, period, metric: 'ai_cost_clp' } },
  });
  check('El contador acumula, no reemplaza', acumulado.costClp === 2000);

  check('El costo de IA se mide en pesos', (await usedFor(A.workspaceId, 'ai_cost_clp')) === 2000);

  // Los contactos son existencias: se cuentan en vivo.
  await prisma.contact.create({
    data: { workspaceId: A.workspaceId, firstName: 'Uso', lastName: 'Uno', email: `uso1-${stamp}@t.test` },
  });
  const contactos = await usedFor(A.workspaceId, 'contacts');
  check('Los contactos se cuentan en vivo, no por contador', contactos >= 1);

  // Un workspace no ve el consumo de otro.
  const deB = await usedFor(B.workspaceId, 'ai_cost_clp');
  check('El consumo no cruza entre workspaces', deB === 0);

  const resumen = await usageSummary(A.workspaceId);
  check('El resumen trae todos los cupos del plan', (resumen?.allowances.length ?? 0) > 0);
  check('Y el costo variable del periodo', resumen?.costClp === 2000, `${resumen?.costClp}`);
}

// =============================================================================
console.log('\n== Los limites limitan de verdad ==');
// =============================================================================
{
  // --- Contactos ---
  await setPlan(A.workspaceId, {
    capabilities: ['WHATSAPP', 'AI_AGENTS', 'EMAIL', 'CAMPAIGNS', 'QUOTES', 'PAYMENTS'],
    allowances: { users: 5, contacts: 2, whatsapp_numbers: 1, conversations: 10, ai_cost_clp: 1000, emails: 2, campaign_contacts: 2 },
  });

  const contactos = await prisma.contact.count({ where: { workspaceId: A.workspaceId } });

  // El cupo se ajusta a los contactos que ya hay: asi la prueba mide el limite
  // y no cuantos contactos dejaron los bloques anteriores.
  await setPlan(A.workspaceId, {
    capabilities: ['WHATSAPP', 'AI_AGENTS', 'EMAIL', 'CAMPAIGNS', 'QUOTES', 'PAYMENTS'],
    allowances: { users: 5, contacts: contactos + 1, whatsapp_numbers: 1, conversations: 10, ai_cost_clp: 1000, emails: 2, campaign_contacts: 2 },
  });

  const cabeUno = await checkAllowance({ workspaceId: A.workspaceId, metric: 'contacts' });
  check('Con cupo disponible, cabe un contacto mas', cabeUno.allowed,
    `${cabeUno.used} de ${cabeUno.limit}`);

  await prisma.contact.create({
    data: {
      workspaceId: A.workspaceId,
      firstName: 'Tope',
      lastName: 'Contactos',
      email: `tope-${stamp}@t.test`,
    },
  });

  const cupoContactos = await checkAllowance({ workspaceId: A.workspaceId, metric: 'contacts' });

  check(
    'Al llegar al cupo, no cabe uno mas',
    !cupoContactos.allowed,
    `${cupoContactos.used} de ${cupoContactos.limit}`,
  );

  // Borrar libera cupo: los contactos son existencias, no consumo del mes.
  const ultimo = await prisma.contact.findFirstOrThrow({
    where: { workspaceId: A.workspaceId },
    orderBy: { createdAt: 'desc' },
  });
  await prisma.contact.delete({ where: { id: ultimo.id } });

  const liberado = await checkAllowance({ workspaceId: A.workspaceId, metric: 'contacts' });
  check('Borrar un contacto libera cupo', liberado.allowed);

  // --- IA: el agente no corre sin cupo ---
  await prisma.usageCounter.upsert({
    where: {
      workspaceId_period_metric: {
        workspaceId: A.workspaceId,
        period: currentPeriod(),
        metric: 'ai_cost_clp',
      },
    },
    create: { workspaceId: A.workspaceId, period: currentPeriod(), metric: 'ai_cost_clp', quantity: 0, costClp: 99999 },
    update: { costClp: 99999 },
  });

  const canal = await prisma.whatsAppChannel.findFirstOrThrow({ where: { workspaceId: A.workspaceId } });
  const contactoConv = await prisma.contact.findFirstOrThrow({ where: { workspaceId: A.workspaceId } });
  const conversacion = await prisma.conversation.create({
    data: {
      workspaceId: A.workspaceId,
      channelId: canal.id,
      contactId: contactoConv.id,
      mode: 'AI_ACTIVE',
      status: 'OPEN',
    },
  });

  const sinCupo = await runAgent({
    workspaceId: A.workspaceId,
    conversationId: conversacion.id,
    provider: new ScriptedProvider([{ text: 'hola' }]),
  });

  check(
    'Sin cupo de IA el agente no corre',
    sinCupo.status === AgentRunStatus.ABORTED && sinCupo.skippedReason === 'sin cupo de IA en el plan',
    sinCupo.skippedReason,
  );

  const aviso = await prisma.workspaceAlert.findFirst({
    where: { workspaceId: A.workspaceId, dedupeKey: 'allowance-exceeded:ai_cost_clp' },
  });
  check('Y se avisa en vez de fallar en silencio', aviso !== null);

  // El simulador SI puede correr: probar el agente es un paso del onboarding.
  const simulado = await runAgent({
    workspaceId: A.workspaceId,
    conversationId: conversacion.id,
    provider: new ScriptedProvider([{ text: 'hola' }]),
    dryRun: true,
  });
  check(
    'El simulador sigue funcionando sin cupo: probar es un paso previo',
    simulado.status !== AgentRunStatus.ABORTED || simulado.skippedReason !== 'sin cupo de IA en el plan',
    simulado.skippedReason ?? simulado.status,
  );

  // --- Email ---
  await prisma.usageCounter.deleteMany({ where: { workspaceId: A.workspaceId, metric: 'ai_cost_clp' } });

  clearScriptedOutbox();
  const provider = createScriptedProvider();
  const destinatario = await prisma.contact.findFirstOrThrow({ where: { workspaceId: A.workspaceId } });
  await grantConsent({
    workspaceId: A.workspaceId,
    contactId: destinatario.id,
    channel: ConsentChannel.EMAIL,
    source: 'prueba',
  });

  await prisma.messagingPolicy.update({
    where: { workspaceId: A.workspaceId },
    data: { quietStartMinute: 0, quietEndMinute: 0, maxEmailPerWeek: 50 },
  });

  await prisma.usageCounter.upsert({
    where: {
      workspaceId_period_metric: {
        workspaceId: A.workspaceId,
        period: currentPeriod(),
        metric: 'emails',
      },
    },
    create: { workspaceId: A.workspaceId, period: currentPeriod(), metric: 'emails', quantity: 99 },
    update: { quantity: 99 },
  });

  const sinCupoEmail = await sendEmail({
    workspaceId: A.workspaceId,
    contactId: destinatario.id,
    subject: 'Hola',
    bodyHtml: '<p>Hola</p>',
    bodyText: 'Hola',
    provider,
  });

  check(
    'Sin cupo de email, no sale nada promocional',
    sinCupoEmail.status === 'SKIPPED' && sinCupoEmail.reason === 'EMAIL_QUOTA_EXCEEDED',
    sinCupoEmail.status === 'SKIPPED' ? sinCupoEmail.reason : sinCupoEmail.status,
  );

  // Pero lo operacional si: un aviso de compra no es marketing.
  const operacional = await sendEmail({
    workspaceId: A.workspaceId,
    contactId: destinatario.id,
    category: SendCategory.OPERATIONAL,
    subject: 'Tu compra',
    bodyHtml: '<p>Listo</p>',
    bodyText: 'Listo',
    provider,
  });

  check('Un aviso operativo si sale aunque el cupo de marketing este agotado',
    operacional.status === 'SENT', operacional.status);

  await prisma.usageCounter.deleteMany({ where: { workspaceId: A.workspaceId, metric: 'emails' } });
}

// =============================================================================
console.log('\n== Capacidades del plan ==');
// =============================================================================
{
  // Plan sin cotizador ni campanas ni email.
  await setPlan(A.workspaceId, {
    capabilities: ['WHATSAPP', 'AI_AGENTS'],
    allowances: { users: 5, contacts: 500, whatsapp_numbers: 1, conversations: 100, ai_cost_clp: 5000, emails: 0, campaign_contacts: 0 },
  });

  check('El plan no incluye cotizador', !(await hasCapability(A.workspaceId, 'QUOTES')));
  check('Ni campanas', !(await hasCapability(A.workspaceId, 'CAMPAIGNS')));
  check('Pero si WhatsApp', await hasCapability(A.workspaceId, 'WHATSAPP'));

  let quoteError: QuoteError | null = null;
  try {
    await createQuote({
      workspaceId: A.workspaceId,
      serviceKey: 'lo-que-sea',
      inputs: {},
      contactId: null,
    });
  } catch (error) {
    quoteError = error instanceof QuoteError ? error : null;
  }
  check('Cotizar queda cerrado por plan', quoteError?.code === 'FORBIDDEN', quoteError?.message);

  // Campanas: cerrado por plan, antes de resolver el segmento.
  const template = await prisma.emailTemplate.create({
    data: {
      workspaceId: A.workspaceId,
      key: `cap-${stamp}`,
      name: 'x',
      subject: 'x',
      bodyHtml: '<p>x</p>',
      bodyText: 'x',
      status: EmailTemplateStatus.PUBLISHED,
      publishedAt: new Date(),
    },
  });

  const segmento = await prisma.segment.findFirstOrThrow({
    where: { workspaceId: A.workspaceId, key: 'leads-calientes-sin-compra' },
  });

  const campana = await prisma.campaign.create({
    data: {
      workspaceId: A.workspaceId,
      name: 'Campana sin plan',
      segmentId: segmento.id,
      templateId: template.id,
    },
  });

  let campaignError: CampaignError | null = null;
  try {
    await buildRecipients({ workspaceId: A.workspaceId, campaignId: campana.id });
  } catch (error) {
    campaignError = error instanceof CampaignError ? error : null;
  }
  check('Las campanas quedan cerradas por plan', campaignError?.code === 'PLAN_LIMIT');

  const destinatarios = await prisma.campaignRecipient.count({ where: { campaignId: campana.id } });
  check('Y no se materializo ningun destinatario', destinatarios === 0);

  // Email promocional: cerrado por plan.
  const contacto = await prisma.contact.findFirstOrThrow({ where: { workspaceId: A.workspaceId } });
  const sinPlan = await sendEmail({
    workspaceId: A.workspaceId,
    contactId: contacto.id,
    subject: 'x',
    bodyHtml: '<p>x</p>',
    bodyText: 'x',
    provider: createScriptedProvider(),
  });

  check(
    'El email promocional queda cerrado por plan',
    sinPlan.status === 'SKIPPED' && sinPlan.reason === 'PLAN_WITHOUT_EMAIL',
  );

  // Con el plan completo, las mismas acciones dejan de estar cerradas.
  await setPlan(A.workspaceId, {
    capabilities: ['WHATSAPP', 'AI_AGENTS', 'QUOTES', 'EMAIL', 'CAMPAIGNS', 'PAYMENTS', 'SHOPIFY'],
    allowances: { users: 5, contacts: 500, whatsapp_numbers: 1, conversations: 100, ai_cost_clp: 5000, emails: 100, campaign_contacts: 100 },
  });

  check('Con el plan completo el cotizador se habilita',
    await hasCapability(A.workspaceId, 'QUOTES'));

  const conPlan = await buildRecipients({ workspaceId: A.workspaceId, campaignId: campana.id });
  check('Y la campana ya puede armar su lista', conPlan.recipientCount >= 0);
}

// =============================================================================
console.log('\n== Suscripcion vencida ==');
// =============================================================================
{
  await prisma.workspaceSubscription.updateMany({
    where: { workspaceId: B.workspaceId },
    data: { status: SubscriptionStatus.PAST_DUE, trialEndsAt: new Date(Date.now() - 86_400_000) },
  });

  const entitlements = await getEntitlements(B.workspaceId);
  check('Una suscripcion vencida deja de estar activa', entitlements?.active === false);

  const cupo = await checkAllowance({ workspaceId: B.workspaceId, metric: 'contacts' });
  check('Y no deja consumir nada', !cupo.allowed && cupo.limit === 0);

  // Sin suscripcion tampoco.
  await prisma.workspaceSubscription.deleteMany({ where: { workspaceId: B.workspaceId } });
  const sinSuscripcion = await checkAllowance({ workspaceId: B.workspaceId, metric: 'contacts' });
  check('Quedarse sin plan no significa consumo libre', !sinSuscripcion.allowed);
  check('Ni capacidades', !(await hasCapability(B.workspaceId, 'WHATSAPP')));
}

// =============================================================================
console.log('\n== Avisos ==');
// =============================================================================
{
  const canal = await prisma.whatsAppChannel.findFirstOrThrow({ where: { workspaceId: A.workspaceId } });

  await prisma.whatsAppChannel.update({
    where: { id: canal.id },
    data: { status: WhatsAppChannelStatus.NEEDS_ATTENTION },
  });

  await scanWorkspaceHealth(A.workspaceId);

  const abiertos = await openAlerts(A.workspaceId);
  check('Una integracion caida levanta un aviso',
    abiertos.some((alert) => alert.dedupeKey === `whatsapp-down:${canal.id}`));

  const primero = abiertos.find((alert) => alert.dedupeKey === `whatsapp-down:${canal.id}`)!;

  // Repetir el barrido no duplica ni cambia la fecha original.
  await scanWorkspaceHealth(A.workspaceId);
  const segundos = await openAlerts(A.workspaceId);
  const mismos = segundos.filter((alert) => alert.dedupeKey === `whatsapp-down:${canal.id}`);

  check('Repetir el barrido no duplica el aviso', mismos.length === 1);
  check(
    'Y conserva desde cuando esta roto',
    mismos[0].createdAt.getTime() === primero.createdAt.getTime(),
  );

  // Arreglarlo lo resuelve solo.
  await prisma.whatsAppChannel.update({
    where: { id: canal.id },
    data: { status: WhatsAppChannelStatus.CONNECTED },
  });

  await scanWorkspaceHealth(A.workspaceId);
  const tras = await openAlerts(A.workspaceId);
  check(
    'Arreglar la integracion cierra el aviso solo',
    !tras.some((alert) => alert.dedupeKey === `whatsapp-down:${canal.id}`),
  );

  // Un cupo al 80% avisa antes de agotarse.
  await setPlan(A.workspaceId, {
    capabilities: ['WHATSAPP', 'AI_AGENTS'],
    allowances: { users: 5, contacts: 10, whatsapp_numbers: 1, conversations: 10, ai_cost_clp: 100, emails: 0, campaign_contacts: 0 },
  });

  await prisma.usageCounter.upsert({
    where: {
      workspaceId_period_metric: {
        workspaceId: A.workspaceId,
        period: currentPeriod(),
        metric: 'conversations',
      },
    },
    create: { workspaceId: A.workspaceId, period: currentPeriod(), metric: 'conversations', quantity: 9 },
    update: { quantity: 9 },
  });

  await scanWorkspaceHealth(A.workspaceId);
  const cerca = await openAlerts(A.workspaceId);
  check(
    'Un cupo al 90% avisa antes de agotarse',
    cerca.some((alert) => alert.dedupeKey === 'allowance-near:conversations'),
  );

  // Una existencia en su tope no es un cupo agotado.
  const canalUnico = await prisma.whatsAppChannel.count({ where: { workspaceId: A.workspaceId } });
  const avisosCupo = await openAlerts(A.workspaceId);

  check(
    'Tener 1 numero de 1 permitido NO levanta un aviso critico',
    canalUnico === 1 &&
      !avisosCupo.some((alert) => alert.dedupeKey === 'allowance-exceeded:whatsapp_numbers'),
  );

  // Pero pasarse si.
  await prisma.whatsAppChannel.create({
    data: {
      workspaceId: A.workspaceId,
      wabaId: `waba2-${stamp}`,
      phoneNumberId: `phone2-${stamp}`,
      displayPhoneNumber: '+56900000001',
      status: WhatsAppChannelStatus.CONNECTED,
    },
  });

  await scanWorkspaceHealth(A.workspaceId);
  const pasado = await openAlerts(A.workspaceId);
  check(
    'Tener 2 de 1 si lo levanta',
    pasado.some((alert) => alert.dedupeKey === 'allowance-exceeded:whatsapp_numbers'),
  );

  // Un consumo del mes en su tope si esta agotado: no queda nada que gastar.
  await prisma.usageCounter.upsert({
    where: {
      workspaceId_period_metric: {
        workspaceId: A.workspaceId,
        period: currentPeriod(),
        metric: 'conversations',
      },
    },
    create: { workspaceId: A.workspaceId, period: currentPeriod(), metric: 'conversations', quantity: 10 },
    update: { quantity: 10 },
  });

  await scanWorkspaceHealth(A.workspaceId);
  const agotado = await openAlerts(A.workspaceId);
  check(
    'Un consumo del mes en su tope si cuenta como agotado',
    agotado.some((alert) => alert.dedupeKey === 'allowance-exceeded:conversations'),
  );

  // Los avisos no cruzan de workspace.
  await raiseAlert({
    workspaceId: B.workspaceId,
    kind: 'INTEGRATION_DOWN',
    title: 'Prueba de aislamiento',
    dedupeKey: 'aislamiento',
  });

  const deA = await openAlerts(A.workspaceId);
  check('Los avisos no cruzan entre workspaces',
    !deA.some((alert) => alert.dedupeKey === 'aislamiento'));

  check('Resolver un aviso ajeno no hace nada',
    (await resolveAlert(A.workspaceId, 'aislamiento')) === 0);
}

// =============================================================================
console.log('\n== La recuperacion espera a la activacion ==');
// =============================================================================
{
  const workspaceId = B.workspaceId;

  // B quedo sin suscripcion; se le devuelve una para poder probar journeys.
  const plan = await setPlan(workspaceId, {
    capabilities: ['WHATSAPP', 'AI_AGENTS', 'EMAIL', 'CAMPAIGNS'],
    allowances: { users: 5, contacts: 100, whatsapp_numbers: 1, conversations: 100, ai_cost_clp: 5000, emails: 100, campaign_contacts: 100 },
  });

  const existing = await prisma.workspaceSubscription.findFirst({ where: { workspaceId } });
  if (!existing) {
    await prisma.workspaceSubscription.create({
      data: { workspaceId, planId: plan.id, status: SubscriptionStatus.ACTIVE },
    });
  }

  const contacto = await prisma.contact.create({
    data: { workspaceId, firstName: 'Journey', lastName: 'Gate', email: `jg-${stamp}@t.test` },
  });

  await grantConsent({
    workspaceId,
    contactId: contacto.id,
    channel: ConsentChannel.EMAIL,
    source: 'prueba',
  });

  const journey = await prisma.journey.create({
    data: {
      workspaceId,
      key: `gate-${stamp}`,
      name: 'Journey de prueba',
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
            body: 'Hola',
          },
        ],
      },
    },
  });

  const inscripcion = await enroll({ workspaceId, journeyId: journey.id, contactId: contacto.id });
  check('Se puede inscribir aunque el workspace no este activo', inscripcion.enrolled);

  await prisma.journeyEnrollment.updateMany({
    where: { journeyId: journey.id },
    data: { nextRunAt: new Date(Date.now() - 1000) },
  });

  const sinActivar = await advanceEnrollment(
    inscripcion.enrolled ? inscripcion.enrollmentId : '',
    new Date(),
  );

  check(
    'Pero el journey no escribe hasta que el workspace se active',
    sinActivar.outcome === 'NOT_ACTIVE',
    sinActivar.detail,
  );

  const enviados = await prisma.emailMessage.count({ where: { workspaceId, journeyId: journey.id } });
  check('Y no salio ningun correo', enviados === 0);

  const conservada = await prisma.journeyEnrollment.findFirstOrThrow({
    where: { journeyId: journey.id },
  });
  check(
    'La inscripcion se conserva para cuando se active',
    conservada.status === 'ACTIVE' && conservada.currentPosition === 1,
  );
}

// --- Limpieza ---------------------------------------------------------------
const deleted = await prisma.workspace.deleteMany({ where: { slug: { startsWith: 'fase9-' } } });
await prisma.subscriptionPlan.deleteMany({
  where: { OR: [{ key: { startsWith: 'prueba-' } }, { key: { startsWith: 'legado-' } }] },
});
console.log(`\nLimpieza: ${deleted.count} workspaces de prueba eliminados (cascade).`);

console.log(`\n== Resultado: ${results.length - failures}/${results.length} pruebas OK ==`);
await prisma.$disconnect();
process.exit(failures > 0 ? 1 : 0);
