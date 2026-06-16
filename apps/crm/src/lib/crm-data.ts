import {
  ActivityType,
  ContactStatus as DbContactStatus,
  OpportunityStage as DbOpportunityStage,
  OpportunityStatus,
  WebEventType,
} from '../../generated/prisma/client';
import { requireCurrentUser } from './auth';
import { devDemoData, isDatabaseUnavailable, isDevDemoEnabled } from './dev-demo';
import { prisma } from './prisma';
import type { Activity, Contact, ContactStatus, Opportunity, OpportunityStage } from './mock-data';

const contactStatusMap: Record<DbContactStatus, ContactStatus> = {
  LEAD: 'lead',
  ACTIVE: 'activo',
  CUSTOMER: 'cliente',
  INACTIVE: 'inactivo',
};

const opportunityStageMap: Record<DbOpportunityStage, OpportunityStage> = {
  NEW: 'nuevo',
  QUALIFIED: 'calificado',
  PROPOSAL: 'propuesta',
  NEGOTIATION: 'negociacion',
  WON: 'ganado',
  LOST: 'perdido',
};

const activityTypeMap: Record<ActivityType, Activity['type']> = {
  EMAIL: 'email',
  CALL: 'call',
  MEETING: 'meeting',
  NOTE: 'note',
  DEAL: 'deal',
};

export type CrmDashboardData = {
  kpis: {
    totalLeads: number;
    leadsGrowth: number;
    openOpportunities: number;
    opportunitiesValue: number;
    closedWon: number;
    revenue: number;
    revenueGrowth: number;
    conversionRate: number;
  };
  activities: Activity[];
  opportunities: Opportunity[];
  sourceData: Array<{ source: string; leads: number; percentage: number }>;
};

export type LeadSourceReport = {
  sourceRows: Array<{ source: string; leads: number; percentage: number }>;
  eventRows: Array<{ label: string; value: number }>;
  recentSubmissions: Array<{
    id: string;
    formName: string;
    contactName: string;
    pageUrl: string;
    createdAt: string;
  }>;
};

export type ContactDetail = Contact & {
  activities: Activity[];
  opportunities: Opportunity[];
  webEvents: Array<{ id: string; type: string; pageUrl: string; createdAt: string }>;
};

export type PipelineStageRecord = {
  id: string;
  key: OpportunityStage;
  name: string;
  position: number;
  probability: number;
  isWon: boolean;
  isLost: boolean;
};

export async function getCurrentWorkspaceId() {
  const user = await requireCurrentUser();
  return user.workspace.id;
}

function daysAgoLabel(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));

  if (diffHours < 24) {
    return `Hace ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `Hace ${diffDays} ${diffDays === 1 ? 'dia' : 'dias'}`;
}

export async function getContacts(): Promise<Contact[]> {
  const workspaceId = await getCurrentWorkspaceId();

  try {
    const contacts = await prisma.contact.findMany({
      where: { workspaceId },
      include: { company: true },
      orderBy: { createdAt: 'desc' },
    });

    return contacts.map((contact) => ({
      id: contact.id,
      name: `${contact.firstName} ${contact.lastName}`,
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      company: contact.company?.name ?? 'Sin empresa',
      status: contactStatusMap[contact.status],
      source: contact.source ?? 'Sin fuente',
      createdAt: contact.createdAt.toISOString(),
      lastActivity: (contact.lastActivityAt ?? contact.updatedAt).toISOString(),
      value: contact.value,
      tags: contact.tags,
    }));
  } catch (error) {
    if (isDevDemoEnabled() && isDatabaseUnavailable(error)) return devDemoData.contacts;
    throw error;
  }
}

export async function getOpportunities(): Promise<Opportunity[]> {
  const workspaceId = await getCurrentWorkspaceId();

  try {
    const opportunities = await prisma.opportunity.findMany({
      where: { workspaceId },
      include: { contact: true, company: true, owner: true, stage: true },
      orderBy: { createdAt: 'desc' },
    });

    return opportunities.map((opportunity) => ({
      id: opportunity.id,
      title: opportunity.title,
      contactName: opportunity.contact
        ? `${opportunity.contact.firstName} ${opportunity.contact.lastName}`
        : 'Sin contacto',
      company: opportunity.company?.name ?? 'Sin empresa',
      stage: opportunityStageMap[opportunity.stage.key],
      value: opportunity.value,
      probability: opportunity.probability,
      closeDate: (opportunity.expectedCloseDate ?? opportunity.updatedAt).toISOString(),
      owner: opportunity.owner?.name ?? 'Sin responsable',
      createdAt: opportunity.createdAt.toISOString(),
    }));
  } catch (error) {
    if (isDevDemoEnabled() && isDatabaseUnavailable(error)) return devDemoData.opportunities;
    throw error;
  }
}

export async function getActivities(limit = 12): Promise<Activity[]> {
  const workspaceId = await getCurrentWorkspaceId();

  try {
    const activities = await prisma.activity.findMany({
      where: { workspaceId },
      include: { contact: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return activities.map((activity) => ({
      id: activity.id,
      type: activityTypeMap[activity.type],
      description: activity.description ?? activity.title,
      contactName: activity.contact
        ? `${activity.contact.firstName} ${activity.contact.lastName}`
        : 'Sin contacto',
      time: daysAgoLabel(activity.createdAt),
      dueAt: activity.dueAt?.toISOString(),
      completedAt: activity.completedAt?.toISOString(),
    }));
  } catch (error) {
    if (isDevDemoEnabled() && isDatabaseUnavailable(error)) return devDemoData.activities.slice(0, limit);
    throw error;
  }
}

export async function getContactDetail(contactId: string): Promise<ContactDetail | null> {
  const workspaceId = await getCurrentWorkspaceId();

  try {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
      include: {
        company: true,
        activities: { orderBy: { createdAt: 'desc' }, take: 20 },
        opportunities: {
          include: { company: true, contact: true, owner: true, stage: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!contact) return null;

    const webEvents = await prisma.webEvent.findMany({
      where: { workspaceId, contactId: contact.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      id: contact.id,
      name: `${contact.firstName} ${contact.lastName}`,
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      company: contact.company?.name ?? 'Sin empresa',
      status: contactStatusMap[contact.status],
      source: contact.source ?? 'Sin fuente',
      createdAt: contact.createdAt.toISOString(),
      lastActivity: (contact.lastActivityAt ?? contact.updatedAt).toISOString(),
      value: contact.value,
      tags: contact.tags,
      activities: contact.activities.map((activity) => ({
        id: activity.id,
        type: activityTypeMap[activity.type],
        description: activity.description ?? activity.title,
        contactName: `${contact.firstName} ${contact.lastName}`,
        time: daysAgoLabel(activity.createdAt),
        dueAt: activity.dueAt?.toISOString(),
        completedAt: activity.completedAt?.toISOString(),
      })),
      opportunities: contact.opportunities.map((opportunity) => ({
        id: opportunity.id,
        title: opportunity.title,
        contactName: `${contact.firstName} ${contact.lastName}`,
        company: opportunity.company?.name ?? contact.company?.name ?? 'Sin empresa',
        stage: opportunityStageMap[opportunity.stage.key],
        value: opportunity.value,
        probability: opportunity.probability,
        closeDate: (opportunity.expectedCloseDate ?? opportunity.updatedAt).toISOString(),
        owner: opportunity.owner?.name ?? 'Sin responsable',
        createdAt: opportunity.createdAt.toISOString(),
      })),
      webEvents: webEvents.map((event) => ({
        id: event.id,
        type: event.type,
        pageUrl: event.pageUrl,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    if (isDevDemoEnabled() && isDatabaseUnavailable(error)) {
      const contact = devDemoData.contacts.find((item) => item.id === contactId);
      if (!contact) return null;
      return {
        ...contact,
        activities: devDemoData.activities.filter((activity) => activity.contactName === contact.name),
        opportunities: devDemoData.opportunities.filter((opportunity) => opportunity.contactName === contact.name),
        webEvents: [],
      };
    }
    throw error;
  }
}

export async function getPipelineStages(): Promise<PipelineStageRecord[]> {
  const workspaceId = await getCurrentWorkspaceId();

  try {
    const stages = await prisma.pipelineStage.findMany({
      where: { workspaceId },
      orderBy: { position: 'asc' },
    });

    return stages.map((stage) => ({
      id: stage.id,
      key: opportunityStageMap[stage.key],
      name: stage.name,
      position: stage.position,
      probability: stage.probability,
      isWon: stage.isWon,
      isLost: stage.isLost,
    }));
  } catch (error) {
    if (isDevDemoEnabled() && isDatabaseUnavailable(error)) {
      return [
        { id: 'nuevo', key: 'nuevo', name: 'Nuevo', position: 1, probability: 20, isWon: false, isLost: false },
        { id: 'calificado', key: 'calificado', name: 'Calificado', position: 2, probability: 40, isWon: false, isLost: false },
        { id: 'propuesta', key: 'propuesta', name: 'Propuesta', position: 3, probability: 55, isWon: false, isLost: false },
        { id: 'negociacion', key: 'negociacion', name: 'Negociacion', position: 4, probability: 75, isWon: false, isLost: false },
        { id: 'ganado', key: 'ganado', name: 'Ganado', position: 5, probability: 100, isWon: true, isLost: false },
        { id: 'perdido', key: 'perdido', name: 'Perdido', position: 6, probability: 0, isWon: false, isLost: true },
      ];
    }
    throw error;
  }
}

export async function getDashboardData(): Promise<CrmDashboardData> {
  const workspaceId = await getCurrentWorkspaceId();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    const [
      leadsThisMonth,
      openOpportunities,
      wonOpportunities,
      contactsTotal,
      opportunities,
      activities,
      sourceGroups,
    ] = await Promise.all([
      prisma.contact.count({ where: { workspaceId, createdAt: { gte: monthStart } } }),
      prisma.opportunity.findMany({ where: { workspaceId, status: OpportunityStatus.OPEN }, select: { value: true } }),
      prisma.opportunity.findMany({ where: { workspaceId, status: OpportunityStatus.WON }, select: { value: true } }),
      prisma.contact.count({ where: { workspaceId } }),
      getOpportunities(),
      getActivities(6),
      prisma.contact.groupBy({
        by: ['source'],
        where: { workspaceId },
        _count: { source: true },
        orderBy: { _count: { source: 'desc' } },
      }),
    ]);

    const opportunitiesValue = openOpportunities.reduce((sum, opportunity) => sum + opportunity.value, 0);
    const revenue = wonOpportunities.reduce((sum, opportunity) => sum + opportunity.value, 0);
    const totalSourceLeads = sourceGroups.reduce((sum, source) => sum + source._count.source, 0);

    return {
      kpis: {
        totalLeads: leadsThisMonth,
        leadsGrowth: 0,
        openOpportunities: openOpportunities.length,
        opportunitiesValue,
        closedWon: wonOpportunities.length,
        revenue,
        revenueGrowth: 0,
        conversionRate: contactsTotal > 0 ? Math.round((wonOpportunities.length / contactsTotal) * 100) : 0,
      },
      activities,
      opportunities,
      sourceData: sourceGroups.map((source) => ({
        source: source.source ?? 'Sin fuente',
        leads: source._count.source,
        percentage: totalSourceLeads > 0 ? Math.round((source._count.source / totalSourceLeads) * 100) : 0,
      })),
    };
  } catch (error) {
    if (isDevDemoEnabled() && isDatabaseUnavailable(error)) return devDemoData.dashboard;
    throw error;
  }
}

export async function getLeadSourceReport(): Promise<LeadSourceReport> {
  const workspaceId = await getCurrentWorkspaceId();

  try {
    const [sourceGroups, eventGroups, submissions] = await Promise.all([
      prisma.contact.groupBy({
        by: ['source'],
        where: { workspaceId },
        _count: { source: true },
        orderBy: { _count: { source: 'desc' } },
      }),
      prisma.webEvent.groupBy({ by: ['type'], where: { workspaceId }, _count: { type: true } }),
      prisma.formSubmission.findMany({
        where: { workspaceId },
        include: { form: true, contact: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const totalLeads = sourceGroups.reduce((sum, source) => sum + source._count.source, 0);
    const eventLabels: Record<WebEventType, string> = {
      PAGE_VIEW: 'Page views',
      CTA_CLICK: 'Clicks en CTA',
      FORM_SUBMIT: 'Formularios enviados',
      WHATSAPP_CLICK: 'Clicks WhatsApp',
    };

    return {
      sourceRows: sourceGroups.map((source) => ({
        source: source.source ?? 'Sin fuente',
        leads: source._count.source,
        percentage: totalLeads > 0 ? Math.round((source._count.source / totalLeads) * 100) : 0,
      })),
      eventRows: eventGroups.map((event) => ({
        label: eventLabels[event.type],
        value: event._count.type,
      })),
      recentSubmissions: submissions.map((submission) => ({
        id: submission.id,
        formName: submission.form.name,
        contactName: submission.contact
          ? `${submission.contact.firstName} ${submission.contact.lastName}`
          : 'Sin contacto',
        pageUrl: submission.pageUrl ?? 'Sin URL',
        createdAt: submission.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    if (isDevDemoEnabled() && isDatabaseUnavailable(error)) {
      return {
        sourceRows: devDemoData.dashboard.sourceData.map((source) => ({
          source: source.source,
          leads: source.leads,
          percentage: source.percentage,
        })),
        eventRows: [
          { label: 'Page views', value: 42 },
          { label: 'Clicks en CTA', value: 9 },
          { label: 'Formularios enviados', value: 3 },
        ],
        recentSubmissions: [],
      };
    }
    throw error;
  }
}
