import { notFound } from 'next/navigation';
import { currentPlatformActor } from '@/lib/platform/access';
import Link from 'next/link';
import { DataTable, Empty, PlatformPage, Section, StateBadge, fmtDate } from '@/components/platform/ui';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatMoney } from '@/lib/billing/money';
import { listPlatformWorkspaces, listSaasPayments } from '@/lib/platform/clients';

export const dynamic = 'force-dynamic';

/** Libro SaaS (SubscriptionPayment). Nunca muestra commerce (Payment/CustomerOrder). */
export default async function BillingPage() {
  // El layout no basta: Next renderiza la pagina en paralelo y su payload saldria en el 404.
  if (!(await currentPlatformActor())) notFound();
  const [payments, clients] = await Promise.all([listSaasPayments({ take: 100 }), listPlatformWorkspaces({ internal: false })]);
  const attention = clients.filter((c) => c.subscription.state === 'GRACE' || (c.subscription.state === 'ACTIVE' && c.subscription.daysLeft <= 7 && c.subscription.renewsAt));
  return (
    <PlatformPage title="Billing SaaS" subtitle="Pagos de suscripciones de clientes. Los pagos manuales se registran desde el detalle de cada workspace.">
      <Section title="Requieren atención" description="En gracia o por vencer en 7 días.">
        {attention.length === 0 ? (
          <Empty>Nada pendiente.</Empty>
        ) : (
          <DataTable head={['Cliente', 'Plan', 'Medio', 'Estado', 'Vence', 'Gracia hasta']}>
            {attention.map((c) => (
              <tr key={c.id}>
                <td className="py-2 pr-4"><Link className="font-medium hover:underline" href={`/platform/workspaces/${c.id}`}>{c.name}</Link></td>
                <td className="py-2 pr-4">{c.subscription.configuredPlan}</td>
                <td className="py-2 pr-4">{c.subscription.billingSource}</td>
                <td className="py-2 pr-4"><StateBadge state={c.subscription.state} /></td>
                <td className="py-2 pr-4">{fmtDate(c.subscription.periodEnd)}</td>
                <td className="py-2 pr-4">{fmtDate(c.subscription.graceEndsAt)}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>
      <Section title={`Pagos (${payments.length})`}>
        {payments.length === 0 ? (
          <Empty>Sin pagos registrados.</Empty>
        ) : (
          <DataTable head={['Fecha', 'Cliente', 'Plan', 'Medio', 'Monto', 'vs Price Book', 'Referencia']}>
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="py-2 pr-4">{fmtDate(p.paidAt)}</td>
                <td className="py-2 pr-4"><Link className="hover:underline" href={`/platform/workspaces/${p.workspace.id}`}>{p.workspace.name}</Link></td>
                <td className="py-2 pr-4">{p.planCode ?? 'Legacy'}</td>
                <td className="py-2 pr-4">{p.source}</td>
                <td className="py-2 pr-4">{formatMoney(p.amountMinor, p.currency)}</td>
                <td className="py-2 pr-4">
                  {p.price && p.price.amountMinor !== p.amountMinor ? <StatusBadge tone="warning">Monto pactado</StatusBadge> : <span className="text-soft">Price Book</span>}
                </td>
                <td className="py-2 pr-4 text-soft">{p.reference ?? '—'}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>
    </PlatformPage>
  );
}
