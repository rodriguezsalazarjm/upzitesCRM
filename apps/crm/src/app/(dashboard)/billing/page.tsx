import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RenewSubscriptionButton } from '@/components/billing/renew-subscription-button';
import { getBillingSummary } from '@/lib/ops-data';
import { getCurrentWorkspaceId } from '@/lib/crm-data';
import { getSubscriptionStatus } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

const CHECKOUT_BANNERS: Record<string, { variant: 'success' | 'warning' | 'destructive'; title: string; body: string }> = {
  success: {
    variant: 'warning',
    title: 'Verificando tu pago',
    body: 'Mercado Pago confirmo el pago de tu lado. Estamos esperando la confirmacion final — tu plan se activa automaticamente en cuanto llegue (normalmente en segundos). Refresca esta pagina en un momento.',
  },
  pending: {
    variant: 'warning',
    title: 'Pago pendiente',
    body: 'Tu pago quedo en revision en Mercado Pago. Te avisamos apenas se confirme; no necesitas hacer nada mas por ahora.',
  },
  failure: {
    variant: 'destructive',
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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Billing" subtitle="Plan, limites y piloto comercial" />
      <div className="max-w-3xl flex-1 space-y-4 overflow-y-auto p-6">
        {banner && (
          <Card className="border-0 shadow-sm">
            <CardContent className="flex items-center justify-between gap-3 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">{banner.title}</p>
                <p className="mt-1 text-xs text-slate-600">{banner.body}</p>
              </div>
              <Badge variant={banner.variant}>{checkoutStatus}</Badge>
            </CardContent>
          </Card>
        )}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{subscription?.plan.name ?? 'Sin plan'}</CardTitle>
              {subscription && <Badge variant="info">{subscription.status}</Badge>}
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 text-xs text-slate-600 md:grid-cols-3">
            <div>
              <p className="text-slate-400">Precio</p>
              <p className="text-lg font-bold text-slate-900">
                {subscription ? `$${subscription.plan.priceClp.toLocaleString('es-CL')}` : '-'}
              </p>
            </div>
            <div>
              <p className="text-slate-400">Usuarios</p>
              <p className="text-lg font-bold text-slate-900">
                {users}/{subscription?.plan.maxUsers ?? 0}
              </p>
            </div>
            <div>
              <p className="text-slate-400">Contactos</p>
              <p className="text-lg font-bold text-slate-900">
                {contacts}/{subscription?.plan.maxContacts ?? 0}
              </p>
            </div>
            <div>
              <p className="text-slate-400">Vence en</p>
              <p className="text-lg font-bold text-slate-900">
                {status.daysLeft} dias
              </p>
            </div>
            <div>
              <p className="text-slate-400">Proxima renovacion</p>
              <p className="text-lg font-bold text-slate-900">
                {status.expiresAt ? status.expiresAt.toLocaleDateString('es-CL') : '-'}
              </p>
            </div>
            <div className="md:col-span-3">
              <RenewSubscriptionButton />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
