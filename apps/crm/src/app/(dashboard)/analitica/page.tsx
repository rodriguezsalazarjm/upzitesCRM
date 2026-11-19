import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { PlanLockedNotice } from '@/components/billing/plan-locked-notice';
import { SaleTrail } from '@/components/analytics/sale-trail';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { requireCurrentUser } from '@/lib/auth';
import { loadFunnel, loadSaleTrail } from '@/lib/analytics/funnel';
import type { BreakdownRow } from '@/lib/analytics/funnel-math';
import { formatMinor } from '@/lib/commerce/money';
import { prisma } from '@/lib/prisma';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PERIODS = [7, 30, 90] as const;
const pct = (value: number | null) => (value === null ? '—' : `${value.toLocaleString('es-CL')} %`);

export default async function AnaliticaPage({ searchParams }: { searchParams: Promise<{ dias?: string; venta?: string }> }) {
  const user = await requireCurrentUser();
  const workspaceId = user.workspace.id;
  const params = await searchParams;
  const days = PERIODS.find((d) => String(d) === params.dias) ?? 30;
  const profile = await prisma.workspaceProfile.findUnique({ where: { workspaceId }, select: { currency: true } });
  const currency = profile?.currency ?? 'CLP';
  const funnel = await loadFunnel(workspaceId, { days, currency });
  const money = (minor: number) => formatMinor(minor, currency);
  const selectedId = params.venta && funnel.recentSales.includes(params.venta) ? params.venta : funnel.recentSales[0];
  const [recent, selected] = await Promise.all([
    prisma.customerOrder.findMany({
      where: { id: { in: funnel.recentSales }, workspaceId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, total: true, currency: true, customerName: true, contact: { select: { firstName: true, lastName: true } } },
    }),
    selectedId ? loadSaleTrail(workspaceId, selectedId) : null,
  ]);
  const maxStage = Math.max(1, ...funnel.stages.map((s) => s.value));
  const { counts, rates } = funnel;

  const metrics = [
    { label: 'Ingresos', value: money(counts.revenue), hint: `${counts.sales} venta(s) · ticket medio ${rates.averageOrder === null ? '—' : money(rates.averageOrder)}` },
    { label: 'Conversación → checkout', value: pct(rates.conversationToCheckout), hint: `${counts.conversationsWithCheckout} de ${counts.conversations} conversaciones` },
    { label: 'Checkout → venta', value: pct(rates.checkoutToSale), hint: `${counts.sales} de ${counts.checkouts} checkouts` },
    { label: 'Bump take rate', value: pct(rates.bumpTakeRate), hint: `${counts.bumpAccepted} de ${counts.bumpShown} · ${money(counts.bumpRevenue)}` },
    { label: 'Upsells', value: money(counts.upsellRevenue), hint: `${counts.upsellAccepted} aceptado(s)` },
    { label: 'Ingresos recuperados', value: money(counts.recoveryRevenue), hint: `${counts.recoveredSales} venta(s) tras un seguimiento` },
    { label: 'ROAS', value: '—', hint: 'Sin datos de inversión publicitaria: la Marketing API de Meta aún no está conectada.' },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Analítica" subtitle="Recorrido comercial: de la fuente al pago" />
      <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
        <PlanLockedNotice workspaceId={workspaceId} feature="commerce.orders" />
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Periodo">
          {PERIODS.map((d) => (
            <Link key={d} href={`/analitica?dias=${d}`} aria-current={d === days ? 'page' : undefined} className={cn('rounded-md px-3 py-1 text-sm', d === days ? 'bg-carbon text-canvas' : 'text-graphite hover:bg-ivory')}>
              Últimos {d} días
            </Link>
          ))}
          <span className="text-xs text-soft">Montos en {currency}; pedidos en otra moneda no se suman.</span>
          <Link href="/insights" className="ml-auto text-sm font-semibold text-electric hover:underline">Insights IA</Link>
        </div>

        <Card className="space-y-3 p-5" data-funnel>
          <Eyebrow>Embudo</Eyebrow>
          <ol className="space-y-2">
            {funnel.stages.map((stage) => (
              <li key={stage.key} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] items-center gap-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]" data-stage={stage.key} data-value={stage.value}>
                <span className="font-semibold text-carbon">{stage.label}</span>
                <div className="min-w-0">
                  <div className="h-6 rounded bg-electric/15">
                    <div className="flex h-6 items-center rounded bg-electric px-2 text-xs font-semibold text-canvas" style={{ width: `${Math.max(8, (stage.value / maxStage) * 100)}%` }}>
                      {stage.value}
                    </div>
                  </div>
                  <p className="mt-0.5 text-xs text-soft">{stage.hint}</p>
                </div>
              </li>
            ))}
            <li className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] items-center gap-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]" data-stage="revenue">
              <span className="font-semibold text-carbon">Revenue</span>
              <span className="text-base font-bold text-carbon">{money(counts.revenue)}</span>
            </li>
          </ol>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-funnel-metrics>
          {metrics.map((m) => (
            <Card key={m.label} className="p-4">
              <p className="text-xs text-soft">{m.label}</p>
              <p className="text-xl font-bold text-carbon">{m.value}</p>
              <p className="text-xs text-graphite">{m.hint}</p>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Breakdown title="Por producto" rows={funnel.byProduct} money={money} unit="línea(s)" />
          <Breakdown title="Por campaña" rows={funnel.byCampaign} money={money} />
          <Breakdown title="Por canal" rows={funnel.byChannel} money={money} />
          <Breakdown title="Por agente de IA" rows={funnel.byAgent} money={money} />
        </div>
        {funnel.truncated && <p className="text-xs text-soft">Los desgloses consideran las 5.000 ventas más recientes del periodo.</p>}

        <Card className="space-y-4 p-5" data-recent-sales>
          <Eyebrow>Recorrido de una venta</Eyebrow>
          {recent.length === 0 ? (
            <p className="text-sm text-soft">Todavía no hay ventas en este periodo.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
              <ul className="space-y-1">
                {recent.map((o) => (
                  <li key={o.id}>
                    <Link href={`/analitica?dias=${days}&venta=${o.id}`} aria-current={o.id === selected?.order.id ? 'true' : undefined} className={cn('block rounded-md px-3 py-2 text-sm', o.id === selected?.order.id ? 'bg-ivory font-semibold text-carbon' : 'text-graphite hover:bg-ivory')} data-sale-link={o.id}>
                      {[o.contact?.firstName, o.contact?.lastName].filter(Boolean).join(' ') || o.customerName || 'Sin nombre'} · {formatMinor(o.total, o.currency)}
                    </Link>
                  </li>
                ))}
              </ul>
              {selected && (
                <div className="space-y-3" data-selected-sale={selected.order.id}>
                  <SaleTrail steps={selected.steps} />
                  <Link href={`/pedidos/${selected.order.id}`} className="text-sm font-semibold text-electric hover:underline">Ver pedido</Link>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Breakdown({ title, rows, money, unit = 'venta(s)' }: { title: string; rows: BreakdownRow[]; money: (minor: number) => string; unit?: string }) {
  return (
    <Card className="space-y-2 p-5" data-breakdown={title}>
      <Eyebrow>{title}</Eyebrow>
      {rows.length === 0 ? (
        <p className="text-sm text-soft">Sin ventas en el periodo.</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {rows.slice(0, 8).map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate text-carbon">{row.label}</span>
              <span className="shrink-0 text-right text-graphite">{money(row.revenue)} · {row.sales} {unit}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
