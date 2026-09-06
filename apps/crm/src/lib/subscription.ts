import {
  IntegrationProvider,
  IntegrationStatus,
  OpportunityStage,
  SubscriptionStatus,
  UserRole,
} from '../../generated/prisma/client';
import { isDatabaseUnavailable, isDevDemoEnabled } from './dev-demo';
import { hashPassword } from './password';
import { prisma } from './prisma';

const MONTH_MS = 1000 * 60 * 60 * 24 * 30;
const TRIAL_MS = 1000 * 60 * 60 * 24 * 7;

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

export async function ensureMonthlyPlan() {
  return prisma.subscriptionPlan.upsert({
    where: { key: MONTHLY_PLAN_KEY },
    create: {
      key: MONTHLY_PLAN_KEY,
      name: 'CRM Upzites Mensual',
      priceClp: 49000,
      maxUsers: 3,
      maxContacts: 1000,
      features: ['CRM', 'Captura de leads', 'Pipeline', 'Automatizaciones basicas', 'Reportes'],
    },
    update: {
      name: 'CRM Upzites Mensual',
      priceClp: 49000,
      maxUsers: 3,
      maxContacts: 1000,
      features: ['CRM', 'Captura de leads', 'Pipeline', 'Automatizaciones basicas', 'Reportes'],
    },
  });
}

export async function getSubscriptionStatus(workspaceId: string) {
  let subscription;

  try {
    subscription = await prisma.workspaceSubscription.findFirst({
      where: { workspaceId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
  } catch (error) {
    if (isDevDemoEnabled() && isDatabaseUnavailable(error)) {
      const expiresAt = nextMonthlyRenewal();
      return { subscription: null, isActive: true, daysLeft: 30, expiresAt };
    }

    throw error;
  }

  if (!subscription) {
    return { subscription: null, isActive: false, daysLeft: 0, expiresAt: null };
  }

  const expiresAt = subscription.renewsAt ?? subscription.trialEndsAt;
  const isRenewableStatus =
    subscription.status === SubscriptionStatus.ACTIVE || subscription.status === SubscriptionStatus.TRIAL;
  const isActive =
    isRenewableStatus &&
    Boolean(expiresAt) &&
    expiresAt!.getTime() > Date.now();
  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return { subscription, isActive, daysLeft, expiresAt };
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

export async function createCustomerWorkspace(input: {
  companyName: string;
  ownerName: string;
  email: string;
  password: string;
}) {
  const normalizedEmail = input.email.toLowerCase().trim();
  const existingUser = await prisma.user.findFirst({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (existingUser) {
    throw new Error('EMAIL_ALREADY_EXISTS');
  }

  const plan = await ensureMonthlyPlan();
  const slug = await uniqueWorkspaceSlug(input.companyName);
  const trialEndsAt = nextTrialEnd();

  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        name: input.companyName,
        slug,
      },
    });

    const user = await tx.user.create({
      data: {
        workspaceId: workspace.id,
        name: input.ownerName,
        email: normalizedEmail,
        passwordHash: hashPassword(input.password),
        role: UserRole.OWNER,
      },
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

    await tx.workspaceSubscription.create({
      data: {
        workspaceId: workspace.id,
        planId: plan.id,
        status: SubscriptionStatus.TRIAL,
        trialEndsAt,
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

    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorId: user.id,
        action: 'customer.registered',
        entity: 'Workspace',
        entityId: workspace.id,
        metadata: { planKey: plan.key, trialEndsAt: trialEndsAt.toISOString() },
      },
    });

    return { user, workspace, subscription: { trialEndsAt } };
  });
}
