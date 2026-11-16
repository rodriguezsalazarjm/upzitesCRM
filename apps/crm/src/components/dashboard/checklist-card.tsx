'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Lock, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import type { ChecklistItem } from '@/lib/onboarding-checklist/resolve';
import { cn } from '@/lib/utils';

const rowClass = 'flex items-start gap-3 rounded-xl border border-line p-3 transition-colors';

function ItemBody({ item }: { item: ChecklistItem }) {
  const detail =
    item.state === 'locked'
      ? item.lockedPlan
        ? `Disponible desde ${item.lockedPlan}`
        : 'No incluido en tu plan'
      : item.roleRestricted && item.state !== 'completed'
        ? 'La completa un owner o admin de este negocio.'
        : item.description;
  return (
    <>
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
          item.state === 'completed' ? 'border-electric bg-electric text-white' : 'border-stone text-soft',
        )}
        aria-hidden
      >
        {item.state === 'completed' ? <Check className="h-3 w-3" /> : item.state === 'locked' ? <Lock className="h-3 w-3" /> : null}
      </span>
      <span className="min-w-0">
        <span className={cn('block text-sm font-semibold text-carbon', item.state === 'completed' && 'line-through')}>{item.label}</span>
        <span className="block text-xs text-soft">{detail}</span>
      </span>
    </>
  );
}

/**
 * Checklist de puesta en marcha (P0-E). Derivado del preset; el avance se
 * calcula del estado real. Lo bloqueado por plan se ve con "Disponible en X"
 * y NO cuenta como pendiente obligatorio.
 */
async function setHidden(hidden: boolean) {
  await fetch('/api/preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ checklistHidden: hidden }),
  });
}

/** P16: "continuar después": quien ocultó los primeros pasos los recupera mientras queden pendientes. */
export function ResumeChecklist({ pending }: { pending: number }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => void setHidden(false).then(() => router.refresh())}
      className="inline-flex items-center gap-1 text-sm font-semibold text-electric hover:underline"
      data-resume-checklist
    >
      Retomar primeros pasos ({pending} {pending === 1 ? 'pendiente' : 'pendientes'}) <ArrowRight className="h-4 w-4" aria-hidden />
    </button>
  );
}

export function ChecklistCard({ items, completed, actionable }: { items: ChecklistItem[]; completed: number; actionable: number }) {
  const router = useRouter();
  async function hide() {
    await setHidden(true);
    router.refresh();
  }
  // P16: el siguiente paso es la primera tarea que ESTA persona puede hacer ya, en el orden del rubro.
  const next = items.find((item) => item.state === 'available' && item.href);
  const percent = actionable === 0 ? 100 : Math.round((completed / actionable) * 100);
  return (
    <Card className="p-6" data-checklist>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>Primeros pasos</Eyebrow>
          <h2 className="mt-1 text-lg font-bold tracking-tight">
            {completed} de {actionable} listos
          </h2>
        </div>
        <button type="button" onClick={() => void hide()} className="rounded p-1 text-soft hover:bg-ivory hover:text-carbon" aria-label="Ocultar primeros pasos por ahora" title="Ocultar por ahora (puedes retomarlos desde el inicio)">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ivory" aria-hidden>
        <div className="h-full rounded-full bg-electric" style={{ width: `${percent}%` }} />
      </div>
      {next && (
        <Link
          href={next.href!}
          className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-carbon px-4 py-3 text-sm text-canvas hover:bg-carbon/90"
          data-next-step={next.id}
        >
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-lime">Siguiente paso</span>
            <span className="block truncate font-semibold">{next.label}</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        </Link>
      )}
      <ul className="mt-4 grid gap-2 md:grid-cols-2">
        {items.map((item) => (
          <li key={item.id} data-task={item.id} data-state={item.state} data-role-restricted={item.roleRestricted || undefined}>
            {item.href ? (
              <Link href={item.href} className={cn(rowClass, 'hover:border-stone', item.state === 'completed' && 'opacity-60')}>
                <ItemBody item={item} />
              </Link>
            ) : (
              // Tarea de otro rol: aviso sin enlace (nunca un CTA a algo prohibido).
              <div className={cn(rowClass, 'bg-ivory/60', item.state === 'completed' && 'opacity-60')}>
                <ItemBody item={item} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
