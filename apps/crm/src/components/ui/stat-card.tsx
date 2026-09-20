import * as React from 'react';
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { cn } from '@/lib/utils';

type Tone = 'default' | 'dark' | 'ink';

/**
 * Métrica: eyebrow + cifra display + variación + contexto.
 * `accent` pinta el icono con un color de la paleta (usar con moderación:
 * una tarjeta por fila). En tonos oscuros la variación usa Lime/Tomato.
 */
export function StatCard({
  label,
  value,
  growth,
  growthLabel = 'vs mes anterior',
  hint,
  icon: Icon,
  tone = 'default',
  accent,
  size = 'default',
  className,
}: {
  label: string;
  value: React.ReactNode;
  growth?: number;
  growthLabel?: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: Tone;
  accent?: 'electric' | 'lime' | 'solar' | 'tomato';
  /** `sm`: franja de métricas secundarias (cifra 36px). */
  size?: 'default' | 'sm';
  className?: string;
}) {
  const dark = tone !== 'default';
  const iconAccent = {
    electric: 'bg-electric text-white',
    lime: 'bg-lime text-carbon',
    solar: 'bg-solar text-carbon',
    tomato: 'bg-tomato text-white',
  } as const;

  return (
    <Card
      tone={tone}
      className={cn(
        'flex flex-col justify-between',
        size === 'sm' ? 'gap-4 p-5' : 'gap-6 p-6',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <Eyebrow>{label}</Eyebrow>
        {Icon && (
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              accent
                ? iconAccent[accent]
                : dark
                  ? 'bg-white/10 text-canvas'
                  : 'border border-line bg-canvas text-carbon',
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </span>
        )}
      </div>

      <div className={cn(size === 'sm' && 'flex flex-wrap items-baseline gap-x-2.5 gap-y-1')}>
        <p
          className={cn(
            'type-display tabular leading-none',
            size === 'sm' ? 'text-[38px]' : 'text-[56px]',
          )}
        >
          {value}
        </p>
        {(growth !== undefined || hint) && (
          <div
            className={cn(
              'flex flex-wrap items-center gap-x-2 gap-y-1 text-xs',
              size === 'default' && 'mt-3 min-h-6',
            )}
          >
            {growth !== undefined && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold',
                  growth === 0
                    ? dark
                      ? 'bg-white/10 text-canvas'
                      : 'bg-ivory text-graphite'
                    : growth > 0
                      ? dark
                        ? 'bg-lime text-carbon'
                        : 'bg-lime/40 text-success-ink'
                      : dark
                        ? 'bg-tomato text-white'
                        : 'bg-tomato/12 text-danger-ink',
                )}
              >
                {growth > 0 && <ArrowUpRight className="h-3 w-3" strokeWidth={2.25} />}
                {growth < 0 && <ArrowDownRight className="h-3 w-3" strokeWidth={2.25} />}
                {Math.abs(growth)}%
              </span>
            )}
            {growth !== undefined && <span className="text-soft">{growthLabel}</span>}
            {hint && <span className="text-soft">{hint}</span>}
          </div>
        )}
      </div>
    </Card>
  );
}
