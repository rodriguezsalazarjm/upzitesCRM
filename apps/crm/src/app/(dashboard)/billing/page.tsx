import { Header } from '@/components/layout/header';
import { RenewSubscriptionButton } from '@/components/billing/renew-subscription-button';
import { Eyebrow } from '@/components/ui/eyebrow';
import { SettingsCard } from '@/components/ui/settings-card';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { getBillingSummary } from '@/lib/ops-data';
import { getCurrentWorkspaceId } from '@/lib/crm-data';
import { getSubscriptionStatus } from '@/lib/subscription';

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

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: checkoutStatus } = await searchParams;
  const banner = checkoutStatus ? CHECKOUT_BANNERS[checkoutStatus] : undefined;

  const { subscription, users, contacts } = await getBillingSummary();
  const workspaceId = await getCurrentWorkspaceId();
  const status = await getSubscriptionStatus(workspaceId);

  const stats = [
    { label: 'Precio', value: subscription ? `$${subscription.plan.priceClp.toLocaleString('es-CL')}` : '-' },
    { label: 'Usuarios', value: `${users}/${subscription?.plan.maxUsers ?? 0}` },
    { label: 'Contactos', value: `${contacts}/${subscription?.plan.maxContacts ?? 0}` },
    { label: 'Vence en', value: `${status.daysLeft} días` },
    { label: 'Próxima renovación', value: status.expiresAt ? status.expiresAt.toLocaleDateString('es-CL') : '-' },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Billing" subtitle="Plan, límites y piloto comercial" />
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

        <SettingsCard
          title={subscription?.plan.name ?? 'Sin plan'}
          actions={subscription && <StatusBadge tone="info">{subscription.status}</StatusBadge>}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label}>
                <Eyebrow>{stat.label}</Eyebrow>
                <p className="mt-1 type-display text-[28px]">{stat.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 border-t border-line pt-5">
            <RenewSubscriptionButton />
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}
