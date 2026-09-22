'use client';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ACTION_LABEL, NODE_LABEL, NODE_META, NODE_PALETTE, TONE_CLASS } from './flow-node-meta';
import type { FlowNode } from '@/lib/automations/schema';

/**
 * Paleta de nodos agrupada por categoría real del catálogo (ya resuelta en
 * P0). 15 entradas fijas: no se agregó búsqueda porque a este volumen no la
 * justifica (ver reporte de P1).
 */
export function NodePalette({
  readonly,
  onAppend,
}: {
  readonly: boolean;
  onAppend: (step: FlowNode) => void;
}) {
  return (
    <Card className="flex flex-wrap gap-2 p-3 lg:block lg:space-y-1.5">
      {NODE_PALETTE.map(([group, step], i) => {
        const Icon = NODE_META[step.type].icon;
        const title = step.type === 'ACTION' ? (ACTION_LABEL[step.action] ?? step.action) : NODE_LABEL[step.type];
        return (
          <button
            key={i}
            type="button"
            disabled={readonly}
            draggable={!readonly}
            onDragStart={(e) => e.dataTransfer.setData('application/upzites-node', String(i))}
            onClick={() => onAppend(step)}
            className="flex w-full items-center gap-2.5 rounded-lg border border-line p-2 text-left transition-colors hover:border-electric hover:bg-electric/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric disabled:pointer-events-none disabled:opacity-50"
          >
            <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', TONE_CLASS[NODE_META[step.type].tone])}>
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-medium uppercase tracking-wide text-soft">{group}</span>
              <span className="block truncate text-xs font-medium text-carbon">{title}</span>
            </span>
          </button>
        );
      })}
    </Card>
  );
}
