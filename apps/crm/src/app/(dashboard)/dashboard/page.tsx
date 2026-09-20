import { Header } from '@/components/layout/header';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  ArrowUpRight,
  Calendar,
  CheckCircle,
  DollarSign,
  FileText,
  Mail,
  Phone,
  Target,
  Users,
} from 'lucide-react';
import { getDashboardData } from '@/lib/crm-data';
import { stageLabels } from '@/lib/mock-data';
import { stageTone } from '@/lib/status-tone';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function formatCurrencyLocal(amount: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    notation: 'compact',
  }).format(amount);
}

const activityIcons = {
  email: Mail,
  call: Phone,
  meeting: Calendar,
  note: FileText,
  deal: CheckCircle,
};

const activityColors = {
  email: 'bg-electric/10 text-electric',
  call: 'bg-ink/10 text-ink',
  meeting: 'bg-solar/30 text-warning-ink',
  note: 'bg-ivory text-graphite',
  deal: 'bg-lime/40 text-success-ink',
};

function ViewAll({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 text-[13px] font-semibold text-electric hover:text-electric-strong"
    >
      {children} <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
    </a>
  );
}

export default async function DashboardPage() {
  const { kpis: dashboardKpis, activities, opportunities, sourceData } = await getDashboardData();
  const activeOpportunities = opportunities.filter((o) => !['ganado', 'perdido'].includes(o.stage));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Dashboard"
        subtitle={`${new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}`}
        action={{ label: 'Nuevo contacto', href: '/contactos/nuevo' }}
      />

      <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-8 pt-2 sm:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Leads del mes"
            value={dashboardKpis.totalLeads}
            growth={dashboardKpis.leadsGrowth}
            icon={Users}
            accent="electric"
          />
          <StatCard
            label="Oportunidades abiertas"
            value={dashboardKpis.openOpportunities}
            hint={formatCurrencyLocal(dashboardKpis.opportunitiesValue)}
            icon={Target}
          />
          <StatCard
            tone="dark"
            label="Ingresos cerrados"
            value={formatCurrencyLocal(dashboardKpis.revenue)}
            growth={dashboardKpis.revenueGrowth}
            icon={DollarSign}
            accent="lime"
          />
          <StatCard
            label="Tasa de conversión"
            value={`${dashboardKpis.conversionRate}%`}
            hint={`${dashboardKpis.closedWon} cierres`}
            icon={CheckCircle}
            accent="solar"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card tone="dark" className="p-6 lg:col-span-2">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <Eyebrow>Pipeline</Eyebrow>
                <h2 className="mt-1 text-lg font-bold tracking-tight">Oportunidades activas</h2>
              </div>
              <a
                href="/oportunidades"
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-lime hover:text-white"
              >
                Ver pipeline <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
              </a>
            </div>
            <div className="divide-y divide-white/10">
              {activeOpportunities.slice(0, 5).map((opp) => (
                <div key={opp.id} className="flex items-center gap-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{opp.title}</p>
                    <p className="mt-0.5 truncate text-xs text-soft">
                      {opp.company} · {opp.owner}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-sm font-bold">{formatCurrencyLocal(opp.value)}</p>
                    <p className="text-xs text-soft">{opp.probability}% prob.</p>
                  </div>
                  <StatusBadge variant="dot" onDark tone={stageTone[opp.stage]} className="w-32 shrink-0">
                    {stageLabels[opp.stage]}
                  </StatusBadge>
                </div>
              ))}
              {activeOpportunities.length === 0 && (
                <p className="py-6 text-sm text-soft">Sin oportunidades activas.</p>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <Eyebrow>Origen</Eyebrow>
            <h2 className="mb-5 mt-1 text-lg font-bold tracking-tight">Fuente de leads</h2>
            <div className="space-y-4">
              {sourceData.map((src, index) => (
                <div key={src.source}>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="text-[13px] text-graphite">{src.source}</span>
                    <span className="tabular text-[13px] font-bold">{src.leads}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-ivory">
                    <div
                      className={cn('h-2 rounded-full', index === 0 ? 'bg-electric' : 'bg-carbon')}
                      style={{ width: `${src.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="p-6">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <Eyebrow>Bitácora</Eyebrow>
              <h2 className="mt-1 text-lg font-bold tracking-tight">Actividad reciente</h2>
            </div>
            <ViewAll href="/actividades">Ver todo</ViewAll>
          </div>
          <div className="grid gap-x-10 gap-y-4 md:grid-cols-2">
            {activities.map((act) => {
              const Icon = activityIcons[act.type];
              return (
                <div key={act.id} className="flex items-start gap-3">
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                      activityColors[act.type],
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium leading-snug text-carbon">{act.description}</p>
                    <p className="mt-0.5 text-xs text-ash">
                      {act.contactName} · {act.time}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
