import {
  ActivationStatus,
  AgentVersionStatus,
  BusinessType,
  CommerceProvider,
  EmailDomainStatus,
  IntegrationProvider,
  IntegrationStatus,
  MessageDirection,
  PricingRuleSetStatus,
  WhatsAppChannelStatus,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { getEntitlements } from '../billing/usage';
import { isBusinessTypeConfigured } from './profile-input';
import { isRuleSetUsable } from '../quotes/schema';
import {
  canShopifyCompleteCatalog,
  getCatalogRequirement,
  getCatalogSettingsHref,
} from './catalog';
import {
  agentNeed,
  catalogNeed,
  emailNeed,
  paymentsNeed,
  whatsappNeed,
  type NeedLevel,
  type PlanCapabilities,
  type StepNeed,
} from './requirements';

/**
 * Wizard de puesta en marcha.
 *
 * **El avance no se guarda: se calcula.** Cada paso mira el estado real —hay un
 * canal conectado, hay una plantilla publicada, hay un agente probado— en vez
 * de leer una casilla que alguien marco alguna vez. Un checklist almacenado
 * empieza a mentir en el momento en que el cliente desconecta WhatsApp: seguiria
 * diciendo "listo" sobre algo que ya no existe.
 *
 * Dos cosas mas que este archivo se toma en serio:
 *
 * - **Lo que se exige depende de como vende el cliente**, no de su rubro ni del
 *   catalogo completo de funciones del producto. Ver `requirements.ts`.
 * - **Guardado, verificado y probado no son lo mismo.** Un numero con las
 *   credenciales cargadas pero sin confirmar por Meta no esta conectado, y
 *   decir que si es la forma mas rapida de que alguien active y se quede sin
 *   atender a nadie.
 *
 * El costo es unas cuantas consultas cada vez que se abre el wizard. El
 * beneficio es que el estado mostrado es siempre cierto.
 */

export const ONBOARDING_STEPS = [
  'negocio',
  'horarios',
  'plan',
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

/**
 * Hasta donde llego este paso de verdad.
 *
 * Existe porque "listo" tapa tres situaciones distintas: lo que el cliente
 * escribio, lo que el proveedor confirmo, y lo que se vio funcionar. Solo la
 * tercera es una promesa.
 */
export type StepEvidence = 'PENDIENTE' | 'GUARDADO' | 'VERIFICADO' | 'PROBADO';

export type StepState = {
  key: OnboardingStepKey;
  title: string;
  description: string;
  done: boolean;
  /** Obligatorio, opcional, o fuera del plan contratado. */
  level: NeedLevel;
  /** Por que se pide. Se muestra para que nadie configure a ciegas. */
  why?: string;
  evidence: StepEvidence;
  /** Que falta, en palabras que el cliente pueda accionar. */
  hint?: string;
  /** A donde ir a resolverlo. */
  href?: string;
  /** Que va a hacer ahi, en un verbo. */
  action?: string;
};

type Context = {
  workspaceId: string;
  businessType: BusinessType;
  /** `null` cuando todavia no hay plan contratado. */
  capabilities: PlanCapabilities;
  hasPlan: boolean;
};

type CheckResult = { done: boolean; hint?: string; evidence?: StepEvidence };

type StepDefinition = {
  key: OnboardingStepKey;
  title: string;
  description: string;
  href?: string | ((context: Context) => string);
  action?: string;
  /** Por defecto obligatorio y sin explicacion extra. */
  need?: (context: Context) => StepNeed;
  check: (context: Context) => Promise<CheckResult>;
};

const definitions: StepDefinition[] = [
  {
    key: 'negocio',
    title: 'Datos del negocio',
    description: 'Nombre, país y moneda con la que cobras.',
    href: '/configuracion',
    action: 'Completar',
    need: () => ({
      level: 'REQUIRED',
      why: 'La moneda define cómo se muestran todos los precios que verá tu cliente.',
    }),
    check: async ({ workspaceId }) => {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true, profile: { select: { currency: true, country: true } } },
      });

      const done = Boolean(workspace?.name && workspace.profile?.currency);
      return {
        done,
        evidence: done ? 'GUARDADO' : 'PENDIENTE',
        hint: done ? undefined : 'Falta confirmar la moneda del negocio.',
      };
    },
  },
  {
    key: 'horarios',
    title: 'Horario de atención',
    description: 'Cuándo se atiende y en qué horas no se le escribe a nadie.',
    href: '/configuracion',
    action: 'Completar',
    need: () => ({
      level: 'REQUIRED',
      why: 'Fuera de ese horario no se envía nada automático. Es lo que evita que a un cliente le llegue una promoción a las tres de la mañana.',
    }),
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
      return {
        done,
        evidence: done ? 'GUARDADO' : 'PENDIENTE',
        hint: done ? undefined : 'Falta definir los días de atención.',
      };
    },
  },
  {
    key: 'plan',
    title: 'Plan contratado',
    description: 'Define cuánto puedes usar y qué funciones tienes disponibles.',
    href: '/billing',
    action: 'Elegir plan',
    need: () => ({
      level: 'REQUIRED',
      why: 'De él dependen los límites y las funciones que aparecen más abajo.',
    }),
    check: async ({ workspaceId, hasPlan }) => {
      if (!hasPlan) {
        return {
          done: false,
          evidence: 'PENDIENTE',
          hint: 'Elige un plan para saber con qué funciones cuentas.',
        };
      }

      const entitlements = await getEntitlements(workspaceId);
      return entitlements?.active
        ? { done: true, evidence: 'VERIFICADO' }
        : {
            done: false,
            evidence: 'GUARDADO',
            hint: 'Tu plan figura, pero la suscripción no está al día.',
          };
    },
  },
  {
    key: 'whatsapp',
    title: 'Conectar WhatsApp',
    description: 'El número por el que conversas con tus clientes.',
    href: '/integraciones',
    action: 'Conectar',
    need: ({ capabilities }) => whatsappNeed(capabilities),
    check: async ({ workspaceId }) => {
      // Se miran todos los numeros del workspace, no solo los que ya pasaron
      // todas las comprobaciones: un numero a medio conectar es informacion
      // util, y decir "conecta un numero" a quien ya lo hizo lo deja perdido.
      const channel = await prisma.whatsAppChannel.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          accessTokenEncrypted: true,
          lastHealthCheckAt: true,
          webhookSubscribedAt: true,
        },
      });

      if (!channel) {
        return {
          done: false,
          evidence: 'PENDIENTE',
          hint: 'Conecta tu número de WhatsApp Business.',
        };
      }

      const verified =
        channel.status === WhatsAppChannelStatus.CONNECTED &&
        channel.accessTokenEncrypted !== null &&
        channel.lastHealthCheckAt !== null &&
        channel.webhookSubscribedAt !== null;

      if (!verified) {
        return {
          done: false,
          evidence: 'GUARDADO',
          hint: 'El número quedó guardado, pero WhatsApp todavía no confirmó la conexión. Vuelve a Integraciones y verifícalo.',
        };
      }

      // La prueba de que funciona no es que Meta diga que si: es que haya
      // entrado un mensaje real.
      const received = await prisma.message.findFirst({
        where: {
          workspaceId,
          direction: MessageDirection.INBOUND,
          conversation: { channelId: channel.id },
        },
        select: { id: true },
      });

      return {
        done: true,
        evidence: received ? 'PROBADO' : 'VERIFICADO',
        hint: received
          ? undefined
          : 'Conectado. Escríbele al número desde tu teléfono para verlo llegar a la bandeja.',
      };
    },
  },
  {
    key: 'tipo-negocio',
    title: 'Cómo vendes',
    description: 'Servicios a medida, productos físicos o productos digitales.',
    href: '/configuracion#modalidad-venta',
    action: 'Elegir',
    need: () => ({
      level: 'REQUIRED',
      why: 'Es lo que decide el resto de la lista: quien vende servicios cotiza, quien vende productos cobra. No pedimos lo mismo a los dos.',
    }),
    check: async ({ businessType }) => {
      const done = isBusinessTypeConfigured(businessType);
      return {
        done,
        evidence: done ? 'GUARDADO' : 'PENDIENTE',
        hint: done ? undefined : 'Elige cómo vendes.',
      };
    },
  },
  {
    key: 'catalogo',
    title: 'Qué ofreces y a qué precio',
    description: 'Lo que el agente puede proponer sin inventar.',
    href: ({ businessType }) => getCatalogSettingsHref(businessType),
    action: 'Configurar',
    need: ({ businessType, capabilities }) => catalogNeed(businessType, capabilities),
    // Lo que hace falta depende de como vende el cliente, no de su rubro.
    check: async ({ workspaceId, businessType, capabilities }) => {
      const requirement = getCatalogRequirement(businessType);

      if (requirement === 'SERVICES_PRICING') {
        if (!capabilities?.includes('QUOTES')) {
          return {
            done: false,
            evidence: 'PENDIENTE',
            hint: capabilities === null
              ? 'Elige un plan que incluya cotizaciones para ofrecer servicios.'
              : 'Tu plan no permite cotizar servicios. Cambia de plan o de modalidad de venta.',
          };
        }
        const sets = await prisma.pricingRuleSet.findMany({
          where: { workspaceId },
          select: { status: true, intakeSchema: true, rules: true },
        });

        const usable = sets.some(
          (set) =>
            set.status === PricingRuleSetStatus.PUBLISHED &&
            isRuleSetUsable(set.intakeSchema, set.rules),
        );

        if (usable) return { done: true, evidence: 'VERIFICADO' };

        // Un borrador guardado no es un servicio publicado, pero tampoco es
        // empezar de cero: conviene que el mensaje lo reconozca.
        return {
          done: false,
          evidence: sets.length > 0 ? 'GUARDADO' : 'PENDIENTE',
          hint:
            sets.length > 0
              ? 'Tienes un servicio a medio configurar. Publícalo para que el agente pueda cotizar con él.'
              : 'Crea un servicio y su regla de precio.',
        };
      }

      const productType = requirement === 'DIGITAL_PRODUCTS' ? 'DIGITAL' : 'PHYSICAL';
      const products = await prisma.product.count({
        where: {
          workspaceId,
          type: productType,
          status: 'ACTIVE',
          variants: {
            some: {
              isActive: true,
              OR: [{ inventory: null }, { inventory: { gt: 0 } }],
            },
          },
          ...(productType === 'DIGITAL' ? { assets: { some: {} } } : {}),
        },
      });
      if (products > 0) return { done: true, evidence: 'VERIFICADO' };

      // Esta condición también protege el criterio si en el futuro cambia el
      // orden de las ramas: Shopify nunca sustituye las reglas de Servicios.
      if (!canShopifyCompleteCatalog(businessType)) {
        return {
          done: false,
          evidence: 'PENDIENTE',
          hint: 'Crea un servicio y su regla de precio.',
        };
      }

      const shopify = await prisma.commerceConnection.findFirst({
        where: { workspaceId, provider: CommerceProvider.SHOPIFY, status: 'CONNECTED' },
        select: { id: true },
      });

      if (shopify) return { done: true, evidence: 'VERIFICADO' };

      // Cargar productos a mano alcanza: la tienda conectada es una via, no un
      // requisito.
      const anyProduct = await prisma.product.count({ where: { workspaceId } });

      return {
        done: false,
        evidence: anyProduct > 0 ? 'GUARDADO' : 'PENDIENTE',
        hint:
          anyProduct > 0
            ? 'Tienes productos cargados, pero ninguno disponible para vender. Revisa que estén activos y con stock.'
            : 'Carga tus productos a mano, o conecta tu tienda si ya vendes en Shopify.',
      };
    },
  },
  {
    key: 'pagos',
    title: 'Cobrar dentro del chat',
    description: 'Para que el cliente pague sin salir de la conversación.',
    href: '/integraciones',
    action: 'Conectar',
    need: ({ businessType, capabilities }) => paymentsNeed(businessType, capabilities),
    check: async ({ workspaceId }) => {
      const mercadoPago = await prisma.integration.findFirst({
        where: { workspaceId, provider: IntegrationProvider.MERCADO_PAGO },
        select: { status: true },
      });

      if (mercadoPago?.status === IntegrationStatus.CONNECTED) {
        return { done: true, evidence: 'VERIFICADO' };
      }

      // Shopify trae su propio checkout: quien vende ahi no necesita Mercado
      // Pago para cobrar.
      const shopify = await prisma.commerceConnection.findFirst({
        where: { workspaceId, provider: CommerceProvider.SHOPIFY, status: 'CONNECTED' },
        select: { id: true },
      });

      if (shopify) return { done: true, evidence: 'VERIFICADO' };

      return {
        done: false,
        evidence: mercadoPago ? 'GUARDADO' : 'PENDIENTE',
        hint: mercadoPago
          ? 'Las credenciales de cobro están cargadas, pero la conexión no quedó confirmada.'
          : 'Conecta Mercado Pago, o usa el checkout de tu tienda si vendes en Shopify.',
      };
    },
  },
  {
    key: 'email',
    title: 'Correo con tu dominio',
    description: 'Para que los correos salgan a tu nombre y no a spam.',
    href: '/recuperacion',
    action: 'Verificar dominio',
    need: ({ businessType, capabilities }) => emailNeed(businessType, capabilities),
    check: async ({ workspaceId }) => {
      const domain = await prisma.emailDomain.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        select: { status: true },
      });

      if (domain?.status === EmailDomainStatus.VERIFIED) {
        return { done: true, evidence: 'VERIFICADO' };
      }

      return {
        done: false,
        evidence: domain ? 'GUARDADO' : 'PENDIENTE',
        hint: domain
          ? 'Tu dominio está registrado y esperando. Falta pegar los datos que te damos donde compraste el dominio.'
          : 'Registra el dominio desde el que quieres enviar correos.',
      };
    },
  },
  {
    key: 'informacion',
    title: 'Qué puede contar el agente',
    description: 'Cómo describes tu negocio y tus condiciones.',
    href: '/configuracion',
    action: 'Escribir',
    need: () => ({
      level: 'REQUIRED',
      why: 'Es lo único que el agente puede afirmar. Lo que no esté aquí, no lo dirá, y esa es la idea.',
    }),
    check: async ({ workspaceId }) => {
      const profile = await prisma.workspaceProfile.findUnique({
        where: { workspaceId },
        select: { about: true, policies: true },
      });

      const about = Boolean(profile?.about?.trim());
      const policies = Boolean(profile?.policies?.trim());

      if (about && policies) return { done: true, evidence: 'GUARDADO' };

      return {
        done: false,
        evidence: about || policies ? 'GUARDADO' : 'PENDIENTE',
        hint: about
          ? 'Falta escribir tus condiciones: despacho, garantía, devoluciones.'
          : 'Describe tu negocio y tus condiciones.',
      };
    },
  },
  {
    key: 'prueba-agente',
    title: 'Probar el agente',
    description: 'Conversar con él antes de que le hable un cliente.',
    href: '/automatizaciones',
    action: 'Probar',
    need: ({ capabilities }) => agentNeed(capabilities),
    check: async ({ workspaceId }) => {
      const published = await prisma.agentVersion.findFirst({
        where: { status: AgentVersionStatus.PUBLISHED, definition: { workspaceId } },
        select: { id: true },
      });

      const tested = await prisma.agentRun.findFirst({
        where: { workspaceId, trigger: 'simulador' },
        select: { id: true },
      });

      if (!tested) {
        return {
          done: false,
          evidence: published ? 'GUARDADO' : 'PENDIENTE',
          hint: 'Escríbele al agente en el simulador y mira cómo responde.',
        };
      }

      if (!published) {
        return {
          done: false,
          evidence: 'PROBADO',
          hint: 'Ya lo probaste. Falta publicar esa versión para que sea la que atienda.',
        };
      }

      return { done: true, evidence: 'PROBADO' };
    },
  },
  {
    key: 'activacion',
    title: 'Activar',
    description: 'A partir de aquí el agente atiende de verdad.',
    check: async ({ workspaceId }) => {
      const activation = await prisma.workspaceActivation.findUnique({
        where: { workspaceId },
        select: { status: true },
      });

      const done = activation?.status === ActivationStatus.ACTIVE;
      return { done, evidence: done ? 'VERIFICADO' : 'PENDIENTE' };
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
    capabilities: entitlements?.plan.capabilities ?? null,
    hasPlan: entitlements !== null,
  };

  const steps: StepState[] = [];

  for (const definition of definitions) {
    const need = definition.need
      ? definition.need(context)
      : ({ level: 'REQUIRED' } as StepNeed);
    const result = await definition.check(context);

    steps.push({
      key: definition.key,
      title: definition.title,
      description: definition.description,
      href: typeof definition.href === 'function' ? definition.href(context) : definition.href,
      action: definition.action,
      level: need.level,
      why: need.why,
      done: result.done,
      evidence: result.evidence ?? (result.done ? 'GUARDADO' : 'PENDIENTE'),
      hint: result.hint,
    });
  }

  // La activacion no se cuenta como requisito de si misma.
  const prerequisites = steps.filter(
    (step) => step.level === 'REQUIRED' && step.key !== 'activacion',
  );
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
