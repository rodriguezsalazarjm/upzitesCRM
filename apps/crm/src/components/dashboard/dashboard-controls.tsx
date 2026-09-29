'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ArrowLeft, ArrowRight, EyeOff, Maximize2, Minimize2, Plus, RotateCcw } from 'lucide-react';
import type { WidgetId, WidgetSize } from '@/lib/dashboard/widgets/types';
import { cn } from '@/lib/utils';

type Action =
  | { type: 'hide' | 'show'; id: WidgetId }
  | { type: 'move'; id: WidgetId; direction: -1 | 1 }
  | { type: 'resize'; id: WidgetId; size: WidgetSize }
  | { type: 'reset' };

function useLayoutAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  async function run(action: Action) {
    const response = await fetch('/api/preferences/dashboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
    });
    if (response.ok) startTransition(() => router.refresh());
  }
  return { run, pending };
}

const iconButton = 'rounded p-1 text-soft hover:bg-ivory hover:text-carbon disabled:opacity-40';

/** Mover, cambiar tamaño u ocultar un widget (layout personal). */
export function WidgetControls({ id, size, first, last }: { id: WidgetId; size: WidgetSize; first: boolean; last: boolean }) {
  const { run, pending } = useLayoutAction();
  const nextSize: WidgetSize = size === 'sm' ? 'md' : 'sm';
  return (
    <div className="flex shrink-0 items-center gap-0.5" aria-busy={pending}>
      <button type="button" className={iconButton} disabled={first || pending} onClick={() => void run({ type: 'move', id, direction: -1 })} aria-label="Mover antes">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button type="button" className={iconButton} disabled={last || pending} onClick={() => void run({ type: 'move', id, direction: 1 })} aria-label="Mover después">
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button type="button" className={iconButton} disabled={pending} onClick={() => void run({ type: 'resize', id, size: nextSize })} aria-label={size === 'sm' ? 'Agrandar' : 'Achicar'}>
        {size === 'sm' ? <Maximize2 className="h-3.5 w-3.5" aria-hidden /> : <Minimize2 className="h-3.5 w-3.5" aria-hidden />}
      </button>
      <button type="button" className={iconButton} disabled={pending} onClick={() => void run({ type: 'hide', id })} aria-label="Ocultar widget">
        <EyeOff className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

/** Agregar widgets ocultos/disponibles y volver al layout recomendado. */
export function DashboardToolbar({ available, customized }: { available: { id: WidgetId; title: string; locked: boolean }[]; customized: boolean }) {
  const { run, pending } = useLayoutAction();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex flex-wrap items-center justify-end gap-2">
      {customized && (
        <button
          type="button"
          disabled={pending}
          onClick={() => void run({ type: 'reset' })}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-soft hover:bg-ivory hover:text-carbon"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Layout recomendado
        </button>
      )}
      {available.length > 0 && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper px-3 py-1.5 text-xs font-semibold text-carbon hover:border-stone"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Agregar widget
        </button>
      )}
      {open && (
        <ul className="absolute right-0 top-full z-20 mt-1 w-64 rounded-xl border border-line bg-paper p-1 shadow-lg">
          {available.map((widget) => (
            <li key={widget.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setOpen(false);
                  void run({ type: 'show', id: widget.id });
                }}
                className={cn('flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-ivory', widget.locked && 'text-soft')}
              >
                {widget.title}
                {widget.locked && <span className="text-[10px] font-semibold uppercase">Bloqueado</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
