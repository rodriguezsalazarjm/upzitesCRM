'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';

/** Inscribe un contacto en una estrategia en modo prueba (nada sale a ningun canal). */
export function TestEnroll({ strategyId, contacts }: { strategyId: string; contacts: { id: string; name: string }[] }) {
  const router = useRouter();
  const [contactId, setContactId] = useState(contacts[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/followups/${strategyId}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId }),
    });
    setBusy(false);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.message ?? 'No se pudo inscribir.');
    router.refresh();
  }

  if (contacts.length === 0) return <p className="text-xs text-soft">No hay contactos para probar.</p>;
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select aria-label="Contacto de prueba" value={contactId} onChange={(event) => setContactId(event.target.value)}>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.name}
            </option>
          ))}
        </Select>
        <Button variant="outline" disabled={busy || !contactId} onClick={submit} className="shrink-0">
          Inscribir en prueba
        </Button>
      </div>
      {error && <p className="text-xs text-danger-ink">{error}</p>}
    </div>
  );
}
