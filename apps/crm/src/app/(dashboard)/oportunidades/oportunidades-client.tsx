'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, DollarSign, LayoutGrid, List, Plus, Scale, TrendingUp, XCircle } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { Toolbar, ToolbarSpacer } from '@/components/ui/toolbar';
import { stageLabels, type Opportunity, type OpportunityStage } from '@/lib/mock-data';
import type { PipelineStageRecord } from '@/lib/crm-data';
import { stageTone } from '@/lib/status-tone';
import { cn, getInitials } from '@/lib/utils';

function formatCurrencyLocal(amount: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    notation: 'compact',
  }).format(amount);
}

function formatDay(date: string) {
  return new Date(date).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}

/**
 * Señal de cierre: solo cambia el color del TEXTO (Solar/Tomato oscuros) cuando
 * una oportunidad abierta vence pronto o ya venció. El resto queda neutro.
 */
function closeSignal(opp: Opportunity) {
  const open = opp.stage !== 'ganado' && opp.stage !== 'perdido';
  const days = Math.ceil((new Date(opp.closeDate).getTime() - Date.now()) / 86_400_000);
  if (open && days < 0) return { text: `${formatDay(opp.closeDate)} · vencida`, className: 'text-danger-ink' };
  if (open && days <= 14) return { text: `${formatDay(opp.closeDate)} · en ${days} d`, className: 'text-warning-ink' };
  return { text: formatDay(opp.closeDate), className: 'text-soft' };
}

/**
 * Card de oportunidad. Jerarquía: empresa/probabilidad → título → importe →
 * contacto y cierre. Sin color propio: el estado vive en la columna.
 * `data-dragging` queda listo para el arrastre (hoy el tablero no es arrastrable).
 */
function OpportunityCard({ opp }: { opp: Opportunity }) {
  const signal = closeSignal(opp);
  return (
    <article
      className={cn(
        'rounded-xl border border-line bg-paper p-4 transition-[border-color,transform] duration-200',
        'hover:border-mist',
        'data-[dragging=true]:rotate-[1.5deg] data-[dragging=true]:border-electric data-[dragging=true]:opacity-90 data-[dragging=true]:shadow-md',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="type-eyebrow truncate text-soft">{opp.company}</p>
        <span className="tabular shrink-0 text-xs font-semibold text-graphite">{opp.probability}%</span>
      </div>

      <h3 className="mt-2 line-clamp-2 text-sm font-bold leading-snug text-carbon">{opp.title}</h3>

      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="type-display tabular text-[28px] text-carbon">{formatCurrencyLocal(opp.value)}</p>
        <Avatar className="h-6 w-6" title={`Responsable: ${opp.owner}`}>
          <AvatarFallback className="bg-ivory text-[10px] font-bold text-graphite">
            <span aria-hidden>{getInitials(opp.owner)}</span>
            <span className="sr-only">Responsable: {opp.owner}</span>
          </AvatarFallback>
        </Avatar>
      </div>

      <div
        className="mt-3 h-1 w-full overflow-hidden rounded-full bg-ivory"
        role="img"
        aria-label={`Probabilidad ${opp.probability}%`}
      >
        <div className="h-1 rounded-full bg-carbon" style={{ width: `${opp.probability}%` }} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3 text-xs">
        <span className="truncate text-graphite">{opp.contactName}</span>
        <span className={cn('shrink-0 font-medium', signal.className)}>{signal.text}</span>
      </div>
    </article>
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

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-8 pt-2">
        <div className="grid grid-cols-2 gap-3 px-4 sm:px-8 xl:grid-cols-4">
          <StatCard size="sm" label="Pipeline total" value={formatCurrencyLocal(totalValue)} icon={DollarSign} />
          <StatCard
            size="sm"
            tone="dark"
            label="Valor ponderado"
            value={formatCurrencyLocal(weightedValue)}
            icon={Scale}
          />
          <StatCard
            size="sm"
            label="Ganadas"
            value={byStage.ganado?.length ?? 0}
            icon={CheckCircle2}
            accent="lime"
          />
          <StatCard size="sm" label="Perdidas" value={byStage.perdido?.length ?? 0} icon={XCircle} />
        </div>

        <Toolbar className="px-4 sm:px-8">
          <Tabs
            ariaLabel="Vista del pipeline"
            value={view}
            onValueChange={(value) => setView(value as 'kanban' | 'list')}
            items={[
              { value: 'kanban', label: 'Tablero', icon: LayoutGrid },
              { value: 'list', label: 'Lista', icon: List },
            ]}
          />
          <ToolbarSpacer />
          <p className="text-[13px] text-ash" aria-live="polite">
            {opportunities.length} {opportunities.length === 1 ? 'oportunidad' : 'oportunidades'}
          </p>
        </Toolbar>

        {opportunities.length === 0 ? (
          <div className="px-4 sm:px-8">
            <EmptyState
              icon={TrendingUp}
              title="Tu pipeline está vacío"
              description="Crea la primera oportunidad y mírala avanzar por las etapas hasta el cierre."
              action={
                <Button asChild className="mt-2">
                  <Link href="/oportunidades/nueva">
                    <Plus strokeWidth={2} />
                    Nueva oportunidad
                  </Link>
                </Button>
              }
            />
          </div>
        ) : view === 'kanban' ? (
          <div className="flex gap-3 overflow-x-auto px-4 pb-2 sm:px-8" role="list" aria-label="Etapas del pipeline">
            {stageKeys.map((stage) => {
              const cards = byStage[stage];
              const stageConfig = stages.find((item) => item.key === stage);
              const stageTotal = cards.reduce((sum, o) => sum + o.value, 0);
              const name = stageConfig?.name ?? stageLabels[stage];
              return (
                <section
                  key={stage}
                  role="listitem"
                  aria-label={`${name}: ${cards.length}`}
                  className="w-[288px] shrink-0 rounded-2xl bg-ivory/70 p-2.5 data-[over=true]:outline-2 data-[over=true]:outline-dashed data-[over=true]:outline-electric"
                >
                  <div className="flex items-center gap-2 px-1.5 pb-3 pt-1.5">
                    <StatusBadge variant="dot" tone={stageTone[stage]} className="font-bold text-carbon">
                      {name}
                    </StatusBadge>
                    <span className="tabular rounded-full bg-paper px-2 text-[11px] font-semibold leading-[18px] text-graphite">
                      {cards.length}
                    </span>
                    {stageTotal > 0 && (
                      <span className="tabular ml-auto text-[13px] font-semibold text-carbon">
                        {formatCurrencyLocal(stageTotal)}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    {cards.map((opp) => (
                      <OpportunityCard key={opp.id} opp={opp} />
                    ))}
                    {cards.length === 0 && (
                      <div className="grid min-h-28 place-items-center rounded-xl border-[1.5px] border-dashed border-mist p-4 text-center">
                        <div>
                          <p className="text-[13px] font-semibold text-graphite">Sin oportunidades</p>
                          <p className="mt-0.5 text-xs text-soft">Nada en esta etapa por ahora.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="px-4 sm:px-8">
            <Card className="overflow-hidden">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Oportunidad</TableHead>
                    <TableHead>Etapa</TableHead>
                    <TableHead align="right">Valor</TableHead>
                    <TableHead>Probabilidad</TableHead>
                    <TableHead className="hidden md:table-cell">Responsable</TableHead>
                    <TableHead className="hidden sm:table-cell">Cierre</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opportunities.map((opp) => {
                    const signal = closeSignal(opp);
                    return (
                      <TableRow key={opp.id}>
                        <TableCell>
                          <p className="font-semibold text-carbon">{opp.title}</p>
                          <p className="text-xs text-soft">
                            {opp.company} · {opp.contactName}
                          </p>
                        </TableCell>
                        <TableCell>
                          <StatusBadge variant="dot" tone={stageTone[opp.stage]}>
                            {stageLabels[opp.stage]}
                          </StatusBadge>
                        </TableCell>
                        <TableCell numeric>{formatCurrencyLocal(opp.value)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-1 w-16 overflow-hidden rounded-full bg-ivory">
                              <div className="h-1 rounded-full bg-carbon" style={{ width: `${opp.probability}%` }} />
                            </div>
                            <span className="tabular text-xs text-graphite">{opp.probability}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden text-graphite md:table-cell">{opp.owner}</TableCell>
                        <TableCell className={cn('hidden font-medium sm:table-cell', signal.className)}>
                          {signal.text}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
