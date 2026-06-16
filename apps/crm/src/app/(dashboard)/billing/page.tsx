import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getBillingSummary } from '@/lib/ops-data';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const { subscription, users, contacts } = await getBillingSummary();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Billing" subtitle="Plan, limites y piloto comercial" />
      <div className="max-w-3xl flex-1 space-y-4 overflow-y-auto p-6">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
