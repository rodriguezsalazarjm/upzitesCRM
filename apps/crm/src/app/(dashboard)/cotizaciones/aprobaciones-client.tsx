'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Check, ExternalLink, FileText, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export type PendingQuoteView = {
  quoteId: string;
  number: string;
  version: number;
  contactName: string;
  serviceName: string;
  total: number;
  currency: string;
  createdAt: string;
  requestedNote: string | null;
  lines: { label: string; detail: string | null; amount: number }[];
  inputs: { label: string; value: string }[];
  /** Total de la version anterior, cuando esta la reemplaza. */
  previousTotal: number | null;
};

function money(amount: number, currency: string) {
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${Math.abs(amount).toLocaleString('es-CL')} ${currency}`;
}

export function AprobacionesClient({
  quotes,
  canApprove,
}: {
  quotes: PendingQuoteView[];
  canApprove: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<{ quoteId: string; url: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function act(quoteId: string, action: 'approve' | 'reject', body?: unknown) {
    setError(null);
    setBusy(quoteId);

    const response = await fetch(`/api/quotes/${quoteId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });

    setBusy(null);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.message ?? 'No se pudo completar la accion.');
      return;
    }

    if (action === 'approve') {
      const data = await response.json();
      // El enlace del PDF se muestra UNA vez: despues solo queda su hash.
      if (data?.data?.pdfUrl) setPdfUrl({ quoteId, url: data.data.pdfUrl });
    }

    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {/*
        El banner va ANTES del estado vacio a proposito: al aprobar la ultima
        cotizacion la cola queda vacia, y si el banner viviera dentro de la lista
        el enlace desapareceria justo cuando se acaba de generar.
      */}
      {pdfUrl && (
        <div className="flex items-center gap-3 rounded-lg bg-emerald-50 px-3 py-2.5">
          <span className="flex-1 text-xs text-emerald-800">
            Cotizacion aprobada. Guarda este enlace: no se vuelve a mostrar.
          </span>
          <a
            href={pdfUrl.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs font-semibold text-emerald-800 underline"
          >
            Ver PDF <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      {quotes.length === 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <FileText className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">Nada por revisar</p>
            <p className="max-w-sm text-xs text-slate-500">
              Las cotizaciones calculadas aparecen aqui antes de poder enviarse al cliente.
            </p>
          </CardContent>
        </Card>
      )}

      {quotes.map((quote) => (
        <Card key={quote.quoteId} className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-sm">
                  {quote.number}
                  {quote.version > 1 && (
                    <span className="ml-1.5 text-xs font-normal text-slate-400">v{quote.version}</span>
                  )}
                </CardTitle>
                <p className="mt-0.5 text-xs text-slate-500">
                  {quote.contactName} · {quote.serviceName}
                </p>
              </div>
              <div className="text-right">
                <p className="text-base font-bold text-slate-900">{money(quote.total, quote.currency)}</p>
                {quote.previousTotal !== null && quote.previousTotal !== quote.total && (
                  <p className="text-[10px] text-amber-600">
                    Antes: {money(quote.previousTotal, quote.currency)}
                  </p>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {quote.inputs.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {quote.inputs.map((input) => (
                  <span
                    key={input.label}
                    className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600"
                  >
                    {input.label}: <strong className="text-slate-800">{input.value}</strong>
                  </span>
                ))}
              </div>
            )}

            <div className="divide-y rounded-lg border">
              {quote.lines.map((line, index) => (
                <div key={`${line.label}-${index}`} className="flex items-center justify-between px-3 py-1.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs text-slate-700">{line.label}</p>
                    {line.detail && <p className="text-[10px] text-slate-400">{line.detail}</p>}
                  </div>
                  <span className="shrink-0 text-xs font-medium text-slate-800">
                    {money(line.amount, quote.currency)}
                  </span>
                </div>
              ))}
            </div>

            {quote.requestedNote && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                {quote.requestedNote}
              </p>
            )}

            {canApprove ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  disabled={busy === quote.quoteId}
                  onClick={() => act(quote.quoteId, 'approve')}
                >
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  Aprobar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={busy === quote.quoteId}
                  onClick={() =>
                    act(quote.quoteId, 'reject', {
                      comment: 'Requiere ajustes antes de enviar.',
                      changesRequested: true,
                    })
                  }
                >
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Pedir cambios
                </Button>
              </div>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                Solo el owner o un admin puede aprobar
              </Badge>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
