import Link from 'next/link';
import { ArrowUpRight, Lock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import type { LoadedWidget } from '@/lib/workspace-experience';
import { cn } from '@/lib/utils';
import { WidgetControls } from './dashboard-controls';

function format(value: number, kind: 'number' | 'money', currency: string) {
  if (kind === 'money') {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency, maximumFractionDigits: 0, notation: value >= 1_000_000 ? 'compact' : 'standard' }).format(value);
  }
  return new Intl.NumberFormat('es-CL').format(value);
}

const SPAN = { sm: '', md: 'sm:col-span-2', lg: 'sm:col-span-2 xl:col-span-4' } as const;

/** Tarjeta de un widget del registro. Bloqueado = candado, sin datos (no se cargo). */
export function WidgetCard({
  widget,
  currency,
  first,
  last,
}: {
  widget: LoadedWidget;
  currency: string;
  first: boolean;
  last: boolean;
}) {
  const data = widget.data;
  const href = data?.href;
  return (
    <Card className={cn('flex flex-col gap-3 p-5', SPAN[widget.size])} data-widget={widget.id}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Eyebrow>{widget.title}</Eyebrow>
          <p className="mt-1 text-xs text-soft">{widget.description}</p>
        </div>
        <WidgetControls id={widget.id} size={widget.size} first={first} last={last} />
      </div>

      {widget.locked ? (
        <p className="mt-auto flex items-center gap-2 text-sm font-medium text-soft">
          <Lock className="h-4 w-4" aria-hidden />
          {widget.lockedPlan ? `Disponible en ${widget.lockedPlan}` : 'No incluido en tu plan'}
        </p>
      ) : widget.error ? (
        <p className="mt-auto text-sm text-soft">No pudimos cargar este dato. Intenta más tarde.</p>
      ) : data?.kind === 'stat' ? (
        <div className="mt-auto">
          <p className="type-display text-[34px] leading-none text-carbon tabular">{format(data.value, data.format, currency)}</p>
          {data.value === 0 ? (
            <p className="mt-2 text-xs text-soft">{widget.emptyState}</p>
          ) : (
            data.hint && <p className="mt-2 text-xs text-soft">{data.hint}</p>
          )}
        </div>
      ) : data?.kind === 'list' ? (
        data.rows.length === 0 ? (
          <p className="mt-auto text-sm text-soft">{widget.emptyState}</p>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {data.rows.map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="truncate text-graphite">{row.label}</span>
                <span className="tabular font-semibold text-carbon">{format(row.value, row.format, currency)}</span>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {href && !widget.locked && (
        <Link href={href} className="inline-flex items-center gap-1 text-[13px] font-semibold text-electric hover:text-electric-strong">
          Ver detalle <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </Link>
      )}
    </Card>
  );
}
