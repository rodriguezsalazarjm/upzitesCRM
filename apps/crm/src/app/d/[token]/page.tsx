import { notFound } from 'next/navigation';
import { redirect } from 'next/navigation';
import { resolveDelivery } from '@/lib/commerce/delivery';

export const dynamic = 'force-dynamic';

const REASON_TEXT: Record<string, string> = {
  NOT_FOUND: 'Este enlace no es valido.',
  REVOKED: 'Este acceso fue revocado.',
  EXPIRED: 'Este enlace expiro.',
  LIMIT_REACHED: 'Se alcanzo el limite de descargas de este enlace.',
};

/**
 * Pagina publica de entrega digital. No expone el destino real hasta validar el
 * token, y no dice por que falla mas alla de lo necesario.
 */
export default async function DeliveryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await resolveDelivery(token);

  if (!result.ok) {
    if (result.reason === 'NOT_FOUND') notFound();

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Acceso no disponible</p>
          <p className="mt-2 text-xs text-slate-500">{REASON_TEXT[result.reason]}</p>
          <p className="mt-4 text-[11px] text-slate-400">
            Si crees que es un error, responde el mensaje por el que recibiste este enlace.
          </p>
        </div>
      </main>
    );
  }

  // Un LINK se resuelve redirigiendo; el resto se muestra en pantalla.
  if (result.asset.kind === 'LINK') {
    redirect(result.asset.target);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Tu acceso</p>
        <h1 className="mt-1 text-lg font-bold text-slate-900">{result.asset.name}</h1>

        {result.asset.kind === 'CODE' ? (
          <div className="mt-4 rounded-lg bg-slate-950 p-4">
            <code className="text-sm text-slate-100">{result.asset.target}</code>
          </div>
        ) : (
          <a
            href={result.asset.target}
            className="mt-4 block rounded-lg bg-blue-600 py-3 text-center text-sm font-semibold text-white hover:bg-blue-700"
          >
            Descargar
          </a>
        )}

        <p className="mt-4 text-[11px] text-slate-400">
          Te quedan {result.remaining} acceso(s) con este enlace.
        </p>
      </div>
    </main>
  );
}
