import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ActivityType,
  AutomationAction,
  AutomationTrigger,
  IntegrationProvider,
  IntegrationStatus,
  ContactStatus,
  AiInsightType,
  OpportunityStage,
  OpportunityStatus,
  SubscriptionStatus,
  PrismaClient,
  UserRole,
} from '../generated/prisma/client';
import { hashPassword } from '../src/lib/password';

const seedDatabaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!seedDatabaseUrl) {
  throw new Error('DIRECT_URL or DATABASE_URL is required to seed the CRM database.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: seedDatabaseUrl,
  }),
});

const workspace = {
  name: 'Upzites Demo',
  slug: 'upzites-demo',
  publicKey: 'upzites_demo_public',
};

const users = [
  { name: 'Ana Garcia', email: 'admin@upzites.cl', role: UserRole.OWNER },
  { name: 'Carlos Lopez', email: 'carlos@upzites.cl', role: UserRole.SALES },
  { name: 'Pedro Diaz', email: 'pedro@upzites.cl', role: UserRole.SALES },
];

const stages = [
  { key: OpportunityStage.NEW, name: 'Nuevo', position: 1, probability: 20 },
  { key: OpportunityStage.QUALIFIED, name: 'Calificado', position: 2, probability: 40 },
  { key: OpportunityStage.PROPOSAL, name: 'Propuesta', position: 3, probability: 55 },
  { key: OpportunityStage.NEGOTIATION, name: 'Negociacion', position: 4, probability: 75 },
  { key: OpportunityStage.WON, name: 'Ganado', position: 5, probability: 100, isWon: true },
  { key: OpportunityStage.LOST, name: 'Perdido', position: 6, probability: 0, isLost: true },
];

const contacts = [
  {
    firstName: 'Valentina',
    lastName: 'Torres',
    email: 'vtorres@empresa.cl',
    phone: '+56 9 8765 4321',
    company: 'Constructora Andes',
    status: ContactStatus.CUSTOMER,
    source: 'Sitio Web',
    createdAt: '2026-01-15',
    lastActivityAt: '2026-05-20',
    value: 4_800_000,
    tags: ['construccion', 'vip'],
  },
  {
    firstName: 'Rodrigo',
    lastName: 'Munoz',
    email: 'rmunoz@inmocentro.cl',
    phone: '+56 9 7654 3210',
    company: 'Inmo Centro',
    status: ContactStatus.ACTIVE,
    source: 'WhatsApp',
    createdAt: '2026-02-03',
    lastActivityAt: '2026-05-22',
    value: 2_200_000,
    tags: ['inmobiliaria'],
  },
  {
    firstName: 'Camila',
    lastName: 'Reyes',
    email: 'creyes@salud360.cl',
    phone: '+56 9 6543 2109',
    company: 'Salud 360',
    status: ContactStatus.LEAD,
    source: 'LinkedIn',
    createdAt: '2026-03-10',
    lastActivityAt: '2026-05-24',
    value: 1_500_000,
    tags: ['salud', 'nuevo'],
  },
  {
    firstName: 'Andres',
    lastName: 'Vega',
    email: 'avega@techpyme.cl',
    phone: '+56 9 5432 1098',
    company: 'TechPyme',
    status: ContactStatus.CUSTOMER,
    source: 'Referido',
    createdAt: '2025-11-20',
    lastActivityAt: '2026-05-18',
    value: 6_700_000,
    tags: ['tecnologia', 'vip'],
  },
  {
    firstName: 'Sofia',
    lastName: 'Martinez',
    email: 'smartinez@educaplus.cl',
    phone: '+56 9 4321 0987',
    company: 'EducaPlus',
    status: ContactStatus.ACTIVE,
    source: 'Google Ads',
    createdAt: '2026-01-28',
    lastActivityAt: '2026-05-21',
    value: 3_100_000,
    tags: ['educacion'],
  },
  {
    firstName: 'Felipe',
    lastName: 'Contreras',
    email: 'fcontreras@logistica.cl',
    phone: '+56 9 3210 9876',
    company: 'LogiRapido',
    status: ContactStatus.INACTIVE,
    source: 'Sitio Web',
    createdAt: '2025-09-05',
    lastActivityAt: '2026-02-10',
    value: 890_000,
    tags: ['logistica'],
  },
  {
    firstName: 'Carla',
    lastName: 'Fuentes',
    email: 'cfuentes@restaurante.cl',
    phone: '+56 9 2109 8765',
    company: 'Sabores del Sur',
    status: ContactStatus.LEAD,
    source: 'Instagram',
    createdAt: '2026-04-02',
    lastActivityAt: '2026-05-25',
    value: 750_000,
    tags: ['gastronomia', 'nuevo'],
  },
  {
    firstName: 'Matias',
    lastName: 'Herrera',
    email: 'mherrera@consultora.cl',
    phone: '+56 9 1098 7654',
    company: 'Herrera & Asociados',
    status: ContactStatus.CUSTOMER,
    source: 'Referido',
    createdAt: '2025-08-14',
    lastActivityAt: '2026-05-19',
    value: 9_200_000,
    tags: ['consultoria', 'vip'],
  },
  {
    firstName: 'Ignacia',
    lastName: 'Pizarro',
    email: 'ipizarro@agencia.cl',
    phone: '+56 9 0987 6543',
    company: 'Agencia Creativa',
    status: ContactStatus.ACTIVE,
    source: 'Facebook Ads',
    createdAt: '2026-02-22',
    lastActivityAt: '2026-05-23',
    value: 1_800_000,
    tags: ['marketing'],
  },
  {
    firstName: 'Diego',
    lastName: 'Romero',
    email: 'dromero@retail.cl',
    phone: '+56 9 9876 5432',
    company: 'RetailMax',
    status: ContactStatus.LEAD,
    source: 'Sitio Web',
    createdAt: '2026-05-01',
    lastActivityAt: '2026-05-26',
    value: 2_500_000,
    tags: ['retail', 'nuevo'],
  },
];

const opportunities = [
  ['Sitio web + CRM Constructora Andes', 'vtorres@empresa.cl', OpportunityStage.WON, 4_800_000, 100, '2026-05-15', 'admin@upzites.cl'],
  ['Plataforma e-commerce Inmo Centro', 'rmunoz@inmocentro.cl', OpportunityStage.NEGOTIATION, 3_500_000, 75, '2026-06-30', 'carlos@upzites.cl'],
  ['Web corporativa Salud 360', 'creyes@salud360.cl', OpportunityStage.PROPOSAL, 1_500_000, 50, '2026-07-15', 'admin@upzites.cl'],
  ['CRM + automatizaciones TechPyme', 'avega@techpyme.cl', OpportunityStage.WON, 6_700_000, 100, '2026-04-20', 'pedro@upzites.cl'],
  ['LMS plataforma EducaPlus', 'smartinez@educaplus.cl', OpportunityStage.QUALIFIED, 3_100_000, 40, '2026-08-01', 'carlos@upzites.cl'],
  ['Landing campaign LogiRapido', 'fcontreras@logistica.cl', OpportunityStage.LOST, 890_000, 0, '2026-03-01', 'admin@upzites.cl'],
  ['Web + carta digital Sabores del Sur', 'cfuentes@restaurante.cl', OpportunityStage.NEW, 750_000, 20, '2026-08-30', 'pedro@upzites.cl'],
  ['Portal clientes Herrera & Asoc.', 'mherrera@consultora.cl', OpportunityStage.NEGOTIATION, 9_200_000, 80, '2026-06-15', 'admin@upzites.cl'],
  ['Rebranding + web Agencia Creativa', 'ipizarro@agencia.cl', OpportunityStage.PROPOSAL, 1_800_000, 55, '2026-07-30', 'carlos@upzites.cl'],
  ['Tienda online RetailMax', 'dromero@retail.cl', OpportunityStage.NEW, 2_500_000, 15, '2026-09-15', 'pedro@upzites.cl'],
] as const;

const activities = [
  [ActivityType.DEAL, 'Oportunidad ganada: CRM + automatizaciones TechPyme', 'Andres Vega', '2026-05-26T10:00:00.000Z'],
  [ActivityType.EMAIL, 'Email enviado con propuesta comercial', 'Camila Reyes', '2026-05-26T09:00:00.000Z'],
  [ActivityType.CALL, 'Llamada de seguimiento realizada (25 min)', 'Rodrigo Munoz', '2026-05-26T07:00:00.000Z'],
  [ActivityType.MEETING, 'Reunion de kickoff agendada para el 02/06', 'Matias Herrera', '2026-05-25T12:00:00.000Z'],
  [ActivityType.NOTE, 'Nota: cliente solicita demo de modulo pagos', 'Sofia Martinez', '2026-05-25T09:00:00.000Z'],
  [ActivityType.EMAIL, 'Nuevo lead desde formulario sitio web', 'Diego Romero', '2026-05-24T11:00:00.000Z'],
] as const;

async function main() {
  await prisma.workspace.deleteMany({ where: { slug: workspace.slug } });

  const createdWorkspace = await prisma.workspace.create({
    data: workspace,
  });

  const createdUsers = new Map<string, { id: string; name: string }>();
  for (const user of users) {
    const created = await prisma.user.create({
      data: {
        ...user,
        workspaceId: createdWorkspace.id,
        passwordHash: hashPassword('demo1234'),
      },
    });
    createdUsers.set(user.email, created);
  }

  const createdStages = new Map<OpportunityStage, { id: string }>();
  for (const stage of stages) {
    const created = await prisma.pipelineStage.create({
      data: {
        isWon: false,
        isLost: false,
        ...stage,
        workspaceId: createdWorkspace.id,
      },
    });
    createdStages.set(stage.key, created);
  }

  const createdCompanies = new Map<string, { id: string; name: string }>();
  for (const companyName of new Set(contacts.map((contact) => contact.company))) {
    const created = await prisma.company.create({
      data: {
        workspaceId: createdWorkspace.id,
        name: companyName,
      },
    });
    createdCompanies.set(companyName, created);
  }

  const createdContacts = new Map<string, { id: string; companyId: string | null }>();
  for (const contact of contacts) {
    const created = await prisma.contact.create({
      data: {
        workspaceId: createdWorkspace.id,
        companyId: createdCompanies.get(contact.company)?.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        status: contact.status,
        source: contact.source,
        value: contact.value,
        tags: contact.tags,
        createdAt: new Date(contact.createdAt),
        lastActivityAt: new Date(contact.lastActivityAt),
      },
    });
    createdContacts.set(contact.email, created);
  }

  for (const source of new Set(contacts.map((contact) => contact.source))) {
    await prisma.leadSource.create({
      data: {
        workspaceId: createdWorkspace.id,
        name: source,
      },
    });
  }

  const leadForm = await prisma.form.create({
    data: {
      workspaceId: createdWorkspace.id,
      publicId: 'upzites-demo-contact-form',
      name: 'Formulario contacto sitio web',
      title: 'Conversemos sobre tu proyecto',
      description: 'Cuéntanos qué necesitas y el equipo comercial hará seguimiento desde el CRM.',
      submitLabel: 'Enviar lead',
      source: 'Formulario sitio web',
    },
  });

  const starterPlan = await prisma.subscriptionPlan.upsert({
    where: { key: 'pilot' },
    create: {
      key: 'pilot',
      name: 'Piloto Upzites CRM',
      priceClp: 49000,
      maxUsers: 3,
      maxContacts: 1000,
      features: ['CRM web-first', 'Captura web', 'Automatizaciones basicas', 'Reportes de fuentes'],
    },
    update: {},
  });

  await prisma.workspaceSubscription.create({
    data: {
      workspaceId: createdWorkspace.id,
      planId: starterPlan.id,
      status: SubscriptionStatus.TRIAL,
      trialEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
    },
  });

  await prisma.integration.createMany({
    data: [
      {
        workspaceId: createdWorkspace.id,
        provider: IntegrationProvider.WHATSAPP,
        name: 'WhatsApp Business',
        status: IntegrationStatus.NEEDS_ATTENTION,
        config: { phone: '+56900000000' },
      },
      {
        workspaceId: createdWorkspace.id,
        provider: IntegrationProvider.GOOGLE_CALENDAR,
        name: 'Google Calendar',
        status: IntegrationStatus.DISCONNECTED,
      },
      {
        workspaceId: createdWorkspace.id,
        provider: IntegrationProvider.GMAIL,
        name: 'Gmail',
        status: IntegrationStatus.DISCONNECTED,
      },
      {
        workspaceId: createdWorkspace.id,
        provider: IntegrationProvider.TRANSBANK,
        name: 'Transbank Webpay',
        status: IntegrationStatus.DISCONNECTED,
      },
      {
        workspaceId: createdWorkspace.id,
        provider: IntegrationProvider.MERCADO_PAGO,
        name: 'Mercado Pago',
        status: IntegrationStatus.DISCONNECTED,
      },
      {
        workspaceId: createdWorkspace.id,
        provider: IntegrationProvider.KHIPU,
        name: 'Khipu',
        status: IntegrationStatus.DISCONNECTED,
      },
    ],
  });

  await prisma.automationRule.createMany({
    data: [
      {
        workspaceId: createdWorkspace.id,
        name: 'Crear tarea al recibir lead web',
        description: 'Cuando llega un lead desde formulario, crea una tarea de seguimiento.',
        trigger: AutomationTrigger.LEAD_CREATED,
        action: AutomationAction.CREATE_TASK,
        conditions: { source: 'Formulario sitio web' },
        actionConfig: { dueInHours: 24, title: 'Contactar nuevo lead web' },
      },
      {
        workspaceId: createdWorkspace.id,
        name: 'Detectar oportunidades frias',
        description: 'Genera insight si una oportunidad abierta no tiene actividad reciente.',
        trigger: AutomationTrigger.NO_ACTIVITY,
        action: AutomationAction.CREATE_INSIGHT,
        conditions: { daysWithoutActivity: 3 },
      },
    ],
  });

  for (const [title, email, stage, value, probability, closeDate, ownerEmail] of opportunities) {
    const contact = createdContacts.get(email);
    const stageRecord = createdStages.get(stage);

    if (!contact || !stageRecord) {
      continue;
    }

    await prisma.opportunity.create({
      data: {
        workspaceId: createdWorkspace.id,
        contactId: contact.id,
        companyId: contact.companyId,
        stageId: stageRecord.id,
        ownerId: createdUsers.get(ownerEmail)?.id,
        title,
        value,
        probability,
        expectedCloseDate: new Date(closeDate),
        status:
          stage === OpportunityStage.WON
            ? OpportunityStatus.WON
            : stage === OpportunityStage.LOST
              ? OpportunityStatus.LOST
              : OpportunityStatus.OPEN,
        createdAt: new Date(closeDate),
      },
    });
  }

  for (const [type, title, contactName, createdAt] of activities) {
    const [firstName, ...lastNameParts] = contactName.split(' ');
    const contact = await prisma.contact.findFirst({
      where: {
        workspaceId: createdWorkspace.id,
        firstName,
        lastName: lastNameParts.join(' '),
      },
    });

    await prisma.activity.create({
      data: {
        workspaceId: createdWorkspace.id,
        contactId: contact?.id,
        type,
        title,
        createdAt: new Date(createdAt),
      },
    });
  }

  const reminderContacts = await prisma.contact.findMany({
    where: {
      workspaceId: createdWorkspace.id,
      email: { in: ['rmunoz@inmocentro.cl', 'creyes@salud360.cl'] },
    },
  });

  for (const contact of reminderContacts) {
    await prisma.activity.create({
      data: {
        workspaceId: createdWorkspace.id,
        contactId: contact.id,
        type: ActivityType.CALL,
        title: 'Seguimiento comercial pendiente',
        description: `Llamar a ${contact.firstName} para revisar avance de la oportunidad.`,
        dueAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });
  }

  const coldContact = await prisma.contact.findFirst({
    where: { workspaceId: createdWorkspace.id, email: 'rmunoz@inmocentro.cl' },
  });
  const coldOpportunity = await prisma.opportunity.findFirst({
    where: { workspaceId: createdWorkspace.id, title: { contains: 'Inmo Centro' } },
  });

  await prisma.aiInsight.create({
    data: {
      workspaceId: createdWorkspace.id,
      contactId: coldContact?.id,
      opportunityId: coldOpportunity?.id,
      type: AiInsightType.NEXT_BEST_ACTION,
      title: 'Seguimiento recomendado',
      description: 'La oportunidad sigue abierta y conviene agendar una llamada de avance esta semana.',
      score: 74,
    },
  });

  await prisma.auditLog.createMany({
    data: [
      {
        workspaceId: createdWorkspace.id,
        actorId: createdUsers.get('admin@upzites.cl')?.id,
        action: 'workspace.seeded',
        entity: 'workspace',
        entityId: createdWorkspace.id,
        metadata: { source: 'prisma seed' },
      },
      {
        workspaceId: createdWorkspace.id,
        actorId: createdUsers.get('admin@upzites.cl')?.id,
        action: 'form.created',
        entity: 'form',
        entityId: leadForm.id,
      },
    ],
  });

  await prisma.webEvent.createMany({
    data: [
      {
        workspaceId: createdWorkspace.id,
        type: 'PAGE_VIEW',
        pageUrl: 'https://upzites.cl/',
        referrer: 'https://google.com',
        visitorId: 'demo-visitor-1',
        sessionId: 'demo-session-1',
        utmSource: 'google',
        utmMedium: 'organic',
      },
      {
        workspaceId: createdWorkspace.id,
        type: 'CTA_CLICK',
        pageUrl: 'https://upzites.cl/',
        element: 'hero-contact',
        visitorId: 'demo-visitor-1',
        sessionId: 'demo-session-1',
        utmSource: 'google',
        utmMedium: 'organic',
      },
      {
        workspaceId: createdWorkspace.id,
        type: 'FORM_SUBMIT',
        pageUrl: 'https://upzites.cl/contacto',
        formId: leadForm.id,
        visitorId: 'demo-visitor-2',
        sessionId: 'demo-session-2',
        utmSource: 'sitio-web',
        utmMedium: 'form',
      },
    ],
  });

  console.log(`Seeded CRM workspace "${createdWorkspace.name}" with ${contacts.length} contacts.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
