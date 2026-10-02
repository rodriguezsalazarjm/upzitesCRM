'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  FileArchive,
  FileAudio,
  FileText,
  FileVideo,
  Link2,
  Loader2,
  PackageOpen,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { SettingsCard } from '@/components/ui/settings-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Switch } from '@/components/ui/switch';
import { DELIVERABLE_ACCEPT, DELIVERABLE_MAX_BYTES, FORMAT_LABEL, type DeliverableFormat } from '@/lib/commerce/digital-assets/constants';

export type ManagedAsset = {
  id: string;
  name: string;
  source: 'FILE' | 'LINK' | 'CODE';
  format: DeliverableFormat | null;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  isActive: boolean;
  position: number;
  updatedAt: string;
};

type Message = { kind: 'error' | 'success'; text: string } | null;

function formatBytes(bytes: number | null) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

function AssetIcon({ format }: { format: DeliverableFormat | null }) {
  const Icon = format === 'PDF' ? FileText : format === 'AUDIO' ? FileAudio : format === 'ZIP' ? FileArchive : format === 'VIDEO' ? FileVideo : Link2;
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ivory text-carbon">
      <Icon className="h-5 w-5" aria-hidden />
    </span>
  );
}

async function send(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as { message?: string; data?: unknown };
  return { ok: response.ok, status: response.status, body };
}

const json = (method: string, payload: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

/** Sube con XMLHttpRequest para poder mostrar el progreso real. */
function putWithProgress(url: string, file: File, contentType: string, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.setRequestHeader('Content-Type', contentType);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => (request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(`HTTP ${request.status}`)));
    request.onerror = () => reject(new Error('network'));
    request.send(file);
  });
}

function nameFromFile(file: File) {
  return file.name.replace(/\.[^.]{1,5}$/, '').replace(/[_]+/g, ' ').trim().slice(0, 120) || 'Archivo';
}

// --- Subida -------------------------------------------------------------------

type UploadPhase = 'idle' | 'uploading' | 'processing';

function UploadForm({ productId, replace, onDone, onCancel }: { productId: string; replace?: ManagedAsset; onDone: (text: string) => void; onCancel?: () => void }) {
  const ids = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState(replace?.name ?? '');
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const busy = phase !== 'idle';

  function choose(next: File | undefined) {
    setError(null);
    if (!next) return;
    if (next.size > DELIVERABLE_MAX_BYTES) {
      setError('El archivo supera 50 MB. Para videos pesados agrega un enlace (Vimeo, YouTube no listado, Drive).');
      return;
    }
    setFile(next);
    if (!replace && !name.trim()) setName(nameFromFile(next));
  }

  async function upload() {
    if (!file) return setError('Elige un archivo.');
    if (!name.trim()) return setError('Escribe el nombre que verá el comprador.');
    setError(null);
    setPhase('uploading');
    setProgress(0);
    try {
      const base = `/api/products/${encodeURIComponent(productId)}/assets`;
      const ticket = await send(`${base}/upload`, json('POST', { fileName: file.name, size: file.size, type: file.type }));
      if (!ticket.ok) {
        setError(ticket.body.message ?? 'No pudimos preparar la subida.');
        return;
      }
      const { uploadUrl, intent, contentType } = ticket.body.data as { uploadUrl: string; intent: string; contentType: string };
      try {
        await putWithProgress(uploadUrl, file, contentType, setProgress);
      } catch {
        setError('Falló la subida al almacenamiento. Revisa tu conexión e inténtalo de nuevo.');
        return;
      }
      setPhase('processing');
      const created = await send(base, json('POST', { source: 'upload', intent, name: name.trim(), ...(replace ? { replaceAssetId: replace.id } : {}) }));
      if (!created.ok) {
        setError(created.body.message ?? 'No pudimos guardar el archivo.');
        return;
      }
      setFile(null);
      setName('');
      if (input.current) input.current.value = '';
      onDone(replace ? `Archivo reemplazado: “${name.trim()}”. Las compras anteriores conservan el archivo original.` : `Archivo agregado: “${name.trim()}”.`);
    } catch {
      setError('No pudimos conectar con el servidor.');
    } finally {
      setPhase('idle');
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!busy) choose(event.dataTransfer.files?.[0]);
        }}
        className={`rounded-xl border border-dashed p-5 text-center transition-colors ${dragging ? 'border-electric bg-electric/5' : 'border-mist bg-ivory/60'}`}
      >
        <input
          ref={input}
          id={`${ids}-file`}
          type="file"
          accept={DELIVERABLE_ACCEPT}
          className="sr-only"
          disabled={busy}
          aria-describedby={`${ids}-file-help`}
          onChange={(event) => choose(event.target.files?.[0])}
        />
        <Upload className="mx-auto h-6 w-6 text-ash" strokeWidth={1.5} aria-hidden />
        <p className="mt-2 text-sm text-carbon">
          {file ? (
            <>
              <span className="font-semibold">{file.name}</span> · {formatBytes(file.size)}
            </>
          ) : (
            'Arrastra un archivo aquí o'
          )}
        </p>
        <label
          htmlFor={`${ids}-file`}
          className="mt-3 inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-mist bg-paper px-3 text-[13px] font-semibold text-carbon hover:border-carbon focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-electric"
        >
          {file ? 'Elegir otro archivo' : 'Elegir archivo'}
          <span className="sr-only"> para {replace ? `reemplazar ${replace.name}` : 'la entrega'}</span>
        </label>
        <p id={`${ids}-file-help`} className="mt-2 text-xs text-soft">
          PDF, audio (MP3, M4A, WAV, OGG, AAC), ZIP o video MP4. Hasta 50 MB. Se verifica el contenido real del archivo.
        </p>
      </div>

      <FormField label="Nombre que verá el comprador" htmlFor={`${ids}-name`}>
        <Input value={name} maxLength={120} disabled={busy} onChange={(event) => setName(event.target.value)} placeholder="Ej.: Guía principal" />
      </FormField>

      {phase === 'uploading' && (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-ivory" role="progressbar" aria-label="Progreso de la subida" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <div className="h-full bg-electric transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-soft">Subiendo… {progress}%</p>
        </div>
      )}
      {phase === 'processing' && (
        <p className="flex items-center gap-2 text-xs text-soft" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Verificando el archivo…
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium text-danger-ink">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={upload} disabled={busy || !file}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
          {replace ? 'Reemplazar archivo' : 'Subir archivo'}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}

// --- Enlace -------------------------------------------------------------------

function LinkForm({ productId, asset, onDone, onCancel }: { productId: string; asset?: ManagedAsset; onDone: (text: string) => void; onCancel?: () => void }) {
  const ids = useId();
  const [name, setName] = useState(asset?.name ?? '');
  const [url, setUrl] = useState(asset?.url ?? '');
  const [format, setFormat] = useState<'LINK' | 'VIDEO'>(asset?.format === 'VIDEO' ? 'VIDEO' : 'LINK');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; text: string } | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const base = `/api/products/${encodeURIComponent(productId)}/assets`;
      const result = asset
        ? await send(`${base}/${encodeURIComponent(asset.id)}`, json('PATCH', { action: 'update', name: name.trim(), url: url.trim(), format }))
        : await send(base, json('POST', { source: 'link', name: name.trim(), url: url.trim(), format }));
      if (!result.ok) {
        const body = result.body as { message?: string; field?: string };
        setError({ field: body.field, text: body.message ?? 'No pudimos guardar el enlace.' });
        return;
      }
      if (!asset) {
        setName('');
        setUrl('');
        setFormat('LINK');
      }
      onDone(asset ? 'Enlace actualizado.' : `Enlace agregado: “${name.trim()}”.`);
    } catch {
      setError({ text: 'No pudimos conectar con el servidor.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <FormField label="Nombre que verá el comprador" htmlFor={`${ids}-name`} error={error?.field === 'name' ? error.text : null}>
        <Input value={name} maxLength={120} disabled={busy} onChange={(event) => setName(event.target.value)} placeholder="Ej.: Comunidad privada" />
      </FormField>
      <FormField label="URL" htmlFor={`${ids}-url`} description="Solo enlaces https://. No se descarga ni se visita desde Upzites." error={error?.field === 'url' ? error.text : null}>
        <Input value={url} type="url" inputMode="url" maxLength={2048} disabled={busy} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
      </FormField>
      <fieldset>
        <legend className="text-sm font-semibold text-carbon">Mostrar como</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {(['LINK', 'VIDEO'] as const).map((option) => (
            <label key={option} className="inline-flex items-center gap-2 text-sm text-carbon">
              <input type="radio" name={`${ids}-format`} value={option} checked={format === option} disabled={busy} onChange={() => setFormat(option)} className="h-4 w-4 accent-electric" />
              {option === 'LINK' ? 'Enlace' : 'Video'}
            </label>
          ))}
        </div>
      </fieldset>
      {error && error.field !== 'name' && error.field !== 'url' && (
        <p role="alert" className="text-xs font-medium text-danger-ink">
          {error.text}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Link2 aria-hidden />}
          {asset ? 'Guardar enlace' : 'Agregar enlace'}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}

// --- Dialogos -----------------------------------------------------------------

function Modal({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-carbon/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-paper p-6 text-carbon focus:outline-none">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="min-w-0 break-words text-base font-bold [overflow-wrap:anywhere]">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="icon" className="-mr-2 -mt-2 h-8 w-8" aria-label="Cerrar">
                <X aria-hidden />
              </Button>
            </Dialog.Close>
          </div>
          {description ? <Dialog.Description className="mt-1 text-sm text-soft">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
          <div className="mt-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Preview({ productId, asset }: { productId: string; asset: ManagedAsset }) {
  const src = `/api/products/${encodeURIComponent(productId)}/assets/${encodeURIComponent(asset.id)}/preview`;
  if (asset.source === 'LINK') {
    return (
      <div className="space-y-3">
        <p className="break-all rounded-lg bg-ivory p-3 text-sm text-graphite">{asset.url}</p>
        <a href={src} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg bg-electric px-4 text-sm font-semibold text-white hover:bg-electric-strong">
          <Link2 className="h-4 w-4" aria-hidden />
          Abrir enlace
          <span className="sr-only"> (se abre en otra pestaña)</span>
        </a>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {asset.mimeType?.startsWith('audio/') ? (
        <audio controls preload="metadata" src={src} className="w-full" aria-label={`Escuchar ${asset.name}`} />
      ) : asset.mimeType?.startsWith('video/') ? (
        <video controls preload="metadata" src={src} className="w-full rounded-lg bg-black" aria-label={`Ver ${asset.name}`} />
      ) : null}
      <p className="text-xs text-soft">
        {[asset.format ? FORMAT_LABEL[asset.format] : null, formatBytes(asset.sizeBytes)].filter(Boolean).join(' · ')}. Vista privada del equipo: no usa el enlace del comprador ni cuenta como entrega.
      </p>
      <a href={src} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-mist bg-paper px-4 text-sm font-semibold text-carbon hover:border-carbon">
        <Eye className="h-4 w-4" aria-hidden />
        Abrir archivo
        <span className="sr-only"> (se abre en otra pestaña)</span>
      </a>
    </div>
  );
}

// --- Gestor -------------------------------------------------------------------

type Dialogs =
  | { kind: 'preview'; asset: ManagedAsset }
  | { kind: 'edit'; asset: ManagedAsset }
  | { kind: 'replace'; asset: ManagedAsset }
  | { kind: 'remove'; asset: ManagedAsset }
  | null;

export function DeliveryAssetsManager({
  productId,
  productType,
  assets,
  editable,
  readOnlyReason,
  storageProblem,
}: {
  productId: string;
  productType: 'DIGITAL' | 'PHYSICAL' | 'SERVICE';
  assets: ManagedAsset[];
  editable: boolean;
  readOnlyReason: string | null;
  storageProblem: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'upload' | 'link'>(storageProblem ? 'link' : 'upload');
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const activeCount = assets.filter((asset) => asset.isActive).length;
  const canEdit = editable && !readOnlyReason;

  function done(text: string) {
    setMessage({ kind: 'success', text });
    setDialog(null);
    router.refresh();
  }

  async function patch(asset: ManagedAsset, payload: Record<string, unknown>, success: string) {
    setPending(asset.id);
    setMessage(null);
    try {
      const result = await send(`/api/products/${encodeURIComponent(productId)}/assets/${encodeURIComponent(asset.id)}`, json('PATCH', payload));
      if (!result.ok) return setMessage({ kind: 'error', text: result.body.message ?? 'No pudimos guardar el cambio.' });
      done(success);
    } catch {
      setMessage({ kind: 'error', text: 'No pudimos conectar con el servidor.' });
    } finally {
      setPending(null);
    }
  }

  async function remove(asset: ManagedAsset) {
    setPending(asset.id);
    setMessage(null);
    try {
      const result = await send(`/api/products/${encodeURIComponent(productId)}/assets/${encodeURIComponent(asset.id)}`, { method: 'DELETE' });
      if (!result.ok) return setMessage({ kind: 'error', text: result.body.message ?? 'No pudimos quitarlo.' });
      const archived = (result.body.data as { archived?: boolean } | undefined)?.archived;
      done(archived ? `“${asset.name}” ya no se entregará. Las compras anteriores lo conservan.` : `“${asset.name}” se eliminó de la entrega.`);
    } catch {
      setMessage({ kind: 'error', text: 'No pudimos conectar con el servidor.' });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      {readOnlyReason && <p className="rounded-lg bg-ivory px-3 py-2 text-sm text-graphite">{readOnlyReason}</p>}
      {!editable && !readOnlyReason && <p className="rounded-lg bg-ivory px-3 py-2 text-sm text-graphite">Solo el propietario o un administrador pueden modificar la entrega digital.</p>}
      {productType === 'DIGITAL' && activeCount === 0 && (
        <p role="status" className="rounded-lg bg-solar/30 px-3 py-2 text-sm text-warning-ink">
          Este producto digital no tiene contenido activo: si alguien lo compra no recibirá nada y te avisaremos para enviarlo a mano.
        </p>
      )}
      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-sm ${message.kind === 'error' ? 'bg-tomato/12 text-danger-ink' : 'bg-lime/25 text-success-ink'}`}>
          {message.text}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <SettingsCard
          title="Contenido que recibe el comprador"
          description={`${assets.length === 0 ? 'Sin contenido todavía.' : `${activeCount} activo${activeCount === 1 ? '' : 's'} de ${assets.length}.`} Se entrega en este orden, en un solo enlace seguro, apenas se aprueba el pago.`}
        >
          {assets.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ivory text-ash">
                <PackageOpen className="h-5 w-5" strokeWidth={1.5} aria-hidden />
              </span>
              <p className="text-base font-bold text-carbon">Aún no hay contenido para entregar</p>
              <p className="max-w-sm text-sm text-ash">Sube un PDF, audio, ZIP o video, o agrega un enlace (curso, comunidad, video).</p>
            </div>
          ) : (
            <ol className="divide-y divide-line" aria-label="Contenido de la entrega, en orden">
              {assets.map((asset, index) => {
                const busy = pending === asset.id;
                const meta = [asset.format ? FORMAT_LABEL[asset.format] : 'Contenido', asset.source === 'FILE' ? 'Archivo' : asset.source === 'LINK' ? 'Enlace' : 'Código', formatBytes(asset.sizeBytes)]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li key={asset.id} className="py-4 first:pt-0 last:pb-0" aria-busy={busy}>
                    <div className="flex items-start gap-3">
                      <AssetIcon format={asset.format} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="tabular text-xs font-semibold text-soft" aria-hidden>
                            {index + 1}.
                          </span>
                          <p className="min-w-0 break-words text-sm font-semibold text-carbon [overflow-wrap:anywhere]">
                            <span className="sr-only">Posición {index + 1}: </span>
                            {asset.name}
                          </p>
                          <StatusBadge tone={asset.isActive ? 'success' : 'neutral'}>{asset.isActive ? 'Activo' : 'Inactivo'}</StatusBadge>
                        </div>
                        <p className="mt-0.5 text-xs text-soft">
                          {meta} · Modificado el {new Date(asset.updatedAt).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                        {asset.source === 'LINK' && asset.url && <p className="mt-0.5 truncate text-xs text-ash">{asset.url}</p>}

                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          <Button type="button" variant="outline" size="sm" onClick={() => setDialog({ kind: 'preview', asset })} disabled={!editable}>
                            <Eye aria-hidden />
                            Vista previa<span className="sr-only"> de {asset.name}</span>
                          </Button>
                          {canEdit && (
                            <>
                              <Button type="button" variant="ghost" size="sm" onClick={() => setDialog({ kind: 'edit', asset })} disabled={busy}>
                                <Pencil aria-hidden />
                                Editar<span className="sr-only"> {asset.name}</span>
                              </Button>
                              {asset.source === 'FILE' && (
                                <Button type="button" variant="ghost" size="sm" onClick={() => setDialog({ kind: 'replace', asset })} disabled={busy}>
                                  <RefreshCw aria-hidden />
                                  Reemplazar<span className="sr-only"> {asset.name}</span>
                                </Button>
                              )}
                              <span className="inline-flex items-center gap-0.5">
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Subir ${asset.name}`} disabled={busy || index === 0} onClick={() => patch(asset, { action: 'move', direction: 'up' }, `“${asset.name}” subió en el orden.`)}>
                                  <ArrowUp aria-hidden />
                                </Button>
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Bajar ${asset.name}`} disabled={busy || index === assets.length - 1} onClick={() => patch(asset, { action: 'move', direction: 'down' }, `“${asset.name}” bajó en el orden.`)}>
                                  <ArrowDown aria-hidden />
                                </Button>
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-danger-ink" aria-label={`Eliminar ${asset.name}`} disabled={busy} onClick={() => setDialog({ kind: 'remove', asset })}>
                                  <Trash2 aria-hidden />
                                </Button>
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      {canEdit && (
                        <div className="flex shrink-0 items-center gap-2 pt-1">
                          {busy && <Loader2 className="h-4 w-4 animate-spin text-ash" aria-hidden />}
                          <Switch
                            checked={asset.isActive}
                            disabled={busy}
                            aria-label={`${asset.isActive ? 'Desactivar' : 'Activar'} ${asset.name}`}
                            onCheckedChange={(next) => patch(asset, { action: next ? 'activate' : 'deactivate' }, next ? `“${asset.name}” se incluirá en las próximas entregas.` : `“${asset.name}” no se incluirá en las próximas entregas.`)}
                          />
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </SettingsCard>

        {canEdit && (
          <SettingsCard title="Agregar contenido" description="Archivos privados o enlaces externos. Nada queda público.">
            <div role="tablist" aria-label="Tipo de contenido" className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-ivory p-1">
              {(['upload', 'link'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={mode === option}
                  aria-controls={`agregar-${option}`}
                  id={`tab-${option}`}
                  onClick={() => setMode(option)}
                  className={`h-9 rounded-md text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric ${mode === option ? 'bg-paper text-carbon shadow-[0_1px_2px_rgba(17,17,17,0.08)]' : 'text-graphite hover:text-carbon'}`}
                >
                  {option === 'upload' ? 'Subir archivo' : 'Agregar enlace'}
                </button>
              ))}
            </div>
            <div role="tabpanel" id={`agregar-${mode}`} aria-labelledby={`tab-${mode}`}>
              {mode === 'upload' ? (
                storageProblem ? (
                  <p className="rounded-lg bg-solar/30 px-3 py-2 text-sm text-warning-ink">{storageProblem}</p>
                ) : (
                  <UploadForm productId={productId} onDone={done} />
                )
              ) : (
                <LinkForm productId={productId} onDone={done} />
              )}
            </div>
          </SettingsCard>
        )}
      </div>

      {dialog?.kind === 'preview' && (
        <Modal open onOpenChange={(open) => !open && setDialog(null)} title={dialog.asset.name} description="Vista previa">
          <Preview productId={productId} asset={dialog.asset} />
        </Modal>
      )}
      {dialog?.kind === 'edit' && (
        <Modal open onOpenChange={(open) => !open && setDialog(null)} title={`Editar “${dialog.asset.name}”`}>
          {dialog.asset.source === 'LINK' ? (
            <LinkForm productId={productId} asset={dialog.asset} onDone={done} onCancel={() => setDialog(null)} />
          ) : (
            <RenameForm asset={dialog.asset} onSave={(name) => patch(dialog.asset, { action: 'update', name }, 'Nombre actualizado.')} busy={pending === dialog.asset.id} onCancel={() => setDialog(null)} />
          )}
        </Modal>
      )}
      {dialog?.kind === 'replace' && (
        <Modal open onOpenChange={(open) => !open && setDialog(null)} title={`Reemplazar “${dialog.asset.name}”`} description="Se sube un archivo nuevo. Las compras anteriores conservan el archivo que recibieron.">
          {storageProblem ? <p className="text-sm text-warning-ink">{storageProblem}</p> : <UploadForm productId={productId} replace={dialog.asset} onDone={done} onCancel={() => setDialog(null)} />}
        </Modal>
      )}
      <ConfirmDialog
        open={dialog?.kind === 'remove'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={dialog?.kind === 'remove' ? `¿Quitar “${dialog.asset.name}” de la entrega?` : ''}
        description="No se incluirá en las próximas compras. Si ya se entregó, quienes lo compraron lo conservan en su enlace."
        confirmLabel="Quitar de la entrega"
        destructive
        busy={dialog?.kind === 'remove' && pending === dialog.asset.id}
        onConfirm={() => dialog?.kind === 'remove' && remove(dialog.asset)}
      />
    </div>
  );
}

function RenameForm({ asset, onSave, busy, onCancel }: { asset: ManagedAsset; onSave: (name: string) => void; busy: boolean; onCancel: () => void }) {
  const ids = useId();
  const [name, setName] = useState(asset.name);
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) onSave(name.trim());
      }}
    >
      <FormField label="Nombre que verá el comprador" htmlFor={`${ids}-name`} description="El nombre del archivo descargado se ajusta a este nombre.">
        <Input value={name} maxLength={120} disabled={busy} onChange={(event) => setName(event.target.value)} />
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Guardar nombre
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
