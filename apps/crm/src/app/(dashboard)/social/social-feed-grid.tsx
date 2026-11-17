'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Lock, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { matchesSchedule, scheduleOrder } from '@/lib/social/feed';
import { cn } from '@/lib/utils';
import type { PostRow } from './social-publisher';

const LABEL: Record<PostRow['status'], string> = { DRAFT: 'Borrador', SCHEDULED: 'Programado', PUBLISHING: 'Publicando', PUBLISHED: 'Publicado', FAILED: 'Falló' };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const plannable = (p: PostRow) => (p.status === 'DRAFT' || p.status === 'SCHEDULED') && Boolean(p.scheduledAt);

function Media({ post, large = false }: { post: PostRow; large?: boolean }) {
  if (!post.mediaUrl) {
    return <span className="flex h-full w-full items-center justify-center bg-ivory p-2 text-center text-[11px] text-soft">{post.caption.slice(0, large ? 200 : 60) || 'Sin imagen'}</span>;
  }
  return post.mediaType === 'REEL' ? (
    <video src={post.mediaUrl} muted playsInline preload="metadata" controls={large} className="h-full w-full object-cover" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- URL externa del cliente, sin optimizador configurado.
    <img src={post.mediaUrl} alt={post.caption.slice(0, 120) || 'Pieza del feed'} loading="lazy" className="h-full w-full object-cover" />
  );
}

/**
 * P21 Feed Planner: grilla 3 columnas como el perfil de Instagram. Arriba lo
 * que sale último. Arrastrar cambia el diseño; "Guardar plan" ajusta las
 * fechas reales. Lo publicado queda fijo abajo.
 */
export function SocialFeedGrid({ posts, canManage, pending, onSave, onPlanNew, onEdit }: {
  posts: PostRow[];
  canManage: boolean;
  pending: boolean;
  onSave: (order: string[]) => Promise<unknown>;
  onPlanNew: () => void;
  onEdit: (post: PostRow) => void;
}) {
  const future = posts.filter(plannable);
  const published = posts.filter((p) => p.status === 'PUBLISHED').sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  const undated = posts.filter((p) => (p.status === 'DRAFT' || p.status === 'SCHEDULED') && !p.scheduledAt);
  const [order, setOrder] = useState(() => scheduleOrder(future));
  const [dragged, setDragged] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const byId = new Map(posts.map((p) => [p.id, p]));
  const inSync = matchesSchedule(order, future);
  const placeholders = (3 - (order.length % 3)) % 3;
  const previewPost = preview ? byId.get(preview) : null;

  useEffect(() => {
    if (!preview) return;
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setPreview(null);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [preview]);

  function move(id: string, to: number) {
    const from = order.indexOf(id);
    if (from < 0 || to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, id);
    setOrder(next);
  }

  const tile = 'relative aspect-square overflow-hidden bg-ivory';
  return (
    <div className="space-y-3" data-feed-planner>
      <p className="text-xs text-soft">Así se verá el perfil: arriba a la izquierda lo más nuevo. Arrastra las piezas futuras para diseñar el orden; lo publicado no se mueve.</p>
      {!inSync && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-solar/20 p-3 text-sm text-warning-ink" data-feed-mismatch>
          <span className="min-w-0 flex-1">El orden real de publicación no coincide con este diseño.</span>
          {canManage && (
            <>
              <Button type="button" size="sm" disabled={pending} onClick={() => void onSave(order)}>Guardar plan (ajusta fechas)</Button>
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setOrder(scheduleOrder(future))}>Descartar</Button>
            </>
          )}
        </div>
      )}

      <div className="mx-auto grid max-w-[600px] grid-cols-3 gap-1" role="list" aria-label="Feed planificado">
        {canManage && Array.from({ length: placeholders }, (_, i) => (
          <button key={`ph-${i}`} type="button" onClick={onPlanNew} className={cn(tile, 'flex items-center justify-center border border-dashed border-mist text-soft hover:text-carbon')} aria-label="Planificar una pieza nueva" data-feed-placeholder>
            <Plus className="h-5 w-5" aria-hidden />
          </button>
        ))}
        {order.map((id, index) => {
          const post = byId.get(id)!;
          return (
            <div
              key={id}
              role="listitem"
              draggable={canManage}
              onDragStart={() => setDragged(id)}
              onDragEnd={() => setDragged(null)}
              onDragOver={(e) => { if (dragged) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); if (dragged) move(dragged, index); setDragged(null); }}
              className={cn(tile, canManage && 'cursor-grab', dragged === id && 'opacity-40')}
              data-feed-piece={id}
              data-status={post.status}
            >
              <button type="button" className="block h-full w-full" onClick={() => setPreview(id)} aria-label={`Ver ${LABEL[post.status].toLowerCase()} del ${when(post.scheduledAt)}`}>
                <Media post={post} />
              </button>
              <span className={cn('pointer-events-none absolute left-1 top-1 rounded px-1 text-[10px] font-semibold', post.status === 'DRAFT' ? 'bg-paper/90 text-graphite' : 'bg-solar text-warning-ink')}>
                {post.status === 'DRAFT' ? 'Borrador' : when(post.scheduledAt)}
              </span>
            </div>
          );
        })}
        {published.map((post) => (
          <div key={post.id} role="listitem" className={cn(tile, 'opacity-90')} data-feed-published={post.id}>
            <button type="button" className="block h-full w-full" onClick={() => setPreview(post.id)} aria-label={`Ver publicado del ${when(post.publishedAt)}`}>
              <Media post={post} />
            </button>
            <Lock className="pointer-events-none absolute right-1 top-1 h-3.5 w-3.5 text-paper drop-shadow" aria-label="Publicado: no se mueve" />
          </div>
        ))}
      </div>
      {undated.length > 0 && <p className="text-center text-xs text-soft">{undated.length} borrador(es) sin fecha no aparecen: dales fecha en el calendario.</p>}

      {previewPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 p-4" onClick={() => setPreview(null)}>
          <div role="dialog" aria-modal="true" aria-label="Vista previa" className="w-full max-w-md space-y-3 rounded-2xl bg-paper p-4" onClick={(e) => e.stopPropagation()} data-feed-preview>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-carbon">{LABEL[previewPost.status]} · {when(previewPost.publishedAt ?? previewPost.scheduledAt)}</p>
              <button type="button" onClick={() => setPreview(null)} className="rounded p-1 text-soft hover:bg-ivory" aria-label="Cerrar vista previa"><X className="h-4 w-4" aria-hidden /></button>
            </div>
            <div className="aspect-square overflow-hidden rounded-xl"><Media post={previewPost} large /></div>
            <p className="line-clamp-4 whitespace-pre-line break-words text-sm text-graphite">{previewPost.caption}</p>
            {canManage && order.includes(previewPost.id) && (
              <div className="flex flex-wrap gap-2">
                {/* Alternativa al arrastre: antes = más arriba en la grilla. */}
                <Button type="button" size="sm" variant="outline" disabled={order.indexOf(previewPost.id) === 0} onClick={() => move(previewPost.id, order.indexOf(previewPost.id) - 1)}><ArrowLeft aria-hidden /> Antes</Button>
                <Button type="button" size="sm" variant="outline" disabled={order.indexOf(previewPost.id) === order.length - 1} onClick={() => move(previewPost.id, order.indexOf(previewPost.id) + 1)}>Después <ArrowRight aria-hidden /></Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setPreview(null); onEdit(previewPost); }}>Editar</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
