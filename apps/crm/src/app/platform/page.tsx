import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, CreditCard, TrendingDown, Users } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { DataTable, Empty, PlatformPage, Section, fmtDate } from '@/components/platform/ui';
import { formatMoney } from '@/lib/billing/money';
import { PLAN_CATALOG } from '@/lib/billing/plan-catalog';
import { currentPlatformActor } from '@/lib/platform/access';
import { listMyBusinesses, listSaasPayments } from '@/lib/platform/clients';
import { getSaasMetrics } from '@/lib/platform/saas-metrics';

export const dynamic = 'force-dynamic';

/**
 * Resumen SaaS. Las metricas EXCLUYEN siempre los workspaces internos
 * (`isInternal`). "Mis negocios" va aparte y nunca suma su commerce al MRR.
 */
export default async function PlatformHome() {
  const actor = await currentPlatformActor();
  if (!actor) notFound();
  const [metrics, payments, businesses] = await Promise.all([getSaasMetrics(), listSaasPayments({ take: 10 }), listMyBusinesses(actor.id)]);
  const mrr = Object.entries(metrics.mrrByCurrency);

  return (
    <PlatformPage title="Plataforma" subtitle="Métricas SaaS de Upzites Flow. Los negocios internos no cuentan.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Clientes pagando" value={metrics.payingCustomers} icon={Users} size="sm" />
        <StatCard
          label="MRR"
          value={mrr.length ? mrr.map(([currency, amount]) => formatMoney(amount, currency)).join(' · ') : '—'}
          icon={CreditCard}
          size="sm"
        />
        <StatCard label="En gracia" value={metrics.grace} icon={AlertTriangle} size="sm" accent={metrics.grace > 0 ? 'tomato' : undefined} />
        <StatCard label="Churn (vencidos tras gracia)" value={metrics.churned} icon={TrendingDown} size="sm" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Medio de pago (clientes pagando)">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-ivory p-3"><dt className="text-xs text-soft">Manual</dt><dd className="text-xl font-semibold">{metrics.payingBySource.MANUAL}</dd></div>
            <div className="rounded-lg bg-ivory p-3"><dt className="text-xs text-soft">Mercado Pago</dt><dd className="text-xl font-semibold">{metrics.payingBySource.MERCADO_PAGO}</dd></div>
            <div className="rounded-lg bg-ivory p-3"><dt className="text-xs text-soft">Trials</dt><dd className="text-xl font-semibold">{metrics.trials}</dd></div>
            <div className="rounded-lg bg-ivory p-3"><dt className="text-xs text-soft">COMP comerciales</dt><dd className="text-xl font-semibold">{metrics.comp}</dd></div>
          </dl>
        </Section>
        <Section title="Planes (workspaces comerciales)">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            {Object.entries(metrics.byPlan).map(([plan, count]) => (
              <div key={plan} className="rounded-lg bg-ivory p-3">
                <dt className="text-xs text-soft">{plan in PLAN_CATALOG ? PLAN_CATALOG[plan as keyof typeof PLAN_CATALOG].name : 'Legacy'}</dt>
                <dd className="text-xl font-semibold">{count}</dd>
              </div>
            ))}
            {Object.keys(metrics.byPlan).length === 0 && <Empty>Sin clientes todavía.</Empty>}
          </dl>
        </Section>
      </div>

      <Section title="Pagos SaaS recientes" description="Solo el libro de suscripciones. Las ventas de cada negocio (commerce) no aparecen aquí.">
        {payments.length === 0 ? (
          <Empty>Sin pagos registrados.</Empty>
        ) : (
          <DataTable head={['Cliente', 'Plan', 'Medio', 'Monto', 'Fecha', 'Referencia']}>
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="py-2 pr-4"><Link className="font-medium text-carbon hover:underline" href={`/platform/workspaces/${p.workspace.id}`}>{p.workspace.name}</Link></td>
                <td className="py-2 pr-4">{p.planCode ?? 'Legacy'}</td>
                <td className="py-2 pr-4">{p.source}</td>
                <td className="py-2 pr-4">{formatMoney(p.amountMinor, p.currency)}</td>
                <td className="py-2 pr-4">{fmtDate(p.paidAt)}</td>
                <td className="py-2 pr-4 text-soft">{p.reference ?? '—'}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>

      <Section title="Mis negocios" description="Workspaces internos donde tienes membership. No suman a métricas SaaS; sus ventas son commerce de cada negocio.">
        {businesses.length === 0 ? (
          <Empty>No tienes negocios internos.</Empty>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {businesses.map((b) => (
              <li key={b.workspace.id} className="flex items-center justify-between rounded-lg border border-line p-3">
                <div>
                  <p className="font-semibold text-carbon">{b.workspace.name}</p>
                  <p className="text-xs text-soft">
                    {b.role} · {b.workspace.subscription?.plan.name ?? 'Free'} {b.workspace.subscription?.billingSource ? `+ ${b.workspace.subscription.billingSource}` : ''}
                  </p>
                </div>
                <Link href={`/platform/workspaces/${b.workspace.id}`} className="text-xs font-semibold text-electric hover:underline">
                  Ver
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </PlatformPage>
  );
}
