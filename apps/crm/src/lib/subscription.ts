import {
  BillingSource,
  IntegrationProvider,
  IntegrationStatus,
  OpportunityStage,
  PlanCode,
  SubscriptionStatus,
  UserRole,
  WorkspaceRole,
} from '../../generated/prisma/client';
import { isDatabaseUnavailable, isDevDemoEnabled } from './dev-demo';
import { DEFAULT_SCORE_RULES } from './domain';
import { AUTOMATION_PRESETS } from './automation/presets';
import { DEFAULT_SALES_AGENT } from './agents/presets';
import { bootstrapMarketing } from './marketing/bootstrap';
import { hashPassword } from './password';
import { BETA_PLANS } from './billing/plans';
import { ensurePlanCatalog } from './billing/plan-catalog';
import { currentSubscription } from './billing/subscription-access';
import { resolveLifecycle } from './billing/subscription-state';
import { prisma } from './prisma';
import { normalizeEmail } from './identity';

const MONTH_MS = 1000 * 60 * 60 * 24 * 30;
const TRIAL_MS = 1000 * 60 * 60 * 24 * 7;

/** LEGACY: plan de la beta con trial de 7 dias. Ya no se asigna (P0-B). */
export const MONTHLY_PLAN_KEY = 'monthly';

const defaultStages = [
  { key: OpportunityStage.NEW, name: 'Nuevo', position: 1, probability: 20 },
  { key: OpportunityStage.QUALIFIED, name: 'Calificado', position: 2, probability: 40 },
  { key: OpportunityStage.PROPOSAL, name: 'Propuesta', position: 3, probability: 55 },
  { key: OpportunityStage.NEGOTIATION, name: 'Negociacion', position: 4, probability: 75 },
  { key: OpportunityStage.WON, name: 'Ganado', position: 5, probability: 100, isWon: true },
  { key: OpportunityStage.LOST, name: 'Perdido', position: 6, probability: 0, isLost: true },
] as const;

const defaultIntegrations = [
  { provider: IntegrationProvider.WHATSAPP, name: 'WhatsApp Business' },
  { provider: IntegrationProvider.GOOGLE_CALENDAR, name: 'Google Calendar' },
  { provider: IntegrationProvider.GMAIL, name: 'Gmail' },
  { provider: IntegrationProvider.MERCADO_PAGO, name: 'Mercado Pago' },
  { provider: IntegrationProvider.GOOGLE_ANALYTICS, name: 'Google Analytics' },
] as const;

export function nextMonthlyRenewal(from = new Date()) {
  return new Date(from.getTime() + MONTH_MS);
}

export function nextTrialEnd(from = new Date()) {
  return new Date(from.getTime() + TRIAL_MS);
}

/**
 * LEGACY (P0-B): plan con el que arrancaba todo workspace antes de V2. Ya no
 * se asigna a nadie; se conserva para las suscripciones que lo tienen y para
 * resolver preferencias de Mercado Pago legacy en vuelo.
 *
 * Habilita todas las capacidades a proposito —durante la prueba el cliente
 * tiene que poder ver que hace el producto— pero con cupos deliberadamente
 * bajos. Ninguno es ilimitado: la spec lo prohibe, y un trial sin techo es una
 * factura de OpenAI esperando a ocurrir.
 */
const MONTHLY_PLAN_TERMS = {
  name: 'Upzites Flow Mensual',
  priceClp: 49000,
  maxUsers: 3,
  maxContacts: 1000,
  features: ['CRM', 'Captura de leads', 'Pipeline', 'Automatizaciones basicas', 'Reportes'],
  capabilities: ['WHATSAPP', 'AI_AGENTS', 'PAYMENTS', 'QUOTES', 'EMAIL', 'CAMPAIGNS', 'SHOPIFY'],
  allowances: {
    users: 3,
    contacts: 1000,
    whatsapp_numbers: 1,
    conversations: 500,
    ai_cost_clp: 20000,
    ai_credits: 0,
    emails: 2000,
    campaign_contacts: 1000,
  },
} as const;

export async function ensureMonthlyPlan() {
  return prisma.subscriptionPlan.upsert({
    where: { key: MONTHLY_PLAN_KEY },
    create: {
      key: MONTHLY_PLAN_KEY,
      name: MONTHLY_PLAN_TERMS.name,
      priceClp: MONTHLY_PLAN_TERMS.priceClp,
      maxUsers: MONTHLY_PLAN_TERMS.maxUsers,
      maxContacts: MONTHLY_PLAN_TERMS.maxContacts,
      features: [...MONTHLY_PLAN_TERMS.features],
      capabilities: [...MONTHLY_PLAN_TERMS.capabilities],
      allowances: MONTHLY_PLAN_TERMS.allowances,
    },
    update: {
      name: MONTHLY_PLAN_TERMS.name,
      priceClp: MONTHLY_PLAN_TERMS.priceClp,
      maxUsers: MONTHLY_PLAN_TERMS.maxUsers,
      maxContacts: MONTHLY_PLAN_TERMS.maxContacts,
      features: [...MONTHLY_PLAN_TERMS.features],
      capabilities: [...MONTHLY_PLAN_TERMS.capabilities],
      allowances: MONTHLY_PLAN_TERMS.allowances,
    },
  });
}

/**
 * LEGACY (P0-B): escalera comercial de la beta. Ya no se vende (queda
 * `isActive = false`); los planes a la venta son los del catalogo
 * FREE/START/PRO/SCALE (billing/plan-catalog.ts). Idempotente.
 *
 * Se siembra bajo demanda desde `GET /api/plans` en vez de en una migracion:
 * los precios cambian, y una migracion que fija precios obliga a otra migracion
 * cada vez que se ajusta uno.
 */
export async function ensureBetaPlans() {
  for (const plan of BETA_PLANS) {
    const data = {
      name: plan.name,
      priceClp: plan.priceClp,
      maxUsers: plan.allowances.users ?? 1,
      maxContacts: plan.allowances.contacts ?? 0,
      features: plan.features,
      capabilities: [...plan.capabilities],
      allowances: plan.allowances,
      overages: plan.overages,
      position: plan.position,
      isActive: false,
    };

    await prisma.subscriptionPlan.upsert({
      where: { key: plan.key },
      create: { key: plan.key, ...data },
      update: data,
    });
  }

  return prisma.subscriptionPlan.findMany({
    where: { key: { in: BETA_PLANS.map((plan) => plan.key) } },
    orderBy: [{ position: 'asc' }, { priceClp: 'asc' }],
  });
}

/**
 * Estado de la suscripcion para la interfaz. Es el MISMO resolver que decide
 * el consumo y los entitlements (billing/subscription-state.ts).
 */
export async function getSubscriptionStatus(workspaceId: string) {
  let subscription;

  try {
    subscription = await currentSubscription(workspaceId);
  } catch (error) {
    if (isDevDemoEnabled() && isDatabaseUnavailable(error)) {
      const expiresAt = nextMonthlyRenewal();
      return {
        subscription: null,
        snapshot: null,
        isActive: true,
        state: 'ACTIVE' as const,
        daysLeft: 30,
        expiresAt,
        graceEndsAt: null,
      };
    }

    throw error;
  }

  const resolved = resolveLifecycle(subscription);
  return {
    subscription,
    snapshot: resolved,
    isActive: resolved.hasAccess,
    state: resolved.state,
    daysLeft: resolved.daysLeft,
    expiresAt: resolved.expiresAt,
    graceEndsAt: resolved.graceEndsAt,
  };
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function uniqueWorkspaceSlug(companyName: string) {
  const base = slugify(companyName) || 'cliente';
  let slug = base;
  let index = 2;

  while (await prisma.workspace.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${index}`;
    index += 1;
  }

  return slug;
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Aprovisiona un workspace nuevo con sus valores de fabrica: etapas, formulario,
 * suscripcion FREE, scoring, reglas de sistema, agente en borrador e
 * integraciones. NO crea usuarios ni memberships: lo usan el registro (con su
 * OWNER) y Platform Admin (que invita al OWNER, sin contrasena).
 *
 * Despues de la transaccion hay que llamar `bootstrapMarketing(workspace.id)`
 * (perfil minimo, politica de contacto, segmentos y journeys de fabrica).
 */
export async function provisionWorkspaceTx(tx: Tx, input: { name: string; slug: string; isInternal?: boolean; freePlanId: string }) {
  const freePlanId = input.freePlanId;
  const workspace = await tx.workspace.create({
    data: { name: input.name, slug: input.slug, isInternal: input.isInternal ?? false },
  });

  await tx.pipelineStage.createMany({
    data: defaultStages.map((stage) => ({
      workspaceId: workspace.id,
      key: stage.key,
      name: stage.name,
      position: stage.position,
      probability: stage.probability,
      isWon: 'isWon' in stage ? stage.isWon : false,
      isLost: 'isLost' in stage ? stage.isLost : false,
    })),
  });

  await tx.form.create({
    data: {
      workspaceId: workspace.id,
      name: 'Formulario principal',
      title: 'Conversemos sobre tu proyecto',
      description: 'Completa tus datos y te contactaremos pronto.',
      submitLabel: 'Enviar',
      source: 'Formulario web',
    },
  });

  const startedAt = new Date();
  await tx.workspaceSubscription.create({
    data: {
      workspaceId: workspace.id,
      planId: freePlanId,
      billingSource: BillingSource.FREE,
      // `status` es legacy: el estado se resuelve, no se guarda.
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: startedAt,
      currentPeriodEnd: null,
    },
  });

  // Reglas de scoring por defecto del workspace (Fase 1). Se crean aqui para
  // que el score sea explicable desde el primer lead, sin depender de un job.
  await tx.leadScoreRule.createMany({
    data: DEFAULT_SCORE_RULES.map((rule) => ({
      workspaceId: workspace.id,
      key: rule.key,
      label: rule.label,
      points: rule.points,
    })),
    skipDuplicates: true,
  });

  // Automatizaciones basicas activas desde el primer dia (Fase 3). Son
  // genericas a proposito: la beta es multivertical.
  for (const preset of AUTOMATION_PRESETS.filter((item) => item.enabledByDefault)) {
    await tx.automationRule.create({
      data: {
        workspaceId: workspace.id,
        // Regla de sistema: interna, no ocupa `automations.active.max` (P0-C).
        presetKey: preset.key,
        name: preset.name,
        description: preset.description,
        trigger: preset.trigger,
        conditions: preset.conditions as never,
        actions: preset.actions as never,
        dedupeMinutes: preset.dedupeMinutes,
      },
    });
  }

  // Agente comercial por defecto, en borrador. Publicar es una decision
  // explicita del cliente: nadie deja una IA hablando con sus clientes sin
  // haberla leido primero.
  const agent = await tx.agentDefinition.create({
    data: {
      workspaceId: workspace.id,
      key: DEFAULT_SALES_AGENT.key,
      name: DEFAULT_SALES_AGENT.name,
      purpose: DEFAULT_SALES_AGENT.purpose,
    },
  });

  await tx.agentVersion.create({
    data: {
      agentDefinitionId: agent.id,
      version: 1,
      instructions: DEFAULT_SALES_AGENT.instructions,
      model: DEFAULT_SALES_AGENT.model,
      allowedTools: [...DEFAULT_SALES_AGENT.allowedTools],
      maxSteps: DEFAULT_SALES_AGENT.maxSteps,
      escalationPolicy: DEFAULT_SALES_AGENT.escalationPolicy as never,
    },
  });

  await tx.integration.createMany({
    data: defaultIntegrations.map((integration) => ({
      workspaceId: workspace.id,
      provider: integration.provider,
      name: integration.name,
      status: IntegrationStatus.DISCONNECTED,
    })),
  });


  return workspace;
}

/** Slug unico para un workspace nuevo (exportado para Platform Admin). */
export { uniqueWorkspaceSlug };

export async function createCustomerWorkspace(input: {
  companyName: string;
  ownerName: string;
  email: string;
  password: string;
}) {
  // Step 2: email unico GLOBAL. Una cuenta existente no se duplica: para sumar
  // un workspace a una persona que ya tiene cuenta se usa una invitacion.
  const normalizedEmail = normalizeEmail(input.email);
  if (await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } })) {
    throw new Error('EMAIL_ALREADY_EXISTS');
  }

  // P0-B: todo registro nuevo nace en FREE (sin trial automatico). El TRIAL
  // sigue existiendo, pero se asigna explicitamente (campanas, promociones).
  const plans = await ensurePlanCatalog();
  const slug = await uniqueWorkspaceSlug(input.companyName);

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const workspace = await provisionWorkspaceTx(tx, { name: input.companyName, slug, freePlanId: plans[PlanCode.FREE].id });

      // Step 2: la cuenta es global y la autoriza la membership OWNER. Ya no se
      // escribe `users.workspace_id` (legacy nullable). `role` sigue
      // escribiendose solo como legacy de lectura; nada autoriza con el.
      const user = await tx.user.create({
        data: {
          name: input.ownerName,
          email: normalizedEmail,
          passwordHash: hashPassword(input.password),
          role: UserRole.OWNER,
          lastActiveWorkspaceId: workspace.id,
          memberships: { create: { workspaceId: workspace.id, role: WorkspaceRole.OWNER } },
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          actorId: user.id,
          action: 'customer.registered',
          entity: 'Workspace',
          entityId: workspace.id,
          metadata: { planCode: PlanCode.FREE, billingSource: BillingSource.FREE },
        },
      });

      // `role` es el rol en ESTE workspace (membership OWNER), no el legacy.
      return {
        user: { ...user, role: WorkspaceRole.OWNER },
        workspace,
        subscription: { planCode: PlanCode.FREE, billingSource: BillingSource.FREE },
      };
    });
  } catch (error) {
    // Carrera: dos registros simultaneos con el mismo email. El unico global gana.
    if ((error as { code?: string }).code === 'P2002') throw new Error('EMAIL_ALREADY_EXISTS');
    throw error;
  }

  // Fase 8: politica de contacto, segmentos y journeys de fabrica.
  //
  // Va DESPUES de la transaccion y no dentro. Son una decena de escrituras que
  // no forman parte de la invariante "el cliente existe", y meterlas en la
  // transaccion interactiva la llevaba al limite de 5 segundos: el alta fallaba
  // por culpa de unos segmentos de ejemplo. Si esto falla, el workspace queda
  // igualmente operativo y basta reintentar: `bootstrapMarketing` es idempotente.
  await bootstrapMarketing(created.workspace.id);

  return created;
}
