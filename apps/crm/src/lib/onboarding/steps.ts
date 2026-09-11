import {
  ActivationStatus,
  AgentVersionStatus,
  BusinessType,
  CommerceProvider,
  EmailDomainStatus,
  IntegrationProvider,
  IntegrationStatus,
  PricingRuleSetStatus,
  WhatsAppChannelStatus,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { getEntitlements } from '../billing/usage';
import type { PlanCapability } from '../billing/plans';

/**
 * Wizard de onboarding.
 *
 * **El avance no se guarda: se calcula.** Cada paso mira el estado real —hay un
 * canal conectado, hay una plantilla publicada, hay un agente probado— en vez
 * de leer una casilla que alguien marco alguna vez. Un checklist almacenado
 * empieza a mentir en el momento en que el cliente desconecta WhatsApp: seguiria
 * diciendo "listo" sobre algo que ya no existe.
 *
 * El costo es unas cuantas consultas cada vez que se abre el wizard. El
 * beneficio es que el estado mostrado es siempre cierto, y que "activar" puede
 * exigir de verdad lo que dice exigir.
 */

export const ONBOARDING_STEPS = [
  'negocio',
  'horarios',
  'whatsapp',
  'tipo-negocio',
  'catalogo',
  'pagos',
  'email',
  'informacion',
  'prueba-agente',
  'activacion',
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number];

export type StepState = {
  key: OnboardingStepKey;
  title: string;
  description: string;
  done: boolean;
  /** Obligatorio para activar. Los opcionales dependen del plan o del rubro. */
  required: boolean;
  /** Que falta, en palabras que el cliente pueda accionar. */
  hint?: string;
  /** A donde ir a resolverlo. */
  href?: string;
};

type Context = {
  workspaceId: string;
  businessType: BusinessType;
  capabilities: PlanCapability[];
};

type StepDefinition = {
  key: OnboardingStepKey;
  title: string;
  description: string;
  href?: string;
  /** Por defecto obligatorio; un paso decide no serlo segun plan o rubro. */
  isRequired?: (context: Context) => boolean;
  check: (context: Context) => Promise<{ done: boolean; hint?: string }>;
};

const definitions: StepDefinition[] = [
  {
    key: 'negocio',
    title: 'Datos del negocio',
    description: 'Nombre, pais y moneda con la que cobras.',
    href: '/configuracion',
    check: async ({ workspaceId }) => {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true, profile: { select: { currency: true, country: true } } },
      });

      const done = Boolean(workspace?.name && workspace.profile?.currency);
      return { done, hint: done ? undefined : 'Falta confirmar la moneda del negocio.' };
    },
  },
  {
    key: 'horarios',
    title: 'Zona horaria y horarios',
    description: 'Cuando se atiende y en que ventana no se envia nada.',
    href: '/configuracion',
    check: async ({ workspaceId }) => {
      const policy = await prisma.messagingPolicy.findUnique({
        where: { workspaceId },
        select: { timezone: true },
      });
      const profile = await prisma.workspaceProfile.findUnique({
        where: { workspaceId },
        select: { businessDays: true },
      });

      const done = Boolean(policy?.timezone) && (profile?.businessDays.length ?? 0) > 0;
      return { done, hint: done ? undefined : 'Falta definir los dias de atencion.' };
    },
  },
  {
    key: 'whatsapp',
    title: 'Conectar WhatsApp',
    description: 'El canal por el que conversa el agente.',
    href: '/integraciones',
    isRequired: ({ capabilities }) => capabilities.includes('WHATSAPP'),
    check: async ({ workspaceId }) => {
      const channel = await prisma.whatsAppChannel.findFirst({
        where: { workspaceId, status: WhatsAppChannelStatus.CONNECTED },
        select: { id: true },
      });

      return {
        done: channel !== null,
        hint: channel ? undefined : 'Conecta un numero desde Integraciones.',
      };
    },
  },
  {
    key: 'tipo-negocio',
    title: 'Tipo de negocio',
    description: 'Infoproducto, ecommerce o servicios. Decide que falta configurar.',
    href: '/configuracion',
    check: async ({ businessType }) => ({
      done: businessType !== BusinessType.UNDEFINED,
      hint: businessType === BusinessType.UNDEFINED ? 'Elige como vendes.' : undefined,
    }),
  },
  {
    key: 'catalogo',
    title: 'Catalogo o reglas de precio',
    description: 'Lo que el agente puede ofrecer y a que precio.',
    href: '/productos',
    // Lo que hace falta depende de como vende el cliente, no de su rubro.
    check: async ({ workspaceId, businessType }) => {
      if (businessType === BusinessType.SERVICES) {
        const published = await prisma.pricingRuleSet.findFirst({
          where: { workspaceId, status: PricingRuleSetStatus.PUBLISHED },
          select: { id: true },
        });
        return {
          done: published !== null,
          hint: published ? undefined : 'Publica al menos un servicio cotizable.',
        };
      }

      const products = await prisma.product.count({ where: { workspaceId } });
      if (products > 0) return { done: true };

      const shopify = await prisma.commerceConnection.findFirst({
        where: { workspaceId, provider: CommerceProvider.SHOPIFY, status: 'CONNECTED' },
        select: { id: true },
      });

      return {
        done: shopify !== null,
        hint: 'Carga productos o conecta tu tienda Shopify.',
      };
    },
  },
  {
    key: 'pagos',
    title: 'Cobros',
    description: 'Como se cobra: Mercado Pago o el checkout de Shopify.',
    href: '/integraciones',
    isRequired: ({ capabilities }) => capabilities.includes('PAYMENTS'),
    check: async ({ workspaceId }) => {
      const mercadoPago = await prisma.integration.findFirst({
        where: {
          workspaceId,
          provider: IntegrationProvider.MERCADO_PAGO,
          status: IntegrationStatus.CONNECTED,
        },
        select: { id: true },
      });

      if (mercadoPago) return { done: true };

      // Shopify trae su propio checkout: quien vende ahi no necesita Mercado
      // Pago para cobrar.
      const shopify = await prisma.commerceConnection.findFirst({
        where: { workspaceId, provider: CommerceProvider.SHOPIFY, status: 'CONNECTED' },
        select: { id: true },
      });

      return {
        done: shopify !== null,
        hint: 'Conecta Mercado Pago o vende con el checkout de Shopify.',
      };
    },
  },
  {
    key: 'email',
    title: 'Dominio de envio',
    description: 'Sin dominio verificado no sale ningun email comercial.',
    href: '/recuperacion',
    isRequired: ({ capabilities }) => capabilities.includes('EMAIL'),
    check: async ({ workspaceId }) => {
      const domain = await prisma.emailDomain.findFirst({
        where: { workspaceId, status: EmailDomainStatus.VERIFIED },
        select: { id: true },
      });

      return {
        done: domain !== null,
        hint: domain ? undefined : 'Registra tu dominio y publica los registros DNS.',
      };
    },
  },
  {
    key: 'informacion',
    title: 'Informacion y politicas',
    description: 'Lo que el agente puede responder sin inventar.',
    href: '/configuracion',
    check: async ({ workspaceId }) => {
      const profile = await prisma.workspaceProfile.findUnique({
        where: { workspaceId },
        select: { about: true, policies: true },
      });

      const done = Boolean(profile?.about?.trim()) && Boolean(profile?.policies?.trim());
      return {
        done,
        hint: done ? undefined : 'Describe el negocio y sus politicas de despacho o garantia.',
      };
    },
  },
  {
    key: 'prueba-agente',
    title: 'Probar el agente',
    description: 'Conversar con el en el simulador antes de soltarlo.',
    href: '/automatizaciones',
    isRequired: ({ capabilities }) => capabilities.includes('AI_AGENTS'),
    check: async ({ workspaceId }) => {
      const tested = await prisma.agentRun.findFirst({
        where: { workspaceId, trigger: 'simulador' },
        select: { id: true },
      });

      if (!tested) {
        return { done: false, hint: 'Prueba el agente en el simulador al menos una vez.' };
      }

      const published = await prisma.agentVersion.findFirst({
        where: {
          status: AgentVersionStatus.PUBLISHED,
          definition: { workspaceId },
        },
        select: { id: true },
      });

      return {
        done: published !== null,
        hint: published ? undefined : 'Publica la version del agente que probaste.',
      };
    },
  },
  {
    key: 'activacion',
    title: 'Activar',
    description: 'A partir de aqui el agente atiende de verdad.',
    check: async ({ workspaceId }) => {
      const activation = await prisma.workspaceActivation.findUnique({
        where: { workspaceId },
        select: { status: true },
      });

      return { done: activation?.status === ActivationStatus.ACTIVE };
    },
  },
];

export type OnboardingState = {
  status: ActivationStatus;
  businessType: BusinessType;
  steps: StepState[];
  /** Pasos obligatorios cumplidos / total. */
  completed: number;
  total: number;
  /** Todo lo obligatorio menos la activacion misma esta listo. */
  canActivate: boolean;
  /** Que falta para poder activar. Vacio si ya se puede. */
  blockers: string[];
};

export async function getOnboardingState(workspaceId: string): Promise<OnboardingState> {
  const [profile, activation, entitlements] = await Promise.all([
    prisma.workspaceProfile.findUnique({ where: { workspaceId } }),
    prisma.workspaceActivation.findUnique({ where: { workspaceId } }),
    getEntitlements(workspaceId),
  ]);

  const context: Context = {
    workspaceId,
    businessType: profile?.businessType ?? BusinessType.UNDEFINED,
    capabilities: entitlements?.plan.capabilities ?? [],
  };

  const steps: StepState[] = [];

  for (const definition of definitions) {
    const required = definition.isRequired ? definition.isRequired(context) : true;
    const result = await definition.check(context);

    steps.push({
      key: definition.key,
      title: definition.title,
      description: definition.description,
      href: definition.href,
      required,
      done: result.done,
      hint: result.hint,
    });
  }

  // La activacion no se cuenta como requisito de si misma.
  const prerequisites = steps.filter((step) => step.required && step.key !== 'activacion');
  const blockers = prerequisites.filter((step) => !step.done);

  return {
    status: activation?.status ?? ActivationStatus.ONBOARDING,
    businessType: context.businessType,
    steps,
    completed: prerequisites.filter((step) => step.done).length,
    total: prerequisites.length,
    canActivate: blockers.length === 0,
    blockers: blockers.map((step) => step.hint ?? step.title),
  };
}
