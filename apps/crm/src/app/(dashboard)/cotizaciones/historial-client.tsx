'use client';

import { useState } from 'react';
import { ExternalLink, FileText, Link2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export type HistoryQuoteView = {
  id: string;
  number: string;
  version: number;
  contactName: string;
  status: string;
  statusLabel: string;
  statusTone: StatusTone;
  total: number;
  createdAt: string;
  validUntil: string | null;
};

const SHAREABLE = ['APPROVED', 'SENT', 'ACCEPTED'];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

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
      {error && <p className="mb-2 rounded-lg bg-tomato/12 px-3 py-2 text-xs text-danger-ink">{error}</p>}

      <Card className="overflow-hidden">
        <Table density="compact">
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead className="hidden sm:table-cell">Folio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead align="right">Monto</TableHead>
              <TableHead className="hidden md:table-cell">Fecha</TableHead>
              <TableHead className="hidden lg:table-cell">Vigencia</TableHead>
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotes.map((quote) => (
              <TableRow key={quote.id}>
                <TableCell>
                  <p className="truncate font-semibold text-carbon">{quote.contactName}</p>
                </TableCell>
                <TableCell className="hidden text-graphite sm:table-cell">
                  {quote.number}
                  {quote.version > 1 && <span className="ml-1 text-soft">v{quote.version}</span>}
                </TableCell>
                <TableCell>
                  <StatusBadge tone={quote.statusTone}>{quote.statusLabel}</StatusBadge>
                </TableCell>
                <TableCell numeric>${quote.total.toLocaleString('es-CL')}</TableCell>
                <TableCell muted className="hidden md:table-cell">
                  {formatDate(quote.createdAt)}
                </TableCell>
                <TableCell muted className="hidden lg:table-cell">
                  {quote.validUntil ? formatDate(quote.validUntil) : '—'}
                </TableCell>
                <TableCell className="w-32">
                  {canManage && SHAREABLE.includes(quote.status) ? (
                    links[quote.id] ? (
                      <a
                        href={links[quote.id]}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[11px] font-medium text-electric hover:underline"
                      >
                        Ver PDF <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled={busy === quote.id}
                        onClick={() => regenerate(quote.id)}
                        className="flex items-center gap-1 text-[11px] text-soft hover:text-carbon disabled:opacity-50"
                      >
                        <Link2 className="h-3 w-3" />
                        {busy === quote.id ? 'Generando…' : 'Obtener enlace'}
                      </button>
                    )
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
            {quotes.length === 0 && (
              <TableEmpty colSpan={7} icon={FileText} title="Sin cotizaciones" description="Aun no hay historial." />
            )}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
