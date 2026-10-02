import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Download, ExternalLink, FileArchive, FileAudio, FileText, FileVideo, Link2, KeyRound } from 'lucide-react';
import { resolveDelivery, type BuyerItem } from '@/lib/commerce/delivery';
import { FORMAT_LABEL, formatOf } from '@/lib/commerce/digital-assets/rules';

export const dynamic = 'force-dynamic';

// El enlace es una credencial: no se indexa ni se filtra por Referer.
export const metadata: Metadata = { title: 'Tu compra', robots: { index: false, follow: false }, referrer: 'no-referrer' };

const REASON_TEXT: Record<string, string> = {
  REVOKED: 'Este acceso fue revocado por el vendedor.',
  EXPIRED: 'Este enlace expiró.',
  LIMIT_REACHED: 'Se alcanzó el límite de descargas de este enlace.',
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-start justify-center bg-slate-50 p-4 sm:items-center sm:p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-sm sm:p-8">{children}</div>
    </main>
  );
}

function size(bytes: number | null) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

function Icon({ item }: { item: BuyerItem }) {
  const format = formatOf(item);
  const className = 'h-5 w-5 text-slate-500';
  if (item.kind === 'CODE') return <KeyRound className={className} aria-hidden />;
  if (format === 'PDF') return <FileText className={className} aria-hidden />;
  if (format === 'AUDIO') return <FileAudio className={className} aria-hidden />;
  if (format === 'ZIP') return <FileArchive className={className} aria-hidden />;
  if (format === 'VIDEO') return <FileVideo className={className} aria-hidden />;
  return <Link2 className={className} aria-hidden />;
}

/**
 * Pagina publica de la entrega digital. Valida el token en el servidor y solo
 * muestra lo de ESTA entrega: nombre de cada contenido, su tipo y como abrirlo.
 * Sin ids internos, sin datos del negocio, sin otros pedidos.
 */
export default async function DeliveryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await resolveDelivery(token);

  if (!result.ok) {
    if (result.reason === 'NOT_FOUND') notFound();
    return (
      <Shell>
        <p className="text-sm font-semibold text-slate-900">Acceso no disponible</p>
        <p className="mt-2 text-sm text-slate-500">{REASON_TEXT[result.reason]}</p>
        <p className="mt-4 text-xs text-slate-400">Si crees que es un error, responde el mensaje por el que recibiste este enlace.</p>
      </Shell>
    );
  }

  const products = [...new Set(result.items.map((item) => item.productName))];
  const base = `/d/${encodeURIComponent(token)}`;

  return (
    <Shell>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Tu compra</p>
      <h1 className="mt-1 text-lg font-bold text-slate-900">{products.join(' + ')}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {result.items.length === 1 ? 'Este es tu contenido.' : `Estos son tus ${result.items.length} contenidos, en el orden recomendado.`}
      </p>

      <ol className="mt-5 space-y-3" aria-label="Contenidos de tu compra">
        {result.items.map((item, index) => {
          const format = formatOf(item);
          const href = `${base}/${encodeURIComponent(item.id)}`;
          const meta = [format ? FORMAT_LABEL[format] : null, size(item.sizeBytes)].filter(Boolean).join(' · ');
          return (
            <li key={item.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                  <Icon item={item} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-slate-900">
                    <span className="sr-only">{index + 1}. </span>
                    {item.name}
                  </p>
                  {meta && <p className="mt-0.5 text-xs text-slate-500">{meta}{products.length > 1 ? ` · ${item.productName}` : ''}</p>}

                  {item.kind === 'CODE' && item.code ? (
                    <code className="mt-3 block break-all rounded-lg bg-slate-950 p-3 text-sm text-slate-100">{item.code}</code>
                  ) : item.exhausted ? (
                    <p className="mt-3 text-xs text-slate-500">Alcanzaste el límite de descargas de este archivo.</p>
                  ) : item.kind === 'LINK' ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden />
                      {format === 'VIDEO' ? 'Ver video' : 'Abrir enlace'}
                      <span className="sr-only"> {item.name} (se abre en otra pestaña)</span>
                    </a>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {(format === 'AUDIO' || format === 'VIDEO') && item.mimeType?.startsWith('audio/') ? (
                        <audio controls preload="none" src={`${href}?ver=1`} className="w-full" aria-label={`Reproducir ${item.name}`} />
                      ) : format === 'VIDEO' ? (
                        <video controls preload="none" src={`${href}?ver=1`} className="w-full rounded-lg bg-black" aria-label={`Reproducir ${item.name}`} />
                      ) : null}
                      <a
                        href={href}
                        rel="noreferrer"
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                      >
                        <Download className="h-4 w-4" aria-hidden />
                        Descargar
                        <span className="sr-only"> {item.name}</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-5 text-xs text-slate-400">
        Este enlace es personal. Guárdalo: puedes volver a él cuando quieras
        {result.expiresAt ? ` hasta el ${result.expiresAt.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.
      </p>
    </Shell>
  );
}
