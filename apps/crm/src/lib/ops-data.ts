import {
  AiInsightType,
  AutomationAction,
  AutomationTrigger,
  ContactStatus,
  IntegrationProvider,
  IntegrationStatus,
  InsightStatus,
  OpportunityStatus,
  SubscriptionStatus,
} from '../../generated/prisma/client';
import { getCurrentWorkspaceId } from './crm-data';
import { DEV_DEMO_USER, devDemoData, isDatabaseUnavailable, isDevDemoEnabled } from './dev-demo';
import { prisma } from './prisma';

const demoDate = new Date('2026-06-15T12:00:00.000Z');

const demoIntegrations = [
  {
    id: 'demo-int-whatsapp',
    workspaceId: DEV_DEMO_USER.workspace.id,
    provider: IntegrationProvider.WHATSAPP,
    name: 'WhatsApp Business',
    status: IntegrationStatus.CONNECTED,
    config: { phone: '+56 9 1234 5678' },
    lastSyncAt: demoDate,
    createdAt: demoDate,
    updatedAt: demoDate,
  },
  {
    id: 'demo-int-google',
    workspaceId: DEV_DEMO_USER.workspace.id,
    provider: IntegrationProvider.GOOGLE_ADS,
    name: 'Google Ads',
    status: IntegrationStatus.NEEDS_ATTENTION,
    config: { accountId: 'demo-account' },
    lastSyncAt: null,
    createdAt: demoDate,
    updatedAt: demoDate,
  },
  {
    id: 'demo-int-mercadopago',
    workspaceId: DEV_DEMO_USER.workspace.id,
    provider: IntegrationProvider.MERCADO_PAGO,
    name: 'Mercado Pago',
    status: IntegrationStatus.DISCONNECTED,
    config: {},
    lastSyncAt: null,
    createdAt: demoDate,
    updatedAt: demoDate,
  },
];

const demoAutomationRules = [
  {
    id: 'demo-rule-follow-up',
    workspaceId: DEV_DEMO_USER.workspace.id,
    name: 'Seguimiento a leads frios',
    description: 'Crea una tarea cuando un contacto lleva una semana sin actividad.',
    trigger: AutomationTrigger.NO_ACTIVITY,
    action: AutomationAction.CREATE_TASK,
    conditions: { daysInactive: 7 },
    actionConfig: { title: 'Reactivar lead', type: 'CALL' },
    isActive: true,
    lastRunAt: demoDate,
    createdAt: demoDate,
    updatedAt: demoDate,
  },
  {
    id: 'demo-rule-alert',
    workspaceId: DEV_DEMO_USER.workspace.id,
    name: 'Alerta de oportunidad alta',
    description: 'Genera un insight cuando una oportunidad valiosa queda sin movimiento.',
    trigger: AutomationTrigger.OPPORTUNITY_STAGE_CHANGED,
    action: AutomationAction.CREATE_INSIGHT,
    conditions: { minValue: 1500000 },
    actionConfig: { type: 'RISK' },
    isActive: true,
    lastRunAt: null,
    createdAt: demoDate,
    updatedAt: demoDate,
  },
];

const demoInsightContact = {
  id: 'demo-contact-insight',
  workspaceId: DEV_DEMO_USER.workspace.id,
  companyId: null,
  firstName: 'Valentina',
  lastName: 'Torres',
  email: 'vtorres@empresa.cl',
  phone: '+56 9 8765 4321',
  status: ContactStatus.CUSTOMER,
  source: 'Sitio Web',
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  value: 4800000,
  tags: ['construccion', 'vip'],
  lastActivityAt: demoDate,
  createdAt: demoDate,
  updatedAt: demoDate,
};

const demoInsightOpportunity = {
  id: 'demo-opportunity-insight',
  workspaceId: DEV_DEMO_USER.workspace.id,
  contactId: demoInsightContact.id,
  companyId: null,
  stageId: 'demo-stage-propuesta',
  ownerId: DEV_DEMO_USER.id,
  title: 'Sitio web + CRM Constructora Andes',
  value: 4800000,
  probability: 75,
  expectedCloseDate: new Date('2026-07-15T12:00:00.000Z'),
  status: OpportunityStatus.OPEN,
  createdAt: demoDate,
  updatedAt: demoDate,
};

const demoAiInsights = [
  {
    id: 'demo-insight-1',
    workspaceId: DEV_DEMO_USER.workspace.id,
    contactId: demoInsightContact.id,
    opportunityId: demoInsightOpportunity.id,
    type: AiInsightType.NEXT_BEST_ACTION,
    title: 'Contactar leads con alta intencion',
    description: 'Hay contactos con visitas recientes y oportunidades abiertas que conviene priorizar hoy.',
    score: 86,
    status: InsightStatus.OPEN,
    metadata: { source: 'demo' },
    createdAt: demoDate,
    updatedAt: demoDate,
    contact: demoInsightContact,
    opportunity: demoInsightOpportunity,
  },
];

const demoSubscription = {
  id: 'demo-subscription',
  workspaceId: DEV_DEMO_USER.workspace.id,
  planId: 'demo-plan-growth',
  status: SubscriptionStatus.TRIAL,
  currentPeriodStart: demoDate,
  currentPeriodEnd: new Date('2026-07-15T12:00:00.000Z'),
  providerCustomerId: null,
  providerSubscriptionId: null,
  createdAt: demoDate,
  updatedAt: demoDate,
  plan: {
    id: 'demo-plan-growth',
    key: 'growth',
    name: 'Growth',
    priceClp: 49000,
    maxUsers: 5,
    maxContacts: 5000,
    features: ['CRM', 'Captura web', 'Automatizaciones', 'Insights'],
    createdAt: demoDate,
  },
};

const demoAuditLogs = [
  {
    id: 'demo-audit-login',
    workspaceId: DEV_DEMO_USER.workspace.id,
    userId: DEV_DEMO_USER.id,
    action: 'auth.login',
    entity: 'User',
    entityId: DEV_DEMO_USER.id,
    metadata: { mode: 'demo' },
    createdAt: demoDate,
  },
  {
    id: 'demo-audit-integration',
    workspaceId: DEV_DEMO_USER.workspace.id,
    userId: DEV_DEMO_USER.id,
    action: 'integration.upsert',
    entity: 'Integration',
    entityId: 'demo-int-whatsapp',
    metadata: { provider: 'WHATSAPP' },
    createdAt: demoDate,
  },
];

function shouldUseDemo(error: unknown) {
  return isDevDemoEnabled() && isDatabaseUnavailable(error);
}

export async function getIntegrations() {
  const workspaceId = await getCurrentWorkspaceId();
  try {
    return await prisma.integration.findMany({
      where: { workspaceId },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    if (shouldUseDemo(error)) return demoIntegrations;
    throw error;
  }
}

export async function getAutomationRules() {
  const workspaceId = await getCurrentWorkspaceId();
  try {
    return await prisma.automationRule.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  } catch (error) {
    if (shouldUseDemo(error)) return demoAutomationRules;
    throw error;
  }
}

export async function getAiInsights() {
  const workspaceId = await getCurrentWorkspaceId();
  try {
    return await prisma.aiInsight.findMany({
      where: { workspaceId },
      include: {
        contact: true,
        opportunity: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  } catch (error) {
    if (shouldUseDemo(error)) return demoAiInsights;
    throw error;
  }
}

export async function getBillingSummary() {
  const workspaceId = await getCurrentWorkspaceId();
  try {
    const subscription = await prisma.workspaceSubscription.findFirst({
      where: { workspaceId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
    const [users, contacts] = await Promise.all([
      prisma.user.count({ where: { workspaceId } }),
      prisma.contact.count({ where: { workspaceId } }),
    ]);

    return { subscription, users, contacts };
  } catch (error) {
    if (shouldUseDemo(error)) {
      return { subscription: demoSubscription, users: 1, contacts: devDemoData.contacts.length };
    }
    throw error;
  }
}

export async function getOpsSummary() {
  const workspaceId = await getCurrentWorkspaceId();
  try {
    const [auditLogs, openInsights, disconnectedIntegrations] = await Promise.all([
      prisma.auditLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      prisma.aiInsight.count({ where: { workspaceId, status: InsightStatus.OPEN } }),
      prisma.integration.count({ where: { workspaceId, status: IntegrationStatus.DISCONNECTED } }),
    ]);

    return { auditLogs, openInsights, disconnectedIntegrations };
  } catch (error) {
    if (shouldUseDemo(error)) {
      return {
        auditLogs: demoAuditLogs,
        openInsights: demoAiInsights.filter((insight) => insight.status === InsightStatus.OPEN).length,
        disconnectedIntegrations: demoIntegrations.filter(
          (integration) => integration.status === IntegrationStatus.DISCONNECTED,
        ).length,
      };
    }
    throw error;
  }
}

export {
  AiInsightType,
  AutomationAction,
  AutomationTrigger,
  IntegrationProvider,
  IntegrationStatus,
  InsightStatus,
  SubscriptionStatus,
};
