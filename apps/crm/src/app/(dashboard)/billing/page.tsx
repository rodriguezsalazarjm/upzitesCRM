import { Header } from '@/components/layout/header';
import { RenewSubscriptionButton } from '@/components/billing/renew-subscription-button';
import { Eyebrow } from '@/components/ui/eyebrow';
import { SettingsCard } from '@/components/ui/settings-card';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { PLAN_CATALOG, PLAN_CODES } from '@/lib/billing/plan-catalog';
import { formatMoney, listCurrentPrices } from '@/lib/billing/price-book';
import { getEntitlements } from '@/lib/billing/usage';
import type { SubscriptionState } from '@/lib/billing/subscription-state';
import { getBillingSummary } from '@/lib/ops-data';
import { getCurrentWorkspaceId } from '@/lib/crm-data';

export const dynamic = 'force-dynamic';

const CHECKOUT_BANNERS: Record<string, { tone: StatusTone; title: string; body: string }> = {
  success: {
    tone: 'warning',
    title: 'Verificando tu pago',
    body: 'Mercado Pago confirmó el pago de tu lado. Estamos esperando la confirmación final — tu plan se activa automáticamente en cuanto llegue (normalmente en segundos). Refresca esta página en un momento.',
  },
  pending: {
    tone: 'warning',
    title: 'Pago pendiente',
    body: 'Tu pago quedó en revisión en Mercado Pago. Te avisamos apenas se confirme; no necesitas hacer nada más por ahora.',
  },
  failure: {
    tone: 'danger',
    title: 'El pago no se completo',
    body: 'Mercado Pago no pudo procesar el pago. Puedes intentar de nuevo con otro medio de pago.',
  },
};

const STATE_LABEL: Record<SubscriptionState, { label: string; tone: StatusTone }> = {
  FREE: { label: 'Free', tone: 'info' },
  TRIAL: { label: 'Prueba', tone: 'info' },
  ACTIVE: { label: 'Vigente', tone: 'success' },
  GRACE: { label: 'En gracia', tone: 'warning' },
  SUSPENDED: { label: 'Suspendida', tone: 'danger' },
  EXPIRED: { label: 'Vencida', tone: 'danger' },
};

const SOURCE_LABEL: Record<string, string> = {
  FREE: 'Gratis',
  MANUAL: 'Pago manual',
  MERCADO_PAGO: 'Mercado Pago',
  COMP: 'Cortesía',
  TRIAL: 'Prueba',
};

function date(value: Date | null) {
  return value ? value.toLocaleDateString('es-CL') : '-';
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: checkoutStatus } = await searchParams;
  const banner = checkoutStatus ? CHECKOUT_BANNERS[checkoutStatus] : undefined;

  const workspaceId = await getCurrentWorkspaceId();
  const [{ users, contacts }, entitlements, prices] = await Promise.all([
    getBillingSummary(),
    getEntitlements(workspaceId),
    listCurrentPrices({ currency: 'CLP' }),
  ]);
  const snapshot = entitlements.subscription;
  const configured = snapshot.configuredPlan ? PLAN_CATALOG[snapshot.configuredPlan].name : snapshot.legacyPlanKey ?? 'Free';
  const state = STATE_LABEL[snapshot.state];
  const priceLabel = snapshot.price ? formatMoney(snapshot.price.amountMinor, snapshot.price.currency) : '-';

  const stats = [
    { label: 'Medio', value: SOURCE_LABEL[snapshot.billingSource] ?? snapshot.billingSource },
    { label: 'Precio', value: priceLabel },
    { label: 'Usuarios', value: `${users}/${entitlements.plan.allowances.users ?? 0}` },
    { label: 'Contactos', value: `${contacts}/${entitlements.plan.allowances.contacts ?? 0}` },
    {
      label: snapshot.state === 'GRACE' ? 'Acceso hasta' : 'Periodo hasta',
      value: snapshot.state === 'GRACE' ? date(snapshot.graceEndsAt) : snapshot.periodEnd ? date(snapshot.periodEnd) : 'Sin vencimiento',
    },
  ];

  const paidPlans = PLAN_CODES.filter((code) => code !== 'FREE') as ('START' | 'PRO' | 'SCALE')[];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Billing" subtitle="Plan, límites y pagos de Upzites Flow" />
      <div className="max-w-3xl flex-1 space-y-4 overflow-y-auto p-6">
        {banner && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper p-4">
            <div>
              <p className="text-sm font-semibold text-carbon">{banner.title}</p>
              <p className="mt-1 text-xs text-soft">{banner.body}</p>
            </div>
            <StatusBadge tone={banner.tone}>{checkoutStatus}</StatusBadge>
          </div>
        )}

        <SettingsCard title={`Plan ${configured}`} actions={<StatusBadge tone={state.tone}>{state.label}</StatusBadge>}>
          {snapshot.state === 'EXPIRED' && (
            <p className="mb-4 text-xs text-soft">
              Tu plan venció: operas con los límites de Free hasta renovar. No se borró ningún dato.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label}>
                <Eyebrow>{stat.label}</Eyebrow>
                <p className="mt-1 type-display text-[28px]">{stat.value}</p>
              </div>
            ))}
          </div>
        </SettingsCard>

        <SettingsCard title="Planes">
          <div className="grid gap-4 sm:grid-cols-3">
            {paidPlans.map((code) => {
              const price = prices.find((row) => row.planCode === code);
              const current = snapshot.configuredPlan === code;
              return (
                <div key={code} className="flex flex-col gap-3 rounded-xl border border-line p-4">
                  <div>
                    <Eyebrow>{PLAN_CATALOG[code].name}</Eyebrow>
                    <p className="mt-1 type-display text-[24px]">{price ? formatMoney(price.amountMinor, price.currency) : '-'}</p>
                    <p className="text-[11px] text-soft">por mes</p>
                  </div>
                  <ul className="flex-1 space-y-1 text-xs text-ash">
                    {PLAN_CATALOG[code].features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                  {price && (
                    <RenewSubscriptionButton
                      planCode={code}
                      label={current ? 'Renovar' : 'Contratar'}
                      variant={current ? 'default' : 'outline'}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}
