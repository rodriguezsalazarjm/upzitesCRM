'use client';

import { useState } from 'react';
import { ExternalLink, Link2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

export type HistoryQuoteView = {
  id: string;
  number: string;
  version: number;
  contactName: string;
  status: string;
  statusLabel: string;
  statusVariant: 'success' | 'warning' | 'outline';
  total: number;
};

const SHAREABLE = ['APPROVED', 'SENT', 'ACCEPTED'];

/**
 * Historial con la opcion de recuperar el enlace del PDF.
 *
 * El token se muestra una sola vez al aprobar y solo se guarda su hash, asi que
 * sin esta accion una cotizacion aprobada podia quedar sin forma de enviarse.
 */
export function HistorialClient({
  quotes,
  canManage,
}: {
  quotes: HistoryQuoteView[];
  canManage: boolean;
}) {
  const [links, setLinks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function regenerate(quoteId: string) {
    setError(null);
    setBusy(quoteId);

    const response = await fetch(`/api/quotes/${quoteId}/pdf-link`, { method: 'POST' });
    setBusy(null);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.message ?? 'No se pudo generar el enlace.');
      return;
    }

    const data = await response.json();
    setLinks((current) => ({ ...current, [quoteId]: data.data.pdfUrl }));
  }

  return (
    <>
      {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <Card className="border-0 shadow-sm">
        <CardContent className="divide-y p-0">
          {quotes.map((quote) => (
            <div key={quote.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-800">
                  {quote.number}
                  {quote.version > 1 && (
                    <span className="ml-1 font-normal text-slate-400">v{quote.version}</span>
                  )}
                </p>
                <p className="truncate text-[11px] text-slate-500">{quote.contactName}</p>
              </div>

              {canManage && SHAREABLE.includes(quote.status) && (
                links[quote.id] ? (
                  <a
                    href={links[quote.id]}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] font-medium text-blue-700 underline"
                  >
                    Ver PDF <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled={busy === quote.id}
                    onClick={() => regenerate(quote.id)}
                    className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 disabled:opacity-50"
                  >
                    <Link2 className="h-3 w-3" />
                    {busy === quote.id ? 'Generando…' : 'Obtener enlace'}
                  </button>
                )
              )}

              <Badge variant={quote.statusVariant}>{quote.statusLabel}</Badge>
              <span className="w-28 text-right text-xs font-bold text-slate-900">
                ${quote.total.toLocaleString('es-CL')}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
