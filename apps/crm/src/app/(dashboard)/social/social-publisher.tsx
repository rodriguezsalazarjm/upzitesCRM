'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ExternalLink, Megaphone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { moveToDay } from '@/lib/social/calendar';
import { cn } from '@/lib/utils';
import { SocialCalendar } from './social-calendar';
import { SocialFeedGrid } from './social-feed-grid';

type Account = { id: string; name: string; ready: boolean; canPublish: boolean };
export type PostRow = {
  id: string;
  network: string;
  channelAccountId: string | null;
  accountName: string | null;
  caption: string;
  hashtags: string[];
  mediaUrl: string | null;
  mediaType: 'IMAGE' | 'REEL';
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED';
  scheduledAt: string | null;
  nextAttemptAt: string | null;
  publishedAt: string | null;
  permalink: string | null;
  attempts: number;
  lastError: string | null;
  history: { at: string; event: string; detail?: string }[];
  contentAssetId: string | null;
};
export type PickerAsset = { id: string; name: string; kind: 'IMAGE' | 'VIDEO'; url: string; caption: string; hashtags: string[] };

const STATUS: Record<PostRow['status'], { label: string; variant: 'outline' | 'warning' | 'info' | 'success' | 'danger' }> = {
  DRAFT: { label: 'Borrador', variant: 'outline' },
  SCHEDULED: { label: 'Programado', variant: 'warning' },
  PUBLISHING: { label: 'Publicando', variant: 'info' },
  PUBLISHED: { label: 'Publicado', variant: 'success' },
  FAILED: { label: 'Falló', variant: 'danger' },
};
const EVENT: Record<string, string> = {
  draft_saved: 'Borrador guardado',
  scheduled: 'Programado',
  publish_requested: 'Publicar ahora',
  published: 'Publicado',
  failed: 'Intento fallido',
  retry_requested: 'Reintento manual',
  unscheduled: 'Programación cancelada',
  rescheduled: 'Fecha cambiada',
  duplicated: 'Duplicado',
  feed_plan: 'Fecha ajustada por el plan del feed',
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : '');
/** datetime-local trabaja en la hora del navegador, sin zona. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

type Draft = { id?: string; channelAccountId: string; caption: string; hashtags: string; mediaUrl: string; mediaType: 'IMAGE' | 'REEL'; scheduledAt: string; contentAssetId: string };

export function SocialPublisher({ canManage, accounts, posts, assets, initialAssetId }: { canManage: boolean; accounts: Account[]; posts: PostRow[]; assets: PickerAsset[]; initialAssetId?: string }) {
  const router = useRouter();
  const empty: Draft = { channelAccountId: accounts[0]?.id ?? '', caption: '', hashtags: '', mediaUrl: '', mediaType: 'IMAGE', scheduledAt: '', contentAssetId: '' };
  // P22: "Usar en una publicación" desde la Biblioteca llega con ?pieza=.
  const [draft, setDraft] = useState<Draft>(() => {
    const asset = assets.find((a) => a.id === initialAssetId);
    return asset ? { ...empty, contentAssetId: asset.id, caption: asset.caption, hashtags: asset.hashtags.map((t) => '#' + t).join(' ') } : empty;
  });
  const pickedAsset = assets.find((a) => a.id === draft.contentAssetId);
  const pickAsset = (id: string) => {
    const asset = assets.find((a) => a.id === id);
    // El texto sugerido de la pieza solo completa lo que esté vacío.
    setDraft({ ...draft, contentAssetId: id, caption: draft.caption || asset?.caption || '', hashtags: draft.hashtags || (asset?.hashtags.map((t) => '#' + t).join(' ') ?? '') });
  };
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  // P20: vistas y filtros del calendario editorial.
  const [view, setView] = useState<'month' | 'week' | 'list' | 'feed'>('month');
  const [network, setNetwork] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const feedAccount = accountFilter || accounts[0]?.id;
  const feedPosts = posts.filter((p) => p.channelAccountId === feedAccount);
  // Al refrescar con fechas nuevas, la grilla vuelve a partir de la programación real.
  const feedKey = feedPosts.map((p) => p.id + p.status + (p.scheduledAt ?? '')).join('|');
  const latest = Math.max(Date.now(), ...feedPosts.map((p) => (p.scheduledAt ? new Date(p.scheduledAt).getTime() : 0)));
  const nextFreeDay = new Date(latest + 86_400_000);
  const visible = posts.filter((p) => (!network || p.network === network) && (!accountFilter || p.channelAccountId === accountFilter));
  const [pending, startTransition] = useTransition();
  const account = accounts.find((a) => a.id === draft.channelAccountId);

  async function call(url: string, method: string, body?: unknown) {
    setError('');
    setNotice('');
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    const json = (await response?.json().catch(() => null)) as { message?: string; data?: PostRow } | null;
    if (!response?.ok) {
      setError(json?.message ?? 'No se pudo guardar. Inténtalo de nuevo.');
      return null;
    }
    startTransition(() => router.refresh());
    return json?.data ?? null;
  }

  async function submit(action: 'draft' | 'schedule' | 'publish_now') {
    const result = await call(draft.id ? `/api/social-posts/${draft.id}` : '/api/social-posts', draft.id ? 'PATCH' : 'POST', {
      channelAccountId: draft.channelAccountId,
      caption: draft.caption,
      hashtags: draft.hashtags.split(/[\s,]+/).filter(Boolean),
      mediaUrl: draft.contentAssetId ? '' : draft.mediaUrl.trim(),
      contentAssetId: draft.contentAssetId || undefined,
      mediaType: draft.mediaType,
      action,
      scheduledAt: draft.scheduledAt ? new Date(draft.scheduledAt).toISOString() : undefined,
    });
    if (!result) return;
    setDraft(empty);
    setNotice(
      result.status === 'PUBLISHED' ? 'Publicado en Instagram.' : result.status === 'FAILED' ? `No se publicó: ${result.lastError}` : result.status === 'SCHEDULED' && action === 'publish_now' ? `No se publicó todavía: ${result.lastError ?? 'se reintenta solo'}` : action === 'schedule' ? 'Programado.' : 'Borrador guardado.',
    );
  }

  const remove = (post: PostRow) => {
    if (confirm(post.status === 'PUBLISHED' ? 'Se borra solo de Upzites; en Instagram sigue publicado.' : '¿Borrar esta publicación?')) void call(`/api/social-posts/${post.id}`, 'DELETE');
  };
  const focusComposer = () => document.querySelector('[data-social-composer]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const planDay = (day: Date) => {
    setDraft({ ...empty, scheduledAt: toLocalInput(moveToDay(null, day).toISOString()) });
    focusComposer();
  };
  async function calendarAction(post: PostRow, body: Record<string, string>) {
    const result = await call(`/api/social-posts/${post.id}`, 'POST', body);
    if (result && body.action === 'duplicate') setNotice('Duplicado como borrador en la misma fecha.');
    if (result && body.action === 'reschedule') setNotice('Fecha actualizada.');
    if (result && body.action === 'publish_now') setNotice(result.status === 'PUBLISHED' ? 'Publicado en Instagram.' : `No se publicó: ${result.lastError ?? 'se reintenta solo'}`);
    return result;
  }

  const edit = (post: PostRow) => {
    focusComposer();
    setDraft({ id: post.id, channelAccountId: post.channelAccountId ?? accounts[0]?.id ?? '', caption: post.caption, hashtags: post.hashtags.map((t) => `#${t}`).join(' '), mediaUrl: post.contentAssetId ? '' : post.mediaUrl ?? '', mediaType: post.mediaType, scheduledAt: toLocalInput(post.scheduledAt), contentAssetId: post.contentAssetId ?? '' });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]" aria-busy={pending}>
      {canManage && (
        <Card className="order-2 space-y-4 p-5 xl:order-none" data-social-composer>
          <div>
            <Eyebrow>{draft.id ? 'Editar publicación' : 'Nueva publicación'}</Eyebrow>
            <p className="mt-1 text-xs text-soft">Instagram ahora. TikTok se habilita cuando su conexión esté disponible.</p>
          </div>
          {accounts.length === 0 ? (
            <p className="rounded-xl bg-ivory p-4 text-sm text-graphite">
              Conecta una cuenta de Instagram para publicar.{' '}
              <Link href="/integraciones" className="font-semibold text-electric hover:underline">Ir a Integraciones</Link>
            </p>
          ) : (
            <>
              <label className="block space-y-1 text-sm">
                <span className="font-semibold text-carbon">Red y cuenta</span>
                <Select value={draft.channelAccountId} onChange={(e) => setDraft({ ...draft, channelAccountId: e.target.value })}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>Instagram · {a.name}</option>
                  ))}
                  <option disabled>TikTok · próximamente</option>
                </Select>
              </label>
              {account && (!account.ready || !account.canPublish) && (
                <p className="rounded-lg bg-solar/20 p-3 text-xs text-warning-ink" data-account-warning>
                  {!account.ready ? 'Esta cuenta no está conectada o la limita tu plan: puedes guardar borradores, no publicar.' : 'Reconecta Instagram y acepta el permiso de publicar contenido.'}
                </p>
              )}
              <label className="block space-y-1 text-sm">
                <span className="font-semibold text-carbon">Texto</span>
                <Textarea rows={5} maxLength={2200} value={draft.caption} onChange={(e) => setDraft({ ...draft, caption: e.target.value })} placeholder="Escribe el texto de la publicación" />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-semibold text-carbon">Hashtags</span>
                <Input value={draft.hashtags} onChange={(e) => setDraft({ ...draft, hashtags: e.target.value })} placeholder="#oracion #devocional" />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="flex items-center justify-between font-semibold text-carbon">
                  Imagen o video de la biblioteca
                  <Link href="/social/biblioteca" className="text-xs font-semibold text-electric hover:underline">Abrir biblioteca</Link>
                </span>
                <Select value={draft.contentAssetId} onChange={(e) => pickAsset(e.target.value)} data-asset-picker>
                  <option value="">Ninguna (pegar una URL)</option>
                  {assets.map((a) => <option key={a.id} value={a.id}>{a.kind === 'VIDEO' ? 'Video' : 'Imagen'} · {a.name}</option>)}
                </Select>
              </label>
              {pickedAsset ? (
                <div className="h-28 w-28 overflow-hidden rounded-lg bg-ivory" data-picked-asset={pickedAsset.id}>
                  {pickedAsset.kind === 'VIDEO' ? (
                    <video src={pickedAsset.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- ruta firmada propia.
                    <img src={pickedAsset.url} alt={pickedAsset.name} className="h-full w-full object-cover" />
                  )}
                </div>
              ) : (
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className="block space-y-1 text-sm">
                  <span className="font-semibold text-carbon">URL pública de la imagen o video</span>
                  <Input type="url" value={draft.mediaUrl} onChange={(e) => setDraft({ ...draft, mediaUrl: e.target.value })} placeholder="https://…" />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="font-semibold text-carbon">Tipo</span>
                  <Select value={draft.mediaType} onChange={(e) => setDraft({ ...draft, mediaType: e.target.value as Draft['mediaType'] })}>
                    <option value="IMAGE">Imagen</option>
                    <option value="REEL">Reel</option>
                  </Select>
                </label>
              </div>
              )}
              <label className="block space-y-1 text-sm">
                <span className="font-semibold text-carbon">Fecha y hora (para programar)</span>
                <Input type="datetime-local" value={draft.scheduledAt} onChange={(e) => setDraft({ ...draft, scheduledAt: e.target.value })} />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={pending} onClick={() => void submit('publish_now')}>Publicar ahora</Button>
                <Button type="button" variant="outline" disabled={pending || !draft.scheduledAt} onClick={() => void submit('schedule')}>Programar</Button>
                <Button type="button" variant="ghost" disabled={pending} onClick={() => void submit('draft')}>Guardar borrador</Button>
                {draft.id && <Button type="button" variant="ghost" onClick={() => setDraft(empty)}>Cancelar edición</Button>}
              </div>
            </>
          )}
          {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
          {notice && <p role="status" className="text-sm text-graphite" data-social-notice>{notice}</p>}
        </Card>
      )}

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-line p-0.5" role="tablist" aria-label="Vista">
            {([['month', 'Mes'], ['week', 'Semana'], ['list', 'Lista'], ['feed', 'Feed']] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)} className={cn('rounded-md px-3 py-1 text-sm', view === id ? 'bg-carbon text-canvas' : 'text-graphite hover:bg-ivory')}>
                {label}
              </button>
            ))}
          </div>
          <Select density="sm" wrapperClassName="w-auto" value={network} onChange={(e) => setNetwork(e.target.value)} aria-label="Filtrar por red">
            <option value="">Todas las redes</option>
            <option value="INSTAGRAM">Instagram</option>
            <option value="TIKTOK" disabled>TikTok · próximamente</option>
          </Select>
          {accounts.length > 1 && (
            <Select density="sm" wrapperClassName="w-auto" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} aria-label="Filtrar por cuenta">
              <option value="">Todas las cuentas</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          )}
        </div>
        {!canManage && error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
        {canManage && (error || notice) && view !== 'list' && <p role={error ? 'alert' : 'status'} className={cn('text-sm', error ? 'text-danger-ink' : 'text-graphite')} data-calendar-notice>{error || notice}</p>}
        {view === 'feed' ? (
          // El feed es de UNA cuenta: la del filtro o la primera.
          <SocialFeedGrid
            key={feedKey}
            posts={feedPosts}
            canManage={canManage}
            pending={pending}
            onEdit={edit}
            onPlanNew={() => planDay(nextFreeDay)}
            onSave={async (order) => { if (await call('/api/social-posts/plan', 'POST', { order })) setNotice('Plan guardado: las fechas siguen el orden de la grilla.'); }}
          />
        ) : view !== 'list' ? (
          <SocialCalendar mode={view} posts={visible} canManage={canManage} pending={pending} onEdit={edit} onPlanDay={planDay} onAction={calendarAction} onDelete={remove} />
        ) : visible.length === 0 ? (
          <EmptyState icon={Megaphone} title="Todavía no hay publicaciones" description="Lo que guardes, programes o publiques aparece aquí con su estado." />
        ) : (
          visible.map((post) => (
            <Card key={post.id} className="space-y-2 p-4" data-social-post={post.id} data-status={post.status}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS[post.status].variant}>{STATUS[post.status].label}</Badge>
                <span className="text-xs text-soft">
                  Instagram{post.accountName ? ` · ${post.accountName}` : ''} · {post.mediaType === 'REEL' ? 'Reel' : 'Imagen'}
                </span>
                <span className="ml-auto text-xs text-soft">
                  {post.status === 'PUBLISHED' ? `Publicado ${when(post.publishedAt)}` : post.status === 'SCHEDULED' ? `Para ${when(post.nextAttemptAt ?? post.scheduledAt)}` : ''}
                </span>
              </div>
              <p className="line-clamp-3 whitespace-pre-line break-words text-sm text-carbon">{post.caption || <span className="text-soft">(sin texto)</span>}</p>
              {post.hashtags.length > 0 && <p className="break-words text-xs text-electric">{post.hashtags.map((t) => `#${t}`).join(' ')}</p>}
              {post.lastError && post.status !== 'PUBLISHED' && (
                <p className="rounded-lg bg-tomato/10 p-2 text-xs text-danger-ink" data-social-error>
                  {post.lastError}
                  {post.status === 'SCHEDULED' && ` · Reintento ${post.attempts + 1} de 3`}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {post.permalink && (
                  <a href={post.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-electric hover:underline">
                    Ver en Instagram <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                )}
                {canManage && ['DRAFT', 'SCHEDULED', 'FAILED'].includes(post.status) && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => edit(post)}>Editar</Button>
                )}
                {canManage && post.status === 'FAILED' && (
                  <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void call(`/api/social-posts/${post.id}`, 'POST', { action: 'retry' })}>Reintentar</Button>
                )}
                {canManage && post.status === 'SCHEDULED' && (
                  <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => void call(`/api/social-posts/${post.id}`, 'POST', { action: 'unschedule' })}>Cancelar programación</Button>
                )}
                {canManage && post.status !== 'PUBLISHING' && (
                  <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => remove(post)}>Borrar</Button>
                )}
                <button type="button" className="ml-auto text-xs text-soft hover:text-carbon" onClick={() => setOpenHistory(openHistory === post.id ? null : post.id)} aria-expanded={openHistory === post.id}>
                  {openHistory === post.id ? 'Ocultar historial' : `Historial (${post.history.length})`}
                </button>
              </div>
              {openHistory === post.id && (
                <ol className="space-y-1 border-t border-line pt-2 text-xs text-graphite" data-social-history>
                  {post.history.map((entry, index) => (
                    <li key={index} className="break-words">
                      <span className="text-soft">{when(entry.at)}</span> · {EVENT[entry.event] ?? entry.event}
                      {entry.detail && entry.event !== 'scheduled' ? ` — ${entry.detail}` : ''}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
