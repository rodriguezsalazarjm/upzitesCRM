import Link from 'next/link';
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  FileText,
  Globe2,
  Mail,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Users,
} from 'lucide-react';
import { EmailDomainsCard } from '@/components/email/email-domains-card';
import { Header } from '@/components/layout/header';
import { StatusBadge } from '@/components/ui/status-badge';
import { SettingsSection } from '@/components/ui/settings-card';
import { requireCurrentUser } from '@/lib/auth';
import { getPipelineStages } from '@/lib/crm-data';
import { isDatabaseUnavailable, isDevDemoEnabled } from '@/lib/dev-demo';
import { canManageMarketing } from '@/lib/marketing/roles';
import { flagStates } from '@/lib/ops/flags';
import { getWorkspaceOperations } from '@/lib/ops-data';
import { prisma } from '@/lib/prisma';
import { BusinessType, WorkspaceRole } from '../../../../generated/prisma/client';
import { FlagsClient } from './flags-client';
import { BusinessSettingsForm, HoursSettingsForm, InformationSettingsForm } from './settings-forms';
import { ServicesPricing, type ServiceRuleSetView } from './services-pricing';
import { WebsiteConnection } from './website-connection';
import { ExperiencePanel } from './experience-panel';
import { MenuCustomizer } from './menu-customizer';
import { getWorkspaceExperience } from '@/lib/workspace-experience';
import { PRESETS, resolvePreset } from '@/lib/workspace-presets';
import { wizardSalesMode } from '@/lib/workspace-profile/business';
import { canManageProfile } from '@/lib/workspace-profile/service';

export const dynamic = 'force-dynamic';

const navigation = [
  ['mi-negocio', 'Mi negocio'],
  ['equipo', 'Equipo'],
  ['experiencia', 'Menú e inicio'],
  ['ventas', 'Ventas y cotizaciones'],
  ['horarios', 'Horarios de atención'],
  ['informacion', 'Información y políticas'],
  ['sitio-web', 'Conexión con mi sitio web'],
  ['email', 'Email de envío'],
  ['avanzada', 'Configuración avanzada'],
] as const;

/** Interruptores y auditoria del workspace: no los ve un vendedor. */
const operationsNavigation = [['operacion', 'Operación']] as const;

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
  const canSeeOperations = user.role === WorkspaceRole.OWNER || user.role === WorkspaceRole.ADMIN;
  const [operations, flags] = canSeeOperations
    ? await Promise.all([getWorkspaceOperations(user.workspace.id), flagStates(user.workspace.id)])
    : [null, null];
  const sections = canSeeOperations ? [...navigation, ...operationsNavigation] : navigation;

  const profile = { ...storedProfile, businessName: user.workspace.name };
  const presetState = resolvePreset(storedProfile);
  const menu = await getWorkspaceExperience({ workspaceId: user.workspace.id, userId: user.id, role: user.role }).then(
    (experience) => experience.navigation,
    (error) => {
      if (isDevDemoEnabled() && isDatabaseUnavailable(error)) return null;
      throw error;
    },
  );
  const menuItem = ({ id, label, locked, lockedPlan }: NonNullable<typeof menu>['primary'][number]) => ({ id, label, locked, lockedPlan });
  const salesMode = wizardSalesMode(storedProfile);
  const canEdit = canManageMarketing(user.role);
  const emailDomains = await getEmailDomains(user.workspace.id);
  const snippet = `<script async src="${baseUrl}/api/capture/snippet?key=${workspacePublicKey}"></script>`;
  const formEmbed = form
    ? `<iframe src="${baseUrl}/api/capture/forms/${form.publicId}?pageUrl=https://tusitio.cl/contacto" style="width:100%;height:520px;border:0"></iframe>`
    : '';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header title="Configuración" subtitle="Información y preferencias de tu negocio" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 sm:px-6 xl:grid-cols-[200px_minmax(0,1fr)] xl:px-8">
          <aside className="min-w-0 self-start xl:sticky xl:top-6">
            <nav
              aria-label="Secciones de configuración"
              className="-mx-1 flex flex-wrap gap-1 px-1 pb-2 xl:flex-col xl:pb-0"
            >
              {sections.map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-graphite outline-none transition-colors hover:bg-ivory hover:text-carbon focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric"
                >
                  {label}
                </a>
              ))}
            </nav>
          </aside>

          <main className="min-w-0 space-y-5 pb-10">
            <SettingsSection
              id="mi-negocio"
              icon={BriefcaseBusiness}
              title="Mi negocio"
              description="Cuéntanos qué hace tu negocio y cómo vende principalmente."
            >
              <BusinessSettingsForm initial={profile} canEdit={canEdit} />
            </SettingsSection>

            <SettingsSection
              id="equipo"
              icon={Users}
              title="Equipo"
              description="Invita a tu equipo, cambia roles y gestiona accesos. Cada invitación pendiente reserva un lugar del plan."
            >
              <Link href="/configuracion/equipo" className="inline-flex items-center gap-1 text-sm font-semibold text-electric hover:text-electric-strong">
                Gestionar equipo <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </SettingsSection>

            <SettingsSection
              id="experiencia"
              icon={Settings2}
              title="Menú e inicio"
              description="El menú, el inicio y los primeros pasos se ordenan según tu tipo de negocio. Tu plan sigue decidiendo qué está disponible."
            >
              <ExperiencePanel
                currentLabel={presetState.preset.label}
                recommendedLabel={PRESETS[presetState.recommendedKey].label}
                recommendationDiffers={presetState.recommendationDiffers}
                updateAvailable={presetState.updateAvailable}
                applied={presetState.applied}
                canApply={canManageProfile(user.role)}
              />
              {menu && (
              <div className="mt-6 border-t border-line pt-6">
                <MenuCustomizer
                  key={[...menu.primary, ...menu.hidden].map((i) => i.id).join(',') + '|' + menu.hidden.length}
                  visible={menu.primary.map(menuItem)}
                  hidden={menu.hidden.map(menuItem)}
                />
              </div>
              )}
            </SettingsSection>

            <SettingsSection
              id="ventas"
              icon={ShoppingCart}
              title="Ventas y cotizaciones"
              description="Revisa el recorrido de tus oportunidades y administra lo que vendes."
            >
              <div className="space-y-6">
                {salesMode === BusinessType.SERVICES ? (
                  <ServicesPricing
                    services={pricingRuleSets}
                    canEdit={canEdit}
                    canPublish={user.role === WorkspaceRole.OWNER}
                  />
                ) : salesMode === BusinessType.ECOMMERCE || salesMode === BusinessType.INFOPRODUCT ? (
                  <div className="rounded-xl bg-ivory p-4">
                    <h3 className="text-sm font-semibold text-carbon">Catálogo de productos</h3>
                    <p className="mt-1 text-xs leading-5 text-soft">
                      Puedes mantener un catálogo manual en el CRM. Shopify es una alternativa
                      disponible desde Integraciones, pero no es obligatorio.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <SettingsLink href="/productos">Agregar mi primer producto</SettingsLink>
                      <SettingsLink href="/integraciones">Revisar Shopify</SettingsLink>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-xl bg-solar/20 p-4 text-sm text-warning-ink">
                    Elige primero tu modalidad de venta en «Mi negocio» para mostrar la
                    configuración correspondiente.
                  </p>
                )}
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-carbon">Etapas de venta</h3>
                    <div className="divide-y divide-line rounded-xl border border-line bg-paper">
                      {stages.map((stage) => (
                        <div key={stage.id} className="flex items-center justify-between gap-4 px-4 py-3">
                          <span className="text-sm font-medium text-carbon">{stage.name}</span>
                          <StatusBadge tone={stage.isWon ? 'success' : stage.isLost ? 'danger' : 'neutral'}>
                            {stage.probability}% de probabilidad
                          </StatusBadge>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3 rounded-xl bg-ivory p-4">
                    <h3 className="text-sm font-semibold text-carbon">Administrar ventas</h3>
                    <p className="text-xs leading-5 text-soft">
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
              id="email"
              icon={Mail}
              title="Email de envío"
              description="Dominio desde el que salen tus entregas, recibos y campañas."
            >
              <EmailDomainsCard domains={emailDomains} canManage={canEdit} />
            </SettingsSection>

            <SettingsSection
              id="avanzada"
              icon={Settings2}
              title="Configuración avanzada"
              description="Datos técnicos para integraciones y soporte."
            >
              <details className="group rounded-xl border border-line bg-ivory">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-carbon outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric">
                  Ver identificadores técnicos
                </summary>
                <dl className="grid gap-4 border-t border-line p-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium text-soft">Identificador del espacio de trabajo</dt>
                    <dd className="mt-1 break-all font-mono text-xs text-carbon">{user.workspace.slug}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-soft">Clave pública para el sitio web</dt>
                    <dd className="mt-1 break-all font-mono text-xs text-carbon">{workspacePublicKey}</dd>
                  </div>
                </dl>
              </details>
            </SettingsSection>

            {operations && flags && (
              <SettingsSection
                id="operacion"
                icon={ShieldCheck}
                title="Operación"
                description="Interruptores de emergencia y auditoría de tu workspace."
              >
                <div className="space-y-6">
                  <FlagsClient flags={flags} canManage={user.role === WorkspaceRole.OWNER} />
                  {operations.deadJobs.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-danger-ink">
                        Tareas que agotaron sus reintentos
                      </h3>
                      <div className="divide-y divide-line rounded-xl border border-line bg-paper">
                        {operations.deadJobs.map((job) => (
                          <div key={job.id} className="px-4 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-carbon">{job.type}</span>
                              <span className="text-[10px] text-soft">
                                {job.updatedAt.toLocaleString('es-CL')}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-danger-ink">{job.lastError}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-carbon">Auditoría reciente</h3>
                    <div className="divide-y divide-line rounded-xl border border-line bg-paper">
                      {operations.auditLogs.map((log) => (
                        <div key={log.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-carbon">{log.action}</p>
                            <p className="text-[10px] text-soft">
                              {log.entity}
                              {log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ''}
                            </p>
                          </div>
                          <span className="shrink-0 text-[10px] text-soft">
                            {log.createdAt.toLocaleString('es-CL')}
                          </span>
                        </div>
                      ))}
                      {operations.auditLogs.length === 0 && (
                        <p className="px-4 py-3 text-xs text-soft">Sin registros todavía.</p>
                      )}
                    </div>
                  </div>
                </div>
              </SettingsSection>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function SettingsLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg border border-mist bg-paper px-3 py-2 text-sm font-semibold text-electric outline-none transition-colors hover:border-electric focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric"
    >
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

async function getEmailDomains(workspaceId: string) {
  try {
    const domains = await prisma.emailDomain.findMany({ where: { workspaceId }, orderBy: { createdAt: 'asc' } });
    return domains.map((d) => ({
      id: d.id, domain: d.domain, status: d.status, fromEmail: d.fromEmail, fromName: d.fromName, lastError: d.lastError,
      lastCheckedAt: d.lastCheckedAt?.toISOString() ?? null,
      dnsRecords: Array.isArray(d.dnsRecords) ? (d.dnsRecords as { type: string; name: string; value: string; priority?: number }[]) : [],
    }));
  } catch (error) {
    if (isDevDemoEnabled() && isDatabaseUnavailable(error)) return [];
    throw error;
  }
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
    commerceSubtype: null,
    presetKey: null,
    presetVersion: null,
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
