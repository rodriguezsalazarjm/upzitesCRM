import { AlertTriangle, CircleDashed } from 'lucide-react';
import { Eyebrow } from '@/components/ui/eyebrow';
import { cn } from '@/lib/utils';
import { NODE_META, TONE_CLASS, nodeSubtitle, nodeTitle } from './flow-node-meta';
import type { FlowNode } from '@/lib/automations/schema';

/**
 * Chrome visual de un nodo del canvas. Puramente presentacional: no incluye
 * los `Handle` de @xyflow/react (esos viven en `StepNode`, dentro de
 * flow-builder.tsx, junto a la lógica de conexión que no se toca en P1).
 */
export function FlowNodeCard({
  step,
  selected,
  hasError,
  incomplete,
}: {
  step: FlowNode;
  selected: boolean;
  hasError: boolean;
  incomplete: boolean;
}) {
  const meta = NODE_META[step.type];
  const Icon = meta.icon;

  return (
    <div
      className={cn(
        'w-56 rounded-2xl border bg-paper p-3.5 transition-colors',
        hasError ? 'border-tomato' : incomplete ? 'border-solar' : 'border-line',
        selected && 'ring-2 ring-electric/20',
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', TONE_CLASS[meta.tone])}>
          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
        </span>
        <Eyebrow className="min-w-0 flex-1 truncate">{nodeTitle(step)}</Eyebrow>
        {hasError ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-danger-ink" role="img" aria-label="Con error" />
        ) : (
          incomplete && <CircleDashed className="h-3.5 w-3.5 shrink-0 text-warning-ink" role="img" aria-label="Incompleto" />
        )}
      </div>

      <p className="mt-2 truncate text-sm font-medium text-carbon">{nodeSubtitle(step)}</p>
    </div>
  );
}
