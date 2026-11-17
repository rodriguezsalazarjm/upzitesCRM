'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CONTENT_TASKS, CONTENT_TONES, type ContentSuggestion, type ContentTask } from '@/lib/social/content-tasks';

export type AssistantSource = { caption: string; hashtags: string[]; contentAssetId: string; mediaUrl: string; scheduledAt: string; instagramAccountId: string };

/** Fecha sugerida (día) → 11:00 hora local; sin fecha, la del formulario. */
const plannedAt = (s: ContentSuggestion, fallback: string) => (s.date ? new Date(`${s.date}T11:00`) : fallback ? new Date(fallback) : null)?.toISOString();

/**
 * P23: asistente de contenido. Genera sugerencias; nada se guarda hasta que el
 * usuario lo pide ("Usar" pasa al formulario, "Guardar" crea un borrador).
 */
export function ContentAssistant({ source, onUse, onSaved }: { source: AssistantSource; onUse: (s: ContentSuggestion) => void; onSaved: (message: string) => void }) {
  const [task, setTask] = useState<ContentTask>('variants');
  const [tone, setTone] = useState('');
  const [brief, setBrief] = useState('');
  const [items, setItems] = useState<(ContentSuggestion & { saved?: string })[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function generate() {
    setBusy(true);
    setError('');
    const response = await fetch('/api/social-posts/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, tone: tone || undefined, brief, sourceText: source.caption, hashtags: source.hashtags, contentAssetId: source.contentAssetId || undefined }),
    }).catch(() => null);
    const json = (await response?.json().catch(() => null)) as { data?: ContentSuggestion[]; message?: string } | null;
    setBusy(false);
    if (!response?.ok || !json?.data) return setError(json?.message ?? 'No se pudo generar. Inténtalo de nuevo.');
    setItems(json.data);
  }

  async function save(index: number, action: 'draft' | 'schedule') {
    const s = items[index];
    setError('');
    const response = await fetch('/api/social-posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        network: s.network,
        channelAccountId: s.network === 'INSTAGRAM' ? source.instagramAccountId : undefined,
        caption: s.text,
        hashtags: s.hashtags,
        mediaUrl: source.contentAssetId ? '' : source.mediaUrl.trim(),
        contentAssetId: source.contentAssetId || undefined,
        mediaType: s.format,
        action,
        scheduledAt: plannedAt(s, source.scheduledAt),
      }),
    }).catch(() => null);
    const json = (await response?.json().catch(() => null)) as { message?: string } | null;
    if (!response?.ok) return setError(json?.message ?? 'No se pudo guardar.');
    const label = action === 'schedule' ? 'Programada' : 'Guardada como borrador';
    setItems((list) => list.map((item, i) => (i === index ? { ...item, saved: label } : item)));
    onSaved(`${label} (${s.network === 'TIKTOK' ? 'TikTok' : 'Instagram'}).`);
  }

  const saveAll = async () => {
    for (let i = 0; i < items.length; i += 1) if (!items[i].saved) await save(i, 'draft');
  };
  const canSchedule = (s: ContentSuggestion) => s.network === 'INSTAGRAM' && Boolean(source.instagramAccountId) && Boolean(source.contentAssetId || source.mediaUrl.trim()) && Boolean(s.date || source.scheduledAt);

  return (
    <details className="rounded-xl border border-line p-3" data-content-assistant>
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-carbon">
        <Sparkles className="h-4 w-4 text-electric" aria-hidden /> Asistente de contenido (IA)
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-soft">Parte del texto y la pieza de arriba. Revisa siempre antes de publicar.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span className="font-semibold text-carbon">Qué necesitas</span>
            <Select value={task} onChange={(e) => setTask(e.target.value as ContentTask)} data-ai-task>
              {Object.entries(CONTENT_TASKS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </Select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-semibold text-carbon">Tono</span>
            <Select value={tone} onChange={(e) => setTone(e.target.value)}>
              <option value="">El de la marca</option>
              {CONTENT_TONES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="font-semibold text-carbon">Indicaciones (opcional)</span>
          <Textarea rows={2} maxLength={500} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Ej.: para lanzar la guía, público que recién empieza" />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => void generate()} data-ai-generate>{busy ? 'Generando…' : 'Generar'}</Button>
          {items.length > 1 && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void saveAll()}>Guardar todas como borrador</Button>}
        </div>
        {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
        <ul className="space-y-2" aria-live="polite">
          {items.map((s, i) => (
            <li key={i} className="space-y-1 rounded-lg bg-ivory p-3 text-sm" data-ai-suggestion={s.network}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{s.network === 'TIKTOK' ? 'TikTok' : 'Instagram'} · {s.format === 'REEL' ? 'Video' : 'Imagen'}</Badge>
                {s.date && <span className="text-xs text-soft">{new Date(`${s.date}T11:00`).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })}</span>}
                {s.saved && <Badge variant="success">{s.saved}</Badge>}
              </div>
              {s.title && <p className="font-semibold text-carbon">{s.title}</p>}
              <p className="whitespace-pre-line break-words text-carbon">{s.text}</p>
              {s.hashtags.length > 0 && <p className="break-words text-xs text-electric">{s.hashtags.map((t) => `#${t}`).join(' ')}</p>}
              {s.note && <p className="text-xs text-soft">{s.note}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" size="sm" variant="ghost" onClick={() => onUse(s)}>Usar en el formulario</Button>
                {!s.saved && <Button type="button" size="sm" variant="outline" onClick={() => void save(i, 'draft')}>Guardar borrador</Button>}
                {!s.saved && canSchedule(s) && <Button type="button" size="sm" variant="outline" onClick={() => void save(i, 'schedule')}>Programar</Button>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
