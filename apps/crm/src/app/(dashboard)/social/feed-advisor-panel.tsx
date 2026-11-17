'use client';

import { useEffect, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { analyzeFeed, PILLARS, type Recommendation } from '@/lib/social/feed-advisor';
import type { PostRow } from './social-publisher';

const IGNORED_KEY = 'upzites.feedAdvisor.ignored';
const SEVERITY = { alta: 'danger', media: 'warning', info: 'outline' } as const;
const ACCEPT = { reorder: 'Aplicar orden', create: 'Crear pieza', edit: 'Editar pieza' } as const;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

/**
 * P24: recomendaciones del feed de una cuenta. Nada cambia sin "Aceptar":
 * reordenar muestra antes cómo quedan las fechas y usa el mismo guardado de P21.
 */
export function FeedAdvisorPanel({ posts, canManage, pending, onReorder, onCreate, onEdit }: {
  posts: (PostRow & { assetTags?: string[] })[];
  canManage: boolean;
  pending: boolean;
  onReorder: (order: string[]) => Promise<unknown>;
  onCreate: (action: Extract<Recommendation['action'], { type: 'create' }>) => void;
  onEdit: (post: PostRow) => void;
}) {
  const [ignored, setIgnored] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  useEffect(() => {
    try {
      setIgnored(JSON.parse(localStorage.getItem(IGNORED_KEY) ?? '[]'));
    } catch {
      // sin almacenamiento: se muestran todas
    }
  }, []);
  const ignore = (id: string) => {
    const next = [...ignored, id].slice(-200);
    setIgnored(next);
    try {
      localStorage.setItem(IGNORED_KEY, JSON.stringify(next));
    } catch {
      // solo dura esta visita
    }
  };

  const byId = new Map(posts.map((p) => [p.id, p]));
  const recs = analyzeFeed(posts).filter((r) => !ignored.includes(r.id));
  if (!posts.length) return null;

  // Vista previa del reordenamiento: qué pieza toma qué fecha (las mismas fechas, otro reparto).
  function changes(order: string[]) {
    const dates = order.map((id) => byId.get(id)?.scheduledAt ?? '').sort().reverse();
    return order.map((id, i) => ({ post: byId.get(id)!, from: byId.get(id)?.scheduledAt ?? null, to: dates[i] })).filter((c) => c.from !== c.to);
  }

  return (
    <section className="space-y-2 rounded-xl border border-line p-3" data-feed-advisor aria-label="Asistente del feed">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-carbon">
        <Lightbulb className="h-4 w-4 text-electric" aria-hidden /> Asistente del feed
        {ignored.length > 0 && (
          <button type="button" className="ml-auto text-xs font-normal text-soft hover:text-carbon" onClick={() => { setIgnored([]); try { localStorage.removeItem(IGNORED_KEY); } catch { /* nada */ } }}>
            Mostrar ignoradas ({ignored.length})
          </button>
        )}
      </h3>
      {recs.length === 0 && <p className="text-xs text-soft">Sin recomendaciones pendientes.</p>}
      <ul className="space-y-2">
        {recs.map((rec) => {
          const preview = rec.action?.type === 'reorder' && confirming === rec.id ? changes(rec.action.order) : null;
          return (
            <li key={rec.id} className="space-y-1 rounded-lg bg-ivory p-3 text-sm" data-advisor-rec={rec.kind}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={SEVERITY[rec.severity]}>{rec.severity === 'alta' ? 'Importante' : rec.severity === 'media' ? 'Sugerencia' : 'Idea'}</Badge>
                <span className="font-semibold text-carbon">{rec.title}</span>
              </div>
              <p className="text-graphite">{rec.detail}</p>
              {rec.postIds.length > 0 && (
                <p className="break-words text-xs text-soft">{rec.postIds.map((id) => byId.get(id)?.caption.slice(0, 40) || '(sin texto)').join(' · ')}</p>
              )}
              {preview && (
                <ul className="space-y-0.5 rounded-md border border-line bg-canvas p-2 text-xs text-graphite" data-advisor-preview>
                  {preview.map((c) => <li key={c.post.id} className="break-words">{c.post.caption.slice(0, 40) || '(sin texto)'}: {when(c.from)} → <strong>{when(c.to)}</strong></li>)}
                </ul>
              )}
              {canManage && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {rec.action && !preview && (
                    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => {
                      const action = rec.action!;
                      if (action.type === 'reorder') setConfirming(rec.id);
                      else if (action.type === 'create') onCreate(action);
                      else { const post = byId.get(action.postId); if (post) onEdit(post); }
                    }}>
                      {ACCEPT[rec.action.type]}{rec.action.type === 'create' ? ` (${PILLARS[rec.action.pillar].toLowerCase()})` : ''}
                    </Button>
                  )}
                  {preview && rec.action?.type === 'reorder' && (
                    <>
                      {/* "Volver" queda donde estaba "Aplicar orden": un doble clic no confirma sin ver el cambio. */}
                      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(null)}>Volver</Button>
                      <Button type="button" size="sm" disabled={pending} onClick={async () => { await onReorder((rec.action as { order: string[] }).order); setConfirming(null); }} data-advisor-confirm>Confirmar cambio de fechas</Button>
                    </>
                  )}
                  <Button type="button" size="sm" variant="ghost" onClick={() => ignore(rec.id)}>Ignorar</Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
