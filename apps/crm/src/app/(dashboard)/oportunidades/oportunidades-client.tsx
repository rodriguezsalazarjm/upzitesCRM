'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Calendar, DollarSign, User, TrendingUp, LayoutGrid, List } from 'lucide-react';
import {
  stageLabels, stageBadgeColors,
  type Opportunity, type OpportunityStage,
} from '@/lib/mock-data';
import type { PipelineStageRecord } from '@/lib/crm-data';
import { cn } from '@/lib/utils';

function formatCurrencyLocal(amount: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    notation: 'compact',
  }).format(amount);
}

const stageHeaderColors: Record<OpportunityStage, string> = {
  nuevo: 'border-t-slate-400',
  calificado: 'border-t-blue-500',
  propuesta: 'border-t-violet-500',
  negociacion: 'border-t-amber-500',
  ganado: 'border-t-emerald-500',
  perdido: 'border-t-red-400',
};

function OpportunityCard({ opp }: { opp: Opportunity }) {
  return (
    <div className="group cursor-pointer rounded-lg border bg-white p-3.5 shadow-xs hover:shadow-sm transition-all hover:-translate-y-0.5">
      <div className="mb-2">
        <p className="text-xs font-semibold text-slate-800 leading-snug line-clamp-2">{opp.title}</p>
        <p className="mt-0.5 text-[10px] text-slate-400">{opp.company}</p>
      </div>

      <div className="mb-3 h-1 w-full rounded-full bg-slate-100">
        <div
          className={cn(
            'h-1 rounded-full',
            opp.probability >= 75 ? 'bg-emerald-500' :
            opp.probability >= 50 ? 'bg-blue-500' :
            opp.probability >= 25 ? 'bg-amber-500' : 'bg-slate-300',
          )}
          style={{ width: `${opp.probability}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-900">{formatCurrencyLocal(opp.value)}</span>
        <span className="text-[10px] text-slate-400">{opp.probability}%</span>
      </div>

      <div className="mt-2.5 flex items-center gap-3 text-[10px] text-slate-400">
        <div className="flex items-center gap-1">
          <User className="h-3 w-3" />
          {opp.owner.split(' ')[0]}
        </div>
        <div className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {new Date(opp.closeDate).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
        </div>
      </div>
    </div>
  );
}

export function OportunidadesClient({
  opportunities,
  stages,
}: {
  opportunities: Opportunity[];
  stages: PipelineStageRecord[];
}) {
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const stageKeys = stages.map((stage) => stage.key);

  const byStage = stageKeys.reduce<Record<OpportunityStage, Opportunity[]>>((acc, stage) => {
    acc[stage] = opportunities.filter((o) => o.stage === stage);
    return acc;
  }, {} as Record<OpportunityStage, Opportunity[]>);

  const totalValue = opportunities
    .filter((o) => !['perdido'].includes(o.stage))
    .reduce((sum, o) => sum + o.value, 0);

  const weightedValue = opportunities
    .filter((o) => !['ganado', 'perdido'].includes(o.stage))
    .reduce((sum, o) => sum + (o.value * o.probability) / 100, 0);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Pipeline de ventas"
        subtitle={`${opportunities.length} oportunidades - ${formatCurrencyLocal(totalValue)} en pipeline`}
        action={{ label: 'Nueva oportunidad', href: '/oportunidades/nueva' }}
      />

      {/* Resumen */}
      <div className="flex items-center gap-6 border-b bg-white px-6 py-3">
        {[
          { label: 'Pipeline total', value: formatCurrencyLocal(totalValue), icon: DollarSign, color: 'text-blue-600' },
          { label: 'Valor ponderado', value: formatCurrencyLocal(weightedValue), icon: TrendingUp, color: 'text-violet-600' },
          { label: 'Ganadas', value: byStage.ganado.length.toString(), icon: TrendingUp, color: 'text-emerald-600' },
          { label: 'Perdidas', value: byStage.perdido.length.toString(), icon: TrendingUp, color: 'text-red-500' },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{s.label}:</span>
            <span className={cn('text-xs font-bold', s.color)}>{s.value}</span>
          </div>
        ))}
        <div className="ml-auto flex gap-1">
          <Button
            variant={view === 'kanban' ? 'default' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={() => setView('kanban')}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={view === 'list' ? 'default' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={() => setView('list')}
          >
            <List className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Kanban */}
      {view === 'kanban' && (
        <div className="flex flex-1 gap-3 overflow-x-auto p-4">
          {stageKeys.map((stage) => {
            const cards = byStage[stage];
            const stageConfig = stages.find((item) => item.key === stage);
            const stageTotal = cards.reduce((sum, o) => sum + o.value, 0);
            return (
              <div key={stage} className="flex w-60 shrink-0 flex-col">
                {/* Header columna */}
                <div className={cn(
                  'mb-2 rounded-lg border-t-2 bg-white px-3 py-2.5 shadow-xs',
                  stageHeaderColors[stage],
                )}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">
                      {stageConfig?.name ?? stageLabels[stage]}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                      {cards.length}
                    </span>
                  </div>
                  {stageTotal > 0 && (
                    <p className="mt-0.5 text-[10px] font-medium text-slate-400">
                      {formatCurrencyLocal(stageTotal)}
                    </p>
                  )}
                </div>

                {/* Cards */}
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {cards.map((opp) => (
                    <OpportunityCard key={opp.id} opp={opp} />
                  ))}
                  {cards.length === 0 && (
                    <div className="rounded-lg border-2 border-dashed border-slate-200 p-4 text-center">
                      <p className="text-[10px] text-slate-300">Sin oportunidades</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Vista lista */}
      {view === 'list' && (
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="border-b">
                <th className="py-2.5 pl-6 pr-3 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Oportunidad</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Etapa</th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Valor</th>
                <th className="px-3 py-2.5 text-center font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Prob.</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Responsable</th>
                <th className="px-3 py-2.5 pr-6 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Cierre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {opportunities.map((opp) => (
                <tr key={opp.id} className="hover:bg-slate-50 cursor-pointer">
                  <td className="py-3 pl-6 pr-3">
                    <p className="font-medium text-slate-800">{opp.title}</p>
                    <p className="text-[10px] text-slate-400">{opp.company}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-semibold', stageBadgeColors[opp.stage])}>
                      {stageLabels[opp.stage]}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-800">{formatCurrencyLocal(opp.value)}</td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <div className="h-1 w-16 rounded-full bg-slate-100">
                        <div className="h-1 rounded-full bg-blue-500" style={{ width: `${opp.probability}%` }} />
                      </div>
                      <span className="text-slate-500">{opp.probability}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-500">{opp.owner}</td>
                  <td className="px-3 py-3 pr-6 text-slate-500">
                    {new Date(opp.closeDate).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
