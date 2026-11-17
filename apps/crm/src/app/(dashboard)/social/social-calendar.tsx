'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { dayKey, monthWeeks, moveToDay, weekDays } from '@/lib/social/calendar';
import { cn } from '@/lib/utils';
import type { PostRow } from './social-publisher';

const CHIP: Record<PostRow['status'], string> = {
  DRAFT: 'border-mist bg-paper text-graphite',
  SCHEDULED: 'border-transparent bg-solar/30 text-warning-ink',
  PUBLISHING: 'border-transparent bg-electric/10 text-info-ink',
  PUBLISHED: 'border-transparent bg-lime/35 text-success-ink',
  FAILED: 'border-transparent bg-tomato/12 text-danger-ink',
};
const STATUS_LABEL: Record<PostRow['status'], string> = { DRAFT: 'Borrador', SCHEDULED: 'Programado', PUBLISHING: 'Publicando', PUBLISHED: 'Publicado', FAILED: 'Falló' };
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const movable = (post: PostRow) => post.status === 'DRAFT' || post.status === 'SCHEDULED';
/** Fecha que ubica el post en el calendario: la publicada manda sobre la planificada. */
export const calendarDate = (post: PostRow) => post.publishedAt ?? post.scheduledAt;
const time = (iso: string) => new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

type Props = {
  mode: 'month' | 'week';
  posts: PostRow[];
  canManage: boolean;
  pending: boolean;
  onEdit: (post: PostRow) => void;
  onPlanDay: (day: Date) => void;
  onAction: (post: PostRow, body: Record<string, string>) => Promise<unknown>;
  onDelete: (post: PostRow) => void;
};

export function SocialCalendar({ mode, posts, canManage, pending, onEdit, onPlanDay, onAction, onDelete }: Props) {
  const [anchor, setAnchor] = useState(() => new Date());
  const [dragged, setDragged] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const selected = posts.find((p) => p.id === selectedId) ?? null;

  const byDay = new Map<string, PostRow[]>();
  for (const post of posts) {
    const iso = calendarDate(post);
    if (!iso) continue;
    const key = dayKey(new Date(iso));
    byDay.set(key, [...(byDay.get(key) ?? []), post].sort((a, b) => calendarDate(a)!.localeCompare(calendarDate(b)!)));
  }
  const weeks = mode === 'month' ? monthWeeks(anchor.getFullYear(), anchor.getMonth()) : [weekDays(anchor)];
  const today = dayKey(new Date());
  const unplanned = posts.filter((p) => !calendarDate(p));

  function shift(step: number) {
    setAnchor(mode === 'month' ? new Date(anchor.getFullYear(), anchor.getMonth() + step, 1) : new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + step * 7));
  }
  function drop(day: Date) {
    const post = posts.find((p) => p.id === dragged);
    setDragged(null);
    if (!post || !movable(post) || !canManage) return;
    const target = moveToDay(post.scheduledAt ? new Date(post.scheduledAt) : null, day);
    if (post.scheduledAt && dayKey(new Date(post.scheduledAt)) === dayKey(target)) return;
    void onAction(post, { action: 'reschedule', scheduledAt: target.toISOString() });
  }
  const select = (post: PostRow) => {
    setSelectedId(post.id === selectedId ? null : post.id);
    setMoveTo(toLocalInput(post.scheduledAt));
  };

  const title =
    mode === 'month'
      ? anchor.toLocaleDateString('es', { month: 'long', year: 'numeric' })
      : `${weeks[0][0].toLocaleDateString('es', { day: 'numeric', month: 'short' })} – ${weeks[0][6].toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <div className="space-y-3" data-social-calendar={mode}>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => shift(-1)} aria-label={mode === 'month' ? 'Mes anterior' : 'Semana anterior'}><ChevronLeft aria-hidden /></Button>
        <p className="min-w-0 flex-1 text-center text-sm font-semibold capitalize text-carbon">{title}</p>
        <Button type="button" size="sm" variant="ghost" onClick={() => shift(1)} aria-label={mode === 'month' ? 'Mes siguiente' : 'Semana siguiente'}><ChevronRight aria-hidden /></Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setAnchor(new Date())}>Hoy</Button>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line text-xs">
        {WEEKDAYS.map((d) => (
          <div key={d} className="bg-ivory px-1 py-1 text-center font-semibold text-soft">{d}</div>
        ))}
        {weeks.flat().map((day) => {
          const key = dayKey(day);
          const items = byDay.get(key) ?? [];
          const outside = mode === 'month' && day.getMonth() !== anchor.getMonth();
          return (
            <div
              key={key}
              data-day={key}
              onDragOver={(e) => { if (dragged) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); drop(day); }}
              className={cn('group min-w-0 bg-paper p-1', mode === 'month' ? 'min-h-20' : 'min-h-48', outside && 'bg-canvas/60 text-soft')}
            >
              <div className="flex items-center justify-between">
                <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[11px]', key === today && 'bg-carbon font-semibold text-canvas')}>{day.getDate()}</span>
                {canManage && (
                  <button type="button" className="rounded p-0.5 text-soft opacity-0 hover:bg-ivory hover:text-carbon focus:opacity-100 group-hover:opacity-100" onClick={() => onPlanDay(day)} aria-label={`Planificar el ${day.toLocaleDateString('es', { day: 'numeric', month: 'long' })}`}>
                    <Plus className="h-3 w-3" aria-hidden />
                  </button>
                )}
              </div>
              <ul className="mt-1 space-y-0.5">
                {items.map((post) => (
                  <li key={post.id}>
                    <button
                      type="button"
                      draggable={canManage && movable(post)}
                      onDragStart={() => setDragged(post.id)}
                      onDragEnd={() => setDragged(null)}
                      onClick={() => select(post)}
                      data-calendar-post={post.id}
                      data-status={post.status}
                      title={`${STATUS_LABEL[post.status]} · ${post.caption.slice(0, 80)}`}
                      className={cn('block w-full truncate rounded border px-1 py-0.5 text-left text-[11px] leading-tight', CHIP[post.status], canManage && movable(post) && 'cursor-grab', selectedId === post.id && 'ring-2 ring-electric', dragged === post.id && 'opacity-50')}
                    >
                      <span className="font-semibold">{time(calendarDate(post)!)}</span>
                      <span className="hidden sm:inline"> {post.caption || '(sin texto)'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {unplanned.length > 0 && <p className="text-xs text-soft">{unplanned.length} borrador(es) sin fecha: están en la vista Lista.</p>}

      {selected && (
        <Card className="space-y-3 p-4" data-calendar-selected={selected.id}>
          <div className="text-sm">
            <p className="font-semibold text-carbon">{STATUS_LABEL[selected.status]} · {selected.network === 'TIKTOK' ? 'TikTok' : 'Instagram'}{selected.accountName ? ` · ${selected.accountName}` : ''}</p>
            <p className="line-clamp-2 break-words text-graphite">{selected.caption || '(sin texto)'}</p>
            {selected.lastError && selected.status !== 'PUBLISHED' && <p className="mt-1 text-xs text-danger-ink">{selected.lastError}</p>}
          </div>
          {canManage && (
            <div className="flex flex-wrap items-end gap-2">
              {movable(selected) && (
                // Alternativa al arrastre (teclado / táctil).
                <form
                  className="flex items-end gap-2"
                  onSubmit={(e) => { e.preventDefault(); if (moveTo) void onAction(selected, { action: 'reschedule', scheduledAt: new Date(moveTo).toISOString() }); }}
                >
                  <label className="space-y-1 text-xs">
                    <span className="block font-semibold text-carbon">Mover a</span>
                    <Input type="datetime-local" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} />
                  </label>
                  <Button type="submit" size="sm" variant="outline" disabled={pending || !moveTo}>Mover</Button>
                </form>
              )}
              {['DRAFT', 'SCHEDULED', 'FAILED'].includes(selected.status) && <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(selected)}>Editar</Button>}
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => void onAction(selected, { action: 'duplicate' })}>Duplicar</Button>
              {movable(selected) && selected.network !== 'TIKTOK' && <Button type="button" size="sm" disabled={pending} onClick={() => void onAction(selected, { action: 'publish_now' })}>Publicar ahora</Button>}
              {selected.status === 'SCHEDULED' && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => void onAction(selected, { action: 'unschedule' })}>Cancelar programación</Button>}
              {selected.status === 'FAILED' && <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void onAction(selected, { action: 'retry' })}>Reintentar</Button>}
              {selected.status !== 'PUBLISHING' && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => onDelete(selected)}>Borrar</Button>}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
