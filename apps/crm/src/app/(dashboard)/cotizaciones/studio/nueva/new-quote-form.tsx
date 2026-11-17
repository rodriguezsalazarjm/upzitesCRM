'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';

export function NewQuoteForm({ templates, opportunityId, contactId }: { templates: { id: string; name: string }[]; opportunityId: string | null; contactId: string | null }) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    setBusy(true);
    setError('');
    const response = await fetch('/api/quote-studio/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId, opportunityId, contactId }) }).catch(() => null);
    const json = (await response?.json().catch(() => null)) as { data?: { id: string }; message?: string } | null;
    if (!response?.ok || !json?.data) { setBusy(false); setError(json?.message ?? 'No se pudo crear la cotización.'); return; }
    router.push(`/cotizaciones/studio/${json.data.id}`);
  }

  return (
    <Card className="max-w-md space-y-3 p-4">
      <label className="block space-y-1 text-sm"><span className="font-semibold text-carbon">Plantilla</span>
        <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)} data-new-template>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></label>
      {opportunityId && <p className="text-xs text-soft">Se copiarán el cliente y el ejecutivo de la oportunidad.</p>}
      {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
      <Button type="button" disabled={busy || !templateId} onClick={() => void create()} data-create-quote>Crear cotización</Button>
    </Card>
  );
}
