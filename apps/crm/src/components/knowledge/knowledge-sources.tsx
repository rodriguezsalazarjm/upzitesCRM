'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Eye, FileText, Link2, Loader2, Plus, RefreshCw, Search, Trash2, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { SettingsCard } from '@/components/ui/settings-card';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { Switch } from '@/components/ui/switch';
import { Tabs } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { KNOWLEDGE_LIMITS } from '@/lib/workspace-knowledge/limits';

export type KnowledgeSourceView = {
  id: string;
  type: string;
  title: string;
  url: string | null;
  originalName: string | null;
  sizeBytes: number | null;
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  processingError: string | null;
  isActive: boolean;
  ingestedAt: string | null;
  chunkCount: number;
  excerpt: string;
  contentLength: number;
};

type Preview = { id: string; type: string; title: string; url: string | null; content: string; truncated: boolean };
type Hit = { id: string; sourceId: string; sourceType: string; title: string; content: string };

const TYPE_LABEL: Record<string, string> = {
  MANUAL: 'Texto', TEXT: 'Información', FAQ: 'FAQ', POLICY: 'Política', URL: 'Enlace', PDF: 'PDF', TEXT_FILE: 'Documento',
};
const STATUS: Record<KnowledgeSourceView['status'], { label: string; tone: StatusTone }> = {
  READY: { label: 'Lista', tone: 'success' },
  PROCESSING: { label: 'Procesando', tone: 'info' },
  PENDING: { label: 'Pendiente', tone: 'neutral' },
  FAILED: { label: 'Con error', tone: 'danger' },
};
const TEXT_TYPES = ['MANUAL', 'TEXT', 'FAQ', 'POLICY'];
const REPROCESSABLE = ['URL', 'PDF', 'TEXT_FILE'];

function size(bytes: number | null) {
  if (!bytes) return null;
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function request(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as { message?: string; data?: unknown };
  if (!response.ok) throw new Error(body.message ?? 'No se pudo completar la acción.');
  return body.data;
}

export function KnowledgeSources({ sources, canManage, fileUploadReason }: { sources: KnowledgeSourceView[]; canManage: boolean; fileUploadReason: string | null }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [toDelete, setToDelete] = useState<KnowledgeSourceView | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  async function act(id: string, run: () => Promise<unknown>, ok: string) {
    setBusyId(id); setNotice(null);
    try { await run(); setNotice({ tone: 'ok', text: ok }); router.refresh(); }
    catch (error) { setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudo completar la acción.' }); router.refresh(); }
    finally { setBusyId(null); }
  }

  const patch = (id: string, body: object) => request(`/api/knowledge/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  async function open(source: KnowledgeSourceView) {
    setBusyId(source.id);
    try { setPreview(await request(`/api/knowledge/${encodeURIComponent(source.id)}`, { method: 'GET' }) as Preview); }
    catch (error) { setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudo abrir la fuente.' }); }
    finally { setBusyId(null); }
  }

  return (
    <div className="space-y-4">
      <SettingsCard
        icon={BookOpen}
        title="Fuentes de conocimiento"
        description="Textos, páginas web y documentos que el agente consulta. Solo se envían al agente los fragmentos relevantes a cada pregunta."
        actions={canManage && !adding ? <Button size="sm" className="hidden sm:inline-flex" onClick={() => setAdding(true)}><Plus aria-hidden />Agregar fuente</Button> : undefined}
      >
        {/* En móvil el botón del encabezado aprieta la descripción: va al cuerpo, a ancho completo. */}
        {canManage && !adding && <Button size="sm" className="mb-4 w-full sm:hidden" onClick={() => setAdding(true)}><Plus aria-hidden />Agregar fuente</Button>}
        {adding && <AddSource fileUploadReason={fileUploadReason} onCancel={() => setAdding(false)} onCreated={(text, failed) => { setAdding(false); setNotice({ tone: failed ? 'error' : 'ok', text }); router.refresh(); }} />}
        {notice && <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`mb-4 rounded-xl px-4 py-3 text-sm ${notice.tone === 'error' ? 'bg-tomato/10 text-danger-ink' : 'bg-ivory text-carbon'}`}>{notice.text}</p>}
        {sources.length === 0 && !adding
          ? <EmptyState icon={BookOpen} title="Sin fuentes de conocimiento" description="Agrega información del negocio, la URL de tu sitio o un PDF con tus condiciones para que el agente pueda responder con datos reales." />
          : (
            <ul className="divide-y divide-line">
              {sources.map((source) => {
                const status = STATUS[source.status];
                const busy = busyId === source.id;
                return (
                  <li key={source.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <StatusBadge tone="neutral">{TYPE_LABEL[source.type] ?? source.type}</StatusBadge>
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                        {!source.isActive && <StatusBadge tone="draft">Inactiva</StatusBadge>}
                      </div>
                      <h3 className="truncate text-sm font-bold text-carbon">{source.title}</h3>
                      <p className="mt-0.5 truncate text-xs text-soft">
                        {[source.url, source.originalName, size(source.sizeBytes), source.chunkCount ? `${source.chunkCount} fragmento${source.chunkCount === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}
                      </p>
                      {source.processingError && <p className="mt-1.5 text-xs font-medium text-danger-ink">{source.status === 'READY' ? 'Último reproceso falló (se conserva la versión anterior): ' : ''}{source.processingError}</p>}
                      {source.excerpt && <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-graphite">{source.excerpt}</p>}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      <label className="mr-2 inline-flex items-center gap-2 text-xs font-medium text-graphite">
                        <Switch
                          checked={source.isActive}
                          disabled={!canManage || busy}
                          onCheckedChange={(value) => act(source.id, () => patch(source.id, { isActive: value }), value ? 'Fuente activada.' : 'Fuente desactivada: el agente ya no la consulta.')}
                          aria-label={`Disponible para el agente: ${source.title}`}
                        />
                        Activa
                      </label>
                      <Button variant="ghost" size="sm" className="relative" disabled={busy} onClick={() => open(source)} aria-label={`Ver ${source.title}`}><Eye aria-hidden /><span className="sr-only sm:not-sr-only">Ver</span></Button>
                      {canManage && REPROCESSABLE.includes(source.type) && (
                        <Button variant="ghost" size="sm" className="relative" disabled={busy} onClick={() => act(source.id, () => patch(source.id, { reprocess: true }), 'Fuente actualizada.')} aria-label={`Reprocesar ${source.title}`}>
                          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}<span className="sr-only sm:not-sr-only">Reprocesar</span>
                        </Button>
                      )}
                      {canManage && (
                        <Button variant="ghost" size="sm" className="relative text-danger-ink hover:bg-tomato/12" disabled={busy} onClick={() => setToDelete(source)} aria-label={`Eliminar ${source.title}`}>
                          <Trash2 aria-hidden /><span className="sr-only sm:not-sr-only">Eliminar</span>
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
      </SettingsCard>

      <SearchPreview />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(value) => { if (!value) setToDelete(null); }}
        title="Eliminar fuente"
        description={<>Se eliminará <strong>{toDelete?.title}</strong> y sus fragmentos. El agente dejará de usarla de inmediato.</>}
        confirmLabel="Eliminar"
        destructive
        busy={!!toDelete && busyId === toDelete.id}
        onConfirm={() => { const source = toDelete; if (!source) return; act(source.id, () => request(`/api/knowledge/${encodeURIComponent(source.id)}`, { method: 'DELETE' }), 'Fuente eliminada.').then(() => setToDelete(null)); }}
      />

      <Drawer id="knowledge-source-preview" open={!!preview} onClose={() => setPreview(null)} title={preview?.title ?? 'Fuente'}>
        {preview && <SourcePreview key={preview.id} preview={preview} canEdit={canManage && TEXT_TYPES.includes(preview.type)} onSaved={() => { setPreview(null); setNotice({ tone: 'ok', text: 'Fuente actualizada.' }); router.refresh(); }} save={(body) => patch(preview.id, body)} />}
      </Drawer>
    </div>
  );
}

function AddSource({ fileUploadReason, onCancel, onCreated }: { fileUploadReason: string | null; onCancel: () => void; onCreated: (text: string, failed: boolean) => void }) {
  const [mode, setMode] = useState<'MANUAL' | 'URL' | 'FILE'>('MANUAL');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      let init: RequestInit;
      if (mode === 'FILE') {
        if (!file) throw new Error('Selecciona un archivo.');
        if (file.size > KNOWLEDGE_LIMITS.fileBytes) throw new Error('El archivo supera 4 MB.');
        const form = new FormData(); form.set('title', title); form.set('file', file);
        init = { method: 'POST', body: form };
      } else {
        init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mode === 'URL' ? { kind: 'URL', title, url } : { kind: 'MANUAL', title, content }) };
      }
      const source = await request('/api/knowledge', init) as { status: string; processingError: string | null };
      onCreated(source.status === 'FAILED' ? `La fuente se guardó pero no se pudo procesar: ${source.processingError ?? 'error desconocido'}` : 'Fuente agregada y lista para el agente.', source.status === 'FAILED');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo agregar la fuente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-5 space-y-4 rounded-xl border border-line bg-canvas p-4" noValidate>
      <Tabs
        ariaLabel="Tipo de fuente"
        value={mode}
        onValueChange={(value) => { setMode(value as typeof mode); setError(null); }}
        items={[{ value: 'MANUAL', label: 'Texto', icon: Type }, { value: 'URL', label: 'Enlace', icon: Link2 }, { value: 'FILE', label: 'Archivo', icon: FileText }]}
      />
      <fieldset disabled={busy} className="space-y-4">
        <FormField label="Título" htmlFor="knowledge-new-title" required description="Cómo identificarás esta fuente. También ayuda a encontrarla.">
          <Input maxLength={KNOWLEDGE_LIMITS.sourceTitle} value={title} onChange={(event) => setTitle(event.target.value)} />
        </FormField>
        {mode === 'MANUAL' && (
          <FormField label="Contenido" htmlFor="knowledge-new-content" required description="Información del negocio, condiciones, preguntas y respuestas…">
            <Textarea rows={8} maxLength={KNOWLEDGE_LIMITS.manualText} value={content} onChange={(event) => setContent(event.target.value)} />
          </FormField>
        )}
        {mode === 'URL' && (
          <FormField label="URL pública" htmlFor="knowledge-new-url" required description="Se guarda una copia del texto de la página (HTML o texto, hasta 1 MB). Usa Reprocesar cuando cambie.">
            <Input type="url" inputMode="url" placeholder="https://tusitio.com/preguntas-frecuentes" value={url} onChange={(event) => setUrl(event.target.value)} />
          </FormField>
        )}
        {mode === 'FILE' && (fileUploadReason
          ? <p className="rounded-xl bg-ivory px-4 py-3 text-sm text-graphite">La subida de archivos no está disponible: {fileUploadReason}</p>
          : (
            <FormField label="Archivo" htmlFor="knowledge-new-file" required description="PDF con texto seleccionable, TXT o Markdown, hasta 4 MB. Los PDF escaneados (solo imagen) no se pueden leer.">
              <Input type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </FormField>
          ))}
      </fieldset>
      {error && <p role="alert" className="text-sm font-medium text-danger-ink">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !title.trim() || (mode === 'FILE' && (!!fileUploadReason || !file))}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}{busy ? 'Procesando…' : 'Agregar fuente'}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  );
}

function SourcePreview({ preview, canEdit, save, onSaved }: { preview: Preview; canEdit: boolean; save: (body: object) => Promise<unknown>; onSaved: () => void }) {
  const [title, setTitle] = useState(preview.title);
  const [content, setContent] = useState(preview.content);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) {
    return (
      <div className="space-y-3 p-5">
        {preview.url && <p className="break-all text-xs text-soft">{preview.url}</p>}
        <p className="text-xs text-soft">Texto extraído{preview.truncated ? ' (vista parcial)' : ''}:</p>
        <pre className="whitespace-pre-wrap break-words rounded-xl bg-ivory p-3 font-sans text-sm leading-6 text-carbon">{preview.content || 'Sin texto extraído.'}</pre>
      </div>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try { await save({ title, content }); onSaved(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-5" noValidate>
      <fieldset disabled={busy || preview.truncated} className="space-y-4">
        <FormField label="Título" htmlFor="knowledge-edit-title"><Input maxLength={KNOWLEDGE_LIMITS.sourceTitle} value={title} onChange={(event) => setTitle(event.target.value)} /></FormField>
        <FormField label="Contenido" htmlFor="knowledge-edit-content"><Textarea rows={14} maxLength={KNOWLEDGE_LIMITS.manualText} value={content} onChange={(event) => setContent(event.target.value)} /></FormField>
      </fieldset>
      {preview.truncated && <p className="text-xs text-soft">El texto es demasiado largo para editarlo aquí.</p>}
      {error && <p role="alert" className="text-sm font-medium text-danger-ink">{error}</p>}
      <Button type="submit" disabled={busy || preview.truncated || !title.trim() || !content.trim() || (title === preview.title && content === preview.content)}>
        {busy && <Loader2 className="animate-spin" aria-hidden />}Guardar y reindexar
      </Button>
    </form>
  );
}

function SearchPreview() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy(true); setError(null);
    try { setHits(await request('/api/knowledge/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) }) as Hit[]); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo buscar.'); }
    finally { setBusy(false); }
  }

  return (
    <SettingsCard icon={Search} title="Probar búsqueda" description="Escribe una pregunta como la haría un cliente y mira qué fragmentos recibiría el agente. No consume créditos de IA.">
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <FormField label="Pregunta del cliente" htmlFor="knowledge-search-query" className="flex-1">
          <Input maxLength={500} value={query} placeholder="¿Hacen envíos a regiones?" onChange={(event) => setQuery(event.target.value)} />
        </FormField>
        <Button type="submit" variant="outline" disabled={busy || !query.trim()}>{busy ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}Buscar</Button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm font-medium text-danger-ink">{error}</p>}
      {hits && (
        <div className="mt-4 space-y-2" aria-live="polite">
          {hits.length === 0 && <p className="text-sm text-soft">Ninguna fuente activa responde a esa pregunta. El agente lo dirá en vez de inventar.</p>}
          {hits.map((hit, index) => (
            <div key={hit.id} className="rounded-xl bg-ivory p-3">
              <p className="mb-1 text-xs font-semibold text-graphite">#{index + 1} · {TYPE_LABEL[hit.sourceType] ?? hit.sourceType} · {hit.title}</p>
              <p className="line-clamp-6 whitespace-pre-wrap text-sm leading-6 text-carbon">{hit.content}</p>
            </div>
          ))}
        </div>
      )}
    </SettingsCard>
  );
}
