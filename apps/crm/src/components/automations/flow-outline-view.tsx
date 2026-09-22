'use client';

import { AlertTriangle, CircleDashed, CornerDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { errorsForNode, isNodeIncomplete, NODE_META, nodeSubtitle, nodeTitle } from './flow-node-meta';
import type { OutlineEntry } from './flow-outline';
import type { FlowNode } from '@/lib/automations/schema';

function OutlineRow({
  step,
  id,
  selected,
  hasError,
  incomplete,
  onSelect,
}: {
  step: FlowNode;
  id: string;
  selected: boolean;
  hasError: boolean;
  incomplete: boolean;
  onSelect: (id: string) => void;
}) {
  const meta = NODE_META[step.type];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors',
        hasError ? 'border-tomato' : incomplete ? 'border-solar' : 'border-line',
        selected ? 'bg-electric/[0.06] ring-2 ring-electric/20' : 'bg-paper hover:border-stone',
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ivory text-graphite">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-semibold uppercase tracking-wide text-soft">{nodeTitle(step)}</span>
        <span className="block truncate text-sm font-medium text-carbon">{nodeSubtitle(step)}</span>
      </span>
      {hasError ? (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-danger-ink" role="img" aria-label="Con error" />
      ) : (
        incomplete && <CircleDashed className="h-3.5 w-3.5 shrink-0 text-warning-ink" role="img" aria-label="Incompleto" />
      )}
    </button>
  );
}

/** Nodo + sus ramas, indentado. `errors` ya viene filtrado a los del flow completo (ver caller). */
export function FlowOutlineEntry({
  entry,
  selected,
  onSelect,
  errors,
  depth = 0,
}: {
  entry: OutlineEntry;
  selected: string | undefined;
  onSelect: (id: string) => void;
  errors: string[];
  depth?: number;
}) {
  return (
    <li className={depth > 0 ? 'mt-2 border-l border-line pl-3' : 'mt-2 first:mt-0'}>
      {entry.branchLabel && (
        <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-soft">
          <CornerDownRight className="h-3 w-3" aria-hidden />
          {entry.branchLabel}
        </p>
      )}

      {entry.kind === 'ref' ? (
        <p className="rounded-lg border border-dashed border-mist p-2.5 text-xs text-soft">
          Continúa en: <span className="font-medium text-graphite">{nodeTitle(entry.step)}</span>
        </p>
      ) : (
        <>
          <OutlineRow
            id={entry.id}
            step={entry.step}
            selected={selected === entry.id}
            hasError={errorsForNode(errors, entry.id).length > 0}
            incomplete={isNodeIncomplete(entry.step)}
            onSelect={onSelect}
          />
          {entry.children.length > 0 && (
            <ul>
              {entry.children.map((child, i) => (
                <FlowOutlineEntry key={i} entry={child} selected={selected} onSelect={onSelect} errors={errors} depth={depth + 1} />
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}
