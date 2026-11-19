'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/** P31: cerrar una incidencia de pago con una nota (qué se hizo y por qué). */
export function IncidentResolveForm({ incidentId }: { incidentId: string }) {
  const router = useRouter();
  const noteId = useId();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'RESOLVED' | 'DISMISSED' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function close(status: 'RESOLVED' | 'DISMISSED') {
    setBusy(status);
    setError(null);
    try {
      const response = await fetch(`/api/payment-incidents/${encodeURIComponent(incidentId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setError(body.message ?? 'No pudimos cerrar la incidencia.');
        return;
      }
      router.refresh();
    } catch {
      setError('No pudimos conectar con el servidor.');
    } finally {
      setBusy(null);
    }
  }

  const tooShort = note.trim().length < 3;
  return (
    <div className="space-y-2" data-incident-form={incidentId}>
      <label htmlFor={noteId} className="text-xs font-semibold text-carbon">Nota de resolución</label>
      <Textarea id={noteId} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Ej.: devolví el pago sobrante en Mercado Pago y avisé al cliente." />
      {error && <p className="text-xs font-medium text-danger-ink" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => close('RESOLVED')} disabled={busy !== null || tooShort}>
          {busy === 'RESOLVED' && <Loader2 className="animate-spin" aria-hidden />}
          Marcar resuelta
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => close('DISMISSED')} disabled={busy !== null || tooShort}>
          {busy === 'DISMISSED' && <Loader2 className="animate-spin" aria-hidden />}
          Descartar
        </Button>
      </div>
    </div>
  );
}
