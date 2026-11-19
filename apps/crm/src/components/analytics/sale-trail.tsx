import { Check, Circle } from 'lucide-react';
import type { SaleTrailStep } from '@/lib/analytics/funnel';
import { cn } from '@/lib/utils';

const when = (date: Date | null) => (date ? date.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' }) : null);

/** P30: recorrido de una venta, de la fuente al pago (y lo que vino después). */
export function SaleTrail({ steps }: { steps: SaleTrailStep[] }) {
  return (
    <ol className="space-y-2" data-sale-trail>
      {steps.map((step) => (
        <li key={step.key} className="flex gap-3" data-trail-step={step.key} data-done={step.done}>
          <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full', step.done ? 'bg-electric text-canvas' : 'border border-line text-soft')} aria-hidden>
            {step.done ? <Check className="h-3 w-3" /> : <Circle className="h-2 w-2" />}
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-carbon">
              {step.label}
              <span className="sr-only">{step.done ? ' (completado)' : ' (sin dato)'}</span>
            </p>
            <p className="break-words text-graphite">{step.detail}</p>
            {when(step.at) && <p className="text-xs text-soft">{when(step.at)}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
