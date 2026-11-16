'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Lock, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Item = { id: string; label: string; locked: boolean; lockedPlan: string | null };

/**
 * P15 — personalizar el menú desde Configuración: arrastrar (o flechas, para
 * teclado), mostrar/ocultar y volver al recomendado. Se guarda en la misma
 * preferencia USUARIO x WORKSPACE que usa el sidebar; el plan sigue bloqueando
 * lo que no incluye y los módulos de sistema no se tocan.
 */
export function MenuCustomizer({ visible: initialVisible, hidden: initialHidden }: { visible: Item[]; hidden: Item[] }) {
  const router = useRouter();
  const [visible, setVisible] = useState(initialVisible);
  const [hidden, setHidden] = useState(initialHidden);
  const [dragged, setDragged] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  async function save(nextVisible: Item[], nextHidden: Item[], reset = false) {
    setVisible(nextVisible);
    setHidden(nextHidden);
    setError('');
    const response = await fetch('/api/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      // navOrder con un módulo que el rubro ocultaba = recuperado; hiddenNavItems = ocultos por la persona.
      body: JSON.stringify(reset ? { navOrder: [], hiddenNavItems: [] } : { navOrder: nextVisible.map((i) => i.id), hiddenNavItems: nextHidden.map((i) => i.id) }),
    }).catch(() => null);
    if (!response?.ok) {
      setError('No se pudo guardar. Recarga e inténtalo de nuevo.');
      return;
    }
    startTransition(() => router.refresh());
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= visible.length || from === to) return;
    const next = [...visible];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    void save(next, hidden);
  }

  const planLabel = (item: Item) =>
    item.locked && (
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-soft">
        <Lock className="h-3 w-3" aria-hidden />
        {item.lockedPlan ?? 'Plan'}
      </span>
    );

  return (
    <div className="space-y-4" aria-busy={pending}>
      <div>
        <p className="text-sm font-semibold text-carbon">Personalizar menú</p>
        <p className="text-xs text-soft">Arrastra para ordenar. Solo cambia tu menú en este negocio.</p>
      </div>
      <ol className="space-y-1">
        {visible.map((item, index) => (
          <li
            key={item.id}
            draggable
            onDragStart={() => setDragged(item.id)}
            onDragEnd={() => setDragged(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              const from = visible.findIndex((i) => i.id === dragged);
              if (from >= 0) move(from, index);
              setDragged(null);
            }}
            className={cn('flex items-center gap-2 rounded-lg border border-line bg-paper px-2 py-1.5 text-sm', dragged === item.id && 'opacity-50')}
          >
            <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-soft" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-carbon">{item.label}</span>
            {planLabel(item)}
            <button type="button" className="rounded p-1 text-soft hover:bg-ivory hover:text-carbon disabled:opacity-30" disabled={index === 0 || pending} onClick={() => move(index, index - 1)} aria-label={`Subir ${item.label}`}>
              <ArrowUp className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button type="button" className="rounded p-1 text-soft hover:bg-ivory hover:text-carbon disabled:opacity-30" disabled={index === visible.length - 1 || pending} onClick={() => move(index, index + 1)} aria-label={`Bajar ${item.label}`}>
              <ArrowDown className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button type="button" className="rounded p-1 text-soft hover:bg-ivory hover:text-carbon disabled:opacity-30" disabled={pending || visible.length === 1} onClick={() => void save(visible.filter((i) => i.id !== item.id), [...hidden, item])} aria-label={`Ocultar ${item.label}`}>
              <EyeOff className="h-3.5 w-3.5" aria-hidden />
            </button>
          </li>
        ))}
      </ol>
      {hidden.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-soft">Ocultos</p>
          <ul className="space-y-1">
            {hidden.map((item) => (
              <li key={item.id} className="flex items-center gap-2 rounded-lg border border-dashed border-line px-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-graphite">{item.label}</span>
                {planLabel(item)}
                <button type="button" className="rounded p-1 text-soft hover:bg-ivory hover:text-carbon disabled:opacity-30" disabled={pending} onClick={() => void save([...visible, item], hidden.filter((i) => i.id !== item.id))} aria-label={`Mostrar ${item.label}`}>
                  <Eye className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void save(initialVisible, initialHidden, true)}>
        <RotateCcw aria-hidden /> Restaurar menú recomendado
      </Button>
    </div>
  );
}
