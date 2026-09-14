import Link from 'next/link';
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  FileText,
  Globe2,
  Settings2,
  ShoppingCart,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireCurrentUser } from '@/lib/auth';
import { getPipelineStages } from '@/lib/crm-data';
import { isDatabaseUnavailable, isDevDemoEnabled } from '@/lib/dev-demo';
import { canManageMarketing } from '@/lib/marketing/roles';
import { prisma } from '@/lib/prisma';
import { BusinessType, UserRole } from '../../../../generated/prisma/client';
import { BusinessSettingsForm, HoursSettingsForm, InformationSettingsForm } from './settings-forms';
import { ServicesPricing, type ServiceRuleSetView } from './services-pricing';
import { WebsiteConnection } from './website-connection';

export const dynamic = 'force-dynamic';

const navigation = [
  ['mi-negocio', 'Mi negocio'],
  ['ventas', 'Ventas y cotizaciones'],
  ['horarios', 'Horarios de atención'],
  ['informacion', 'Información y políticas'],
  ['sitio-web', 'Conexión con mi sitio web'],
  ['avanzada', 'Configuración avanzada'],
] as const;

export default async function ConfiguracionPage() {
  const user = await requireCurrentUser();
  const baseUrl = process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001';
  const [form, stages, workspacePublicKey, storedProfile, timezone, pricingRuleSets] =
    await Promise.all([
      getActiveForm(user.workspace.id),
      getPipelineStages(),
      getWorkspacePublicKey(user.workspace.id),
      getWorkspaceProfile(user.workspace.id),
      getWorkspaceTimezone(user.workspace.id),
      getPricingRuleSets(user.workspace.id),
    ]);

  const profile = { ...storedProfile, businessName: user.workspace.name };
  const canEdit = canManageMarketing(user.role);
  const snippet = `<script async src="${baseUrl}/api/capture/snippet?key=${workspacePublicKey}"></script>`;
  const formEmbed = form
    ? `<iframe src="${baseUrl}/api/capture/forms/${form.publicId}?pageUrl=https://tusitio.cl/contacto" style="width:100%;height:520px;border:0"></iframe>`
    : '';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header title="Configuración" subtitle="Información y preferencias de tu negocio" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 sm:px-6 xl:grid-cols-[220px_minmax(0,1fr)] xl:px-8">
          <aside className="min-w-0 self-start xl:sticky xl:top-6">
            <nav
              aria-label="Secciones de configuración"
              className="-mx-1 flex flex-wrap gap-1 px-1 pb-2 xl:flex-col xl:pb-0"
            >
              {navigation.map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="shrink-0 rounded-lg px-3 py-2 text-sm text-slate-600 outline-none hover:bg-white hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {label}
                </a>
              ))}
            </nav>
          </aside>

          <main className="min-w-0 space-y-8 pb-10">
            <SettingsSection
              id="mi-negocio"
              icon={BriefcaseBusiness}
              title="Mi negocio"
              description="Cuéntanos qué hace tu negocio y cómo vende principalmente."
            >
              <BusinessSettingsForm initial={profile} canEdit={canEdit} />
            </SettingsSection>

            <SettingsSection
              id="ventas"
              icon={ShoppingCart}
              title="Ventas y cotizaciones"
              description="Revisa el recorrido de tus oportunidades y administra lo que vendes."
            >
              <div className="space-y-6">
                {profile.businessType === BusinessType.SERVICES ? (
                  <ServicesPricing
                    services={pricingRuleSets}
                    canEdit={canEdit}
                    canPublish={user.role === UserRole.OWNER}
                  />
                ) : profile.businessType === BusinessType.ECOMMERCE ||
                  profile.businessType === BusinessType.INFOPRODUCT ? (
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                    <h3 className="text-sm font-semibold text-slate-900">Catálogo de productos</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      Puedes mantener un catálogo manual en el CRM. Shopify es una alternativa
                      disponible desde Integraciones, pero no es obligatorio.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <SettingsLink href="/productos">Agregar mi primer producto</SettingsLink>
                      <SettingsLink href="/integraciones">Revisar Shopify</SettingsLink>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                    Elige primero tu modalidad de venta en «Mi negocio» para mostrar la
                    configuración correspondiente.
                  </p>
                )}
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-900">Etapas de venta</h3>
                    <div className="divide-y rounded-xl border border-slate-200 bg-white">
                      {stages.map((stage) => (
                        <div
                          key={stage.id}
                          className="flex items-center justify-between gap-4 px-4 py-3"
                        >
                          <span className="text-sm font-medium text-slate-800">{stage.name}</span>
                          <Badge
                            variant={
                              stage.isWon ? 'success' : stage.isLost ? 'destructive' : 'outline'
                            }
                          >
                            {stage.probability}% de probabilidad
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3 rounded-xl bg-slate-50 p-4">
                    <h3 className="text-sm font-semibold text-slate-900">Administrar ventas</h3>
                    <p className="text-xs leading-5 text-slate-600">
                      Los productos, servicios y cotizaciones se administran en sus módulos para
                      conservar todas sus herramientas.
                    </p>
                    <SettingsLink href="/productos">Productos y servicios</SettingsLink>
                    <SettingsLink href="/cotizaciones">Cotizaciones</SettingsLink>
                    <SettingsLink href="/oportunidades">Oportunidades</SettingsLink>
                  </div>
                </div>
              </div>
            </SettingsSection>

            <SettingsSection
              id="horarios"
              icon={CalendarClock}
              title="Horarios de atención"
              description="Define cuándo tu equipo está disponible para atender clientes."
            >
              <HoursSettingsForm initial={profile} timezone={timezone} canEdit={canEdit} />
            </SettingsSection>

            <SettingsSection
              id="informacion"
              icon={FileText}
              title="Información y políticas"
              description="Guarda respuestas claras sobre tu negocio, entregas y condiciones."
            >
              <InformationSettingsForm initial={profile} canEdit={canEdit} />
            </SettingsSection>

            <SettingsSection
              id="sitio-web"
              icon={Globe2}
              title="Conexión con mi sitio web"
              description="Estas opciones son para conectar el CRM con un sitio web existente."
            >
              <WebsiteConnection snippet={snippet} formEmbed={formEmbed} hasForm={Boolean(form)} />
            </SettingsSection>

            <SettingsSection
              id="avanzada"
              icon={Settings2}
              title="Configuración avanzada"
              description="Datos técnicos para integraciones y soporte."
            >
              <details className="group rounded-xl border border-slate-200 bg-white">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  Ver identificadores técnicos
                </summary>
                <dl className="grid gap-4 border-t border-slate-200 p-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium text-slate-500">
                      Identificador del espacio de trabajo
                    </dt>
                    <dd className="mt-1 break-all font-mono text-xs text-slate-800">
                      {user.workspace.slug}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">
                      Clave pública para el sitio web
                    </dt>
                    <dd className="mt-1 break-all font-mono text-xs text-slate-800">
                      {workspacePublicKey}
                    </dd>
                  </div>
                </dl>
              </details>
            </SettingsSection>
          </main>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({
  id,
  icon: Icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: typeof BriefcaseBusiness;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6">
      <Card className="border-0 shadow-sm">
        <CardHeader className="border-b border-slate-100 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <CardTitle className="text-base text-slate-900">{title}</CardTitle>
              <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">{children}</CardContent>
      </Card>
    </section>
  );
}

function SettingsLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 outline-none hover:border-blue-300 focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

async function getActiveForm(workspaceId: string) {
  try {
    return await prisma.form.findFirst({
      where: { workspaceId, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { publicId: true },
    });
  } catch (error) {
    if (isDevDemoEnabled() && isDatabaseUnavailable(error)) return { publicId: 'demo-contacto' };
    throw error;
  }
}

async function getWorkspacePublicKey(workspaceId: string) {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { publicKey: true },
    });
    return workspace?.publicKey ?? '';
  } catch (error) {
    if (isDevDemoEnabled() && isDatabaseUnavailable(error)) return 'dev-demo-public-key';
    throw error;
  }
}

async function getWorkspaceProfile(workspaceId: string) {
  try {
    const profile = await prisma.workspaceProfile.findUnique({ where: { workspaceId } });
    return profile ?? defaultProfile();
  } catch (error) {
    if (isDevDemoEnabled() && isDatabaseUnavailable(error)) return defaultProfile();
    throw error;
  }
}

function defaultProfile() {
  return {
    businessType: BusinessType.UNDEFINED,
    industry: null,
    industryOther: null,
    businessStartMinute: 540,
    businessEndMinute: 1080,
    businessDays: [1, 2, 3, 4, 5],
    about: null,
    policies: null,
    shippingInfo: null,
    returnsPolicy: null,
  };
}

async function getWorkspaceTimezone(workspaceId: string) {
  try {
    const policy = await prisma.messagingPolicy.findUnique({
      where: { workspaceId },
      select: { timezone: true },
    });
    return policy?.timezone ?? 'America/Santiago';
  } catch (error) {
    if (isDevDemoEnabled() && isDatabaseUnavailable(error)) return 'America/Santiago';
    throw error;
  }
}

async function getPricingRuleSets(workspaceId: string): Promise<ServiceRuleSetView[]> {
  try {
    const sets = await prisma.pricingRuleSet.findMany({
      where: { workspaceId, status: { in: ['DRAFT', 'PUBLISHED'] } },
      orderBy: [{ serviceKey: 'asc' }, { version: 'desc' }],
      select: {
        id: true,
        serviceKey: true,
        name: true,
        description: true,
        currency: true,
        intakeSchema: true,
        rules: true,
        disclaimer: true,
        validityDays: true,
        status: true,
        version: true,
      },
    });
    const grouped = new Map<string, ServiceRuleSetView>();
    for (const set of sets) {
      const current = grouped.get(set.serviceKey);
      if (!current)
        grouped.set(set.serviceKey, { ...set, hasPublished: set.status === 'PUBLISHED' });
      else if (set.status === 'PUBLISHED') current.hasPublished = true;
    }
    return [...grouped.values()];
  } catch (error) {
    if (isDevDemoEnabled() && isDatabaseUnavailable(error)) return [];
    throw error;
  }
}
