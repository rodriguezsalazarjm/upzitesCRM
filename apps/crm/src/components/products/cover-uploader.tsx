'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ImageOff, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingsCard } from '@/components/ui/settings-card';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp';

/** Portada del producto: JPG, PNG o WebP de hasta 5 MB. El servidor verifica los bytes. */
export function CoverUploader({ productId, coverVersion, editable }: { productId: string; coverVersion: string | null; editable: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const src = coverVersion ? `/api/products/${encodeURIComponent(productId)}/cover?v=${encodeURIComponent(coverVersion)}` : null;

  async function upload(file: File) {
    setError(null);
    setStatus(null);
    if (!ACCEPT.split(',').includes(file.type)) return setError('Sube una imagen JPG, PNG o WebP.');
    if (file.size > MAX_BYTES) return setError('La imagen supera 5 MB.');
    setBusy('upload');
    try {
      const body = new FormData();
      body.set('file', file);
      const response = await fetch(`/api/products/${encodeURIComponent(productId)}/cover`, { method: 'POST', body });
      const json = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) return setError(json.message ?? 'No pudimos subir la imagen.');
      setStatus('Portada actualizada.');
      router.refresh();
    } catch {
      setError('No pudimos conectar con el servidor.');
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  }

  async function remove() {
    setError(null);
    setStatus(null);
    setBusy('remove');
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(productId)}/cover`, { method: 'DELETE' });
      const json = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) return setError(json.message ?? 'No pudimos quitar la imagen.');
      setStatus('Portada eliminada.');
      router.refresh();
    } catch {
      setError('No pudimos conectar con el servidor.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <SettingsCard title="Portada" description="Imagen principal del producto en el checkout. JPG, PNG o WebP, hasta 5 MB.">
      <div className="space-y-3">
        <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl bg-ivory">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagen privada servida por la API, sin optimizador
            <img src={src} alt="Portada actual del producto" className="h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-2 text-xs text-ash">
              <ImageOff className="h-6 w-6" strokeWidth={1.5} aria-hidden />
              Sin portada
            </span>
          )}
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2">
            <input
              ref={input}
              id={`cover-file-${productId}`}
              type="file"
              accept={ACCEPT}
              aria-label="Archivo de portada"
              tabIndex={-1}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => input.current?.click()}>
              {busy === 'upload' ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
              {src ? 'Cambiar portada' : 'Subir portada'}
            </Button>
            {src && (
              <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={remove}>
                {busy === 'remove' ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
                Quitar
              </Button>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs font-medium text-danger-ink">
            {error}
          </p>
        )}
        <p role="status" className="text-xs text-success-ink">
          {status}
        </p>
      </div>
    </SettingsCard>
  );
}
