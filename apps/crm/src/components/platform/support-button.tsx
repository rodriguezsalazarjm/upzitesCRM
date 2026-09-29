'use client';

import { useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * "Entrar como soporte": abre una SupportSession READ_ONLY (auditada, max 60
 * min) y lleva al dashboard del cliente con el banner de soporte. Escribir
 * exige elevar con motivo desde el banner.
 */
export function SupportButton({ workspaceId }: { workspaceId: string }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const response = await fetch('/api/platform/support-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, reason, minutes: 60 }),
    });
    const json = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) {
      setPending(false);
      setError(json.message ?? 'No se pudo iniciar el soporte.');
      return;
    }
    window.location.href = '/dashboard';
  }

  return (
    <form onSubmit={start} className="flex flex-wrap items-end gap-2">
      <label className="block min-w-[220px] flex-1 text-xs font-semibold text-graphite">
        <span className="mb-1 block">Motivo del acceso (queda auditado)</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          minLength={5}
          className="h-10 w-full rounded-lg border border-mist bg-paper px-3 text-sm"
        />
      </label>
      <Button type="submit" variant="dark" disabled={pending}>
        <LifeBuoy />
        {pending ? 'Entrando…' : 'Entrar como soporte (solo lectura)'}
      </Button>
      {error && <p role="alert" className="w-full text-xs text-danger-ink">{error}</p>}
    </form>
  );
}
