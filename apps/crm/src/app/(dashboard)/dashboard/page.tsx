import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  TrendingUp, TrendingDown, Users, DollarSign,
  Target, CheckCircle, Mail, Phone, Calendar,
  FileText, ArrowUpRight,
} from 'lucide-react';
import {
  mockKPIs, mockActivities, mockOpportunities, mockSourceData,
  formatCurrency, stageLabels, stageBadgeColors,
} from '@/lib/mock-data';
import { cn } from '@/lib/utils';

// Importar utilidades directamente
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
  email: 'bg-blue-100 text-blue-600',
  call: 'bg-violet-100 text-violet-600',
  meeting: 'bg-amber-100 text-amber-600',
  note: 'bg-slate-100 text-slate-600',
  deal: 'bg-emerald-100 text-emerald-600',
};

export default function DashboardPage() {
  const activeOpportunities = mockOpportunities.filter(
    (o) => !['ganado', 'perdido'].includes(o.stage),
  );

  const kpis = [
    {
      label: 'Leads del mes',
      value: mockKPIs.totalLeads,
      growth: mockKPIs.leadsGrowth,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Oportunidades abiertas',
      value: mockKPIs.openOpportunities,
      sub: formatCurrencyLocal(mockKPIs.opportunitiesValue),
      icon: Target,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
    {
      label: 'Ingresos cerrados',
      value: formatCurrencyLocal(mockKPIs.revenue),
      growth: mockKPIs.revenueGrowth,
      icon: DollarSign,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Tasa de conversión',
      value: `${mockKPIs.conversionRate}%`,
      sub: `${mockKPIs.closedWon} cierres`,
      icon: CheckCircle,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Dashboard"
        subtitle={`${new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}`}
        action={{ label: 'Nuevo contacto', href: '/contactos/nuevo' }}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <Card key={kpi.label} className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500">{kpi.label}</p>
                      <p className="mt-1.5 text-2xl font-bold text-slate-900">{kpi.value}</p>
                      {kpi.growth !== undefined && (
                        <div className={cn(
                          'mt-1 flex items-center gap-1 text-xs font-medium',
                          kpi.growth >= 0 ? 'text-emerald-600' : 'text-red-500',
                        )}>
                          {kpi.growth >= 0
                            ? <TrendingUp className="h-3 w-3" />
                            : <TrendingDown className="h-3 w-3" />
                          }
                          {Math.abs(kpi.growth)}% vs mes anterior
                        </div>
                      )}
                      {kpi.sub && (
                        <p className="mt-1 text-xs text-slate-400">{kpi.sub}</p>
                      )}
                    </div>
                    <div className={cn('rounded-lg p-2.5', kpi.bg)}>
                      <Icon className={cn('h-5 w-5', kpi.color)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Actividad reciente */}
          <Card className="border-0 shadow-sm lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Actividad reciente
                </CardTitle>
                <button className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                  Ver todo <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockActivities.map((act) => {
                const Icon = activityIcons[act.type];
                return (
                  <div key={act.id} className="flex items-start gap-3">
                    <div className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs', activityColors[act.type])}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-800 leading-snug">
                        {act.description}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {act.contactName} · {act.time}
                      </p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Fuente de leads */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-800">Fuente de leads</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockSourceData.map((src) => (
                <div key={src.source}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-slate-600">{src.source}</span>
                    <span className="text-xs font-semibold text-slate-800">{src.leads}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100">
                    <div
                      className="h-1.5 rounded-full bg-blue-500"
                      style={{ width: `${src.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Oportunidades activas */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-800">
                Oportunidades activas
              </CardTitle>
              <a href="/oportunidades" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                Ver pipeline <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {activeOpportunities.slice(0, 5).map((opp) => (
                <div key={opp.id} className="flex items-center gap-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-800">{opp.title}</p>
                    <p className="text-[10px] text-slate-400">{opp.company} · {opp.owner}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-800">
                      {formatCurrencyLocal(opp.value)}
                    </p>
                    <p className="text-[10px] text-slate-400">{opp.probability}% prob.</p>
                  </div>
                  <span className={cn(
                    'shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold',
                    stageBadgeColors[opp.stage],
                  )}>
                    {stageLabels[opp.stage]}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
