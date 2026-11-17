'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { QuotePreview } from '@/components/quote-studio/quote-preview';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import type { Op } from '@/lib/quote-studio/layout';

const DONE: Record<string, string> = {
  ACCEPTED: 'Aceptaste esta cotización. El equipo se pondrá en contacto contigo.',
  REJECTED: 'Rechazaste esta cotización. Gracias por avisar.',
  EXPIRED: 'Esta cotización venció. Pide una nueva si aún te interesa.',
};

export function PublicQuoteView({ token, status: initial, pages, logoUrl, editingNewVersion, comment: savedComment }: {
  token: string; status: string; pages: Op[][]; logoUrl: string | null; editingNewVersion: boolean; comment: string | null;
}) {
  const [status, setStatus] = useState(initial);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const answerable = (status === 'SENT' || status === 'VIEWED') && !editingNewVersion;

  async function respond(decision: 'accept' | 'reject') {
    setBusy(true);
    setError('');
    const response = await fetch(`/api/public-quotes/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, comment }) }).catch(() => null);
    const json = (await response?.json().catch(() => null)) as { data?: { status: string }; message?: string } | null;
    setBusy(false);
    if (!response?.ok || !json?.data) { setError(json?.message ?? 'No se pudo enviar tu respuesta. Inténtalo de nuevo.'); return; }
    setStatus(json.data.status);
  }

  return (
    <div className="space-y-4">
      <a href={`/cotizacion/${token}/pdf`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm' })} data-public-pdf><Download aria-hidden /> Descargar PDF</a>
      <QuotePreview pages={pages} logoUrl={logoUrl} />
      <Card className="space-y-3 p-4" data-public-response>
        {DONE[status] ? (
          <p className="text-sm font-semibold text-carbon" role="status" data-public-status={status}>{DONE[status]}{savedComment && status === initial ? ` Tu comentario: “${savedComment}”` : ''}</p>
        ) : editingNewVersion ? (
          <p className="text-sm text-graphite">El equipo está preparando una versión actualizada de esta cotización. Te la enviarán pronto.</p>
        ) : answerable ? (
          <>
            <label className="block space-y-1 text-sm"><span className="font-semibold text-carbon">Comentario (opcional)</span>
              <Textarea rows={2} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="¿Algo que quieras ajustar o consultar?" /></label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={() => void respond('accept')} data-public-accept>Aceptar cotización</Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => void respond('reject')} data-public-reject>Rechazar</Button>
            </div>
          </>
        ) : null}
        {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
      </Card>
    </div>
  );
}
