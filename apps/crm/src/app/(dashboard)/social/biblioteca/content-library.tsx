'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { ImageIcon, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export type LibraryAsset = {
  id: string;
  kind: 'IMAGE' | 'VIDEO';
  name: string;
  url: string;
  sizeBytes: number;
  collection: string | null;
  tags: string[];
  caption: string;
  hashtags: string[];
  createdAt: string;
  posts: { id: string; status: string; caption: string; at: string | null }[];
};

const STATUS: Record<string, string> = { DRAFT: 'Borrador', SCHEDULED: 'Programado', PUBLISHING: 'Publicando', PUBLISHED: 'Publicado', FAILED: 'Falló' };
const split = (value: string) => value.split(/[\s,]+/).map((v) => v.trim()).filter(Boolean);
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

type Meta = { name: string; collection: string; tags: string; caption: string; hashtags: string };
const emptyMeta: Meta = { name: '', collection: '', tags: '', caption: '', hashtags: '' };
const toBody = (meta: Meta) => ({ name: meta.name.trim(), collection: meta.collection.trim() || null, tags: split(meta.tags), caption: meta.caption, hashtags: split(meta.hashtags) });

export function Thumb({ asset, large = false }: { asset: Pick<LibraryAsset, 'kind' | 'url' | 'name'>; large?: boolean }) {
  return asset.kind === 'VIDEO' ? (
    <video src={asset.url} muted playsInline preload="metadata" controls={large} className="h-full w-full object-cover" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- servido por nuestra ruta firmada, sin optimizador.
    <img src={asset.url} alt={asset.name} loading="lazy" className="h-full w-full object-cover" />
  );
}

/** P22 Content Library: subir una vez, etiquetar, filtrar y reutilizar en publicaciones y planners. */
export function ContentLibrary({ assets, canManage }: { assets: LibraryAsset[]; canManage: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<Meta>(emptyMeta);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState({ q: '', collection: '', kind: '', usage: '' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Meta | null>(null);

  const collections = [...new Set(assets.map((a) => a.collection).filter(Boolean))] as string[];
  const q = filter.q.toLowerCase();
  const visible = assets.filter(
    (a) =>
      (!q || a.name.toLowerCase().includes(q) || a.tags.some((t) => t.includes(q)) || a.caption.toLowerCase().includes(q)) &&
      (!filter.collection || a.collection === filter.collection) &&
      (!filter.kind || a.kind === filter.kind) &&
      (!filter.usage || (filter.usage === 'used' ? a.posts.length > 0 : a.posts.length === 0)),
  );
  const selected = assets.find((a) => a.id === selectedId) ?? null;

  async function json(url: string, method: string, body?: unknown) {
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { message?: string; data?: unknown } | null;
    if (!response?.ok) throw new Error(data?.message ?? 'No se pudo completar. Inténtalo de nuevo.');
    return data?.data;
  }

  async function upload() {
    if (!file) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const ticket = (await json('/api/content-assets/upload', 'POST', { fileName: file.name, type: file.type, size: file.size })) as { intent: string; uploadUrl: string; contentType: string };
      const put = await fetch(ticket.uploadUrl, { method: 'PUT', headers: { 'Content-Type': ticket.contentType }, body: file }).catch(() => null);
      if (!put?.ok) throw new Error('No se pudo subir el archivo. Revisa tu conexión e inténtalo de nuevo.');
      await json('/api/content-assets', 'POST', { intent: ticket.intent, ...toBody({ ...meta, name: meta.name || file.name.replace(/\.[^.]+$/, '') }) });
      setFile(null);
      setMeta(emptyMeta);
      if (fileRef.current) fileRef.current.value = '';
      setNotice('Subido. Ya puedes usarlo en cualquier publicación.');
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function act(run: () => Promise<unknown>, done: string) {
    setError('');
    setNotice('');
    try {
      await run();
      setNotice(done);
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const field = (key: keyof Meta, label: string, placeholder: string, state: Meta, set: (m: Meta) => void) => (
    <label className="block space-y-1 text-sm">
      <span className="font-semibold text-carbon">{label}</span>
      {key === 'caption' ? (
        <Textarea rows={3} maxLength={2200} value={state[key]} onChange={(e) => set({ ...state, [key]: e.target.value })} placeholder={placeholder} />
      ) : (
        <Input value={state[key]} onChange={(e) => set({ ...state, [key]: e.target.value })} placeholder={placeholder} list={key === 'collection' ? 'library-collections' : undefined} />
      )}
    </label>
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]" aria-busy={busy || pending}>
      <datalist id="library-collections">{collections.map((c) => <option key={c} value={c} />)}</datalist>
      {canManage && (
        <Card className="order-2 space-y-3 p-5 xl:order-none" data-library-upload>
          <Eyebrow>Subir pieza</Eyebrow>
          <p className="text-xs text-soft">Imágenes JPG (hasta 8 MB) y videos MP4 (hasta 100 MB): los formatos que publica Instagram.</p>
          <input ref={fileRef} type="file" accept="image/jpeg,video/mp4" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" aria-label="Archivo" />
          {field('name', 'Nombre', file?.name ?? 'Portada lanzamiento', meta, setMeta)}
          {field('collection', 'Colección', 'Lanzamiento 5MCD', meta, setMeta)}
          {field('tags', 'Etiquetas', 'portada creativo', meta, setMeta)}
          {field('caption', 'Texto sugerido', 'Se copia al usar la pieza en una publicación', meta, setMeta)}
          {field('hashtags', 'Hashtags sugeridos', '#devocional #fe', meta, setMeta)}
          <Button type="button" disabled={!file || busy} onClick={() => void upload()}>
            <Upload aria-hidden /> {busy ? 'Subiendo…' : 'Subir a la biblioteca'}
          </Button>
        </Card>
      )}

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="w-44" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="Buscar nombre o etiqueta" aria-label="Buscar" />
          <Select density="sm" wrapperClassName="w-auto" value={filter.collection} onChange={(e) => setFilter({ ...filter, collection: e.target.value })} aria-label="Colección">
            <option value="">Todas las colecciones</option>
            {collections.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select density="sm" wrapperClassName="w-auto" value={filter.kind} onChange={(e) => setFilter({ ...filter, kind: e.target.value })} aria-label="Tipo">
            <option value="">Imágenes y videos</option>
            <option value="IMAGE">Imágenes</option>
            <option value="VIDEO">Videos</option>
          </Select>
          <Select density="sm" wrapperClassName="w-auto" value={filter.usage} onChange={(e) => setFilter({ ...filter, usage: e.target.value })} aria-label="Uso">
            <option value="">Usadas y sin usar</option>
            <option value="used">Usadas</option>
            <option value="unused">Sin usar</option>
          </Select>
        </div>
        {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
        {notice && <p role="status" className="text-sm text-graphite" data-library-notice>{notice}</p>}

        {visible.length === 0 ? (
          <EmptyState icon={ImageIcon} title={assets.length ? 'Nada coincide con el filtro' : 'Tu biblioteca está vacía'} description="Sube imágenes y videos una vez y úsalos en todas tus publicaciones." />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((asset) => (
              <li key={asset.id} data-library-asset={asset.id}>
                <button type="button" onClick={() => { setSelectedId(asset.id); setEditing(null); }} className={cn('block w-full overflow-hidden rounded-xl border bg-paper text-left', selectedId === asset.id ? 'border-electric ring-2 ring-electric' : 'border-line hover:border-stone')}>
                  <span className="block aspect-square bg-ivory"><Thumb asset={asset} /></span>
                  <span className="block space-y-1 p-2">
                    <span className="block truncate text-sm font-semibold text-carbon">{asset.name}</span>
                    <span className="flex flex-wrap items-center gap-1">
                      <Badge variant={asset.posts.length ? 'success' : 'outline'}>{asset.posts.length ? `Usada en ${asset.posts.length}` : 'Sin usar'}</Badge>
                      {asset.kind === 'VIDEO' && <Badge variant="info">Video</Badge>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected && (
          <Card className="grid gap-4 p-4 sm:grid-cols-[200px_minmax(0,1fr)]" data-library-selected={selected.id}>
            <div className="aspect-square overflow-hidden rounded-xl bg-ivory"><Thumb asset={selected} large /></div>
            <div className="min-w-0 space-y-2 text-sm">
              {editing ? (
                <>
                  {field('name', 'Nombre', '', editing, setEditing)}
                  {field('collection', 'Colección', '', editing, setEditing)}
                  {field('tags', 'Etiquetas', '', editing, setEditing)}
                  {field('caption', 'Texto sugerido', '', editing, setEditing)}
                  {field('hashtags', 'Hashtags sugeridos', '', editing, setEditing)}
                  <div className="flex gap-2">
                    <Button type="button" size="sm" disabled={pending || !editing.name.trim()} onClick={() => void act(() => json(`/api/content-assets/${selected.id}`, 'PATCH', toBody(editing)), 'Cambios guardados.').then(() => setEditing(null))}>Guardar</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="font-semibold text-carbon">{selected.name}</p>
                  <p className="text-xs text-soft">{selected.kind === 'VIDEO' ? 'Video' : 'Imagen'} · {mb(selected.sizeBytes)}{selected.collection ? ` · ${selected.collection}` : ''}</p>
                  {selected.tags.length > 0 && <p className="text-xs text-graphite">Etiquetas: {selected.tags.join(', ')}</p>}
                  {selected.caption && <p className="line-clamp-3 whitespace-pre-line break-words text-graphite">{selected.caption}</p>}
                  {selected.hashtags.length > 0 && <p className="break-words text-xs text-electric">{selected.hashtags.map((t) => `#${t}`).join(' ')}</p>}
                  <div data-library-usage>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-soft">Publicaciones ({selected.posts.length})</p>
                    {selected.posts.length === 0 ? (
                      <p className="text-xs text-soft">Todavía no se usa.</p>
                    ) : (
                      <ul className="mt-1 space-y-0.5 text-xs text-graphite">
                        {selected.posts.slice(0, 8).map((post) => (
                          <li key={post.id} className="truncate">{STATUS[post.status] ?? post.status}{post.at ? ` · ${new Date(post.at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}` : ''} — {post.caption || '(sin texto)'}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" asChild><Link href={`/social?pieza=${selected.id}`}>Usar en una publicación</Link></Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditing({ name: selected.name, collection: selected.collection ?? '', tags: selected.tags.join(' '), caption: selected.caption, hashtags: selected.hashtags.map((t) => `#${t}`).join(' ') })}>Editar</Button>
                      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm('¿Borrar esta pieza de la biblioteca?')) void act(() => json(`/api/content-assets/${selected.id}`, 'DELETE'), 'Pieza borrada.').then(() => setSelectedId(null)); }}>Borrar</Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
