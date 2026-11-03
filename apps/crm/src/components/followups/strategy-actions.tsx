'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Pause, Pencil, Play, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

async function post(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, data };
}

/** Activar / pausar / duplicar / editar / desactivar una estrategia. */
export function StrategyActions({
  id,
  status,
  simulate,
  editable,
  compact,
}: {
  id: string;
  status: string;
  simulate: boolean;
  editable: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'publish' | 'archive' | null>(null);

  async function run(action: 'publish' | 'pause' | 'archive') {
    setBusy(true);
    setError(null);
    const result = await post(`/api/followups/${id}/status`, { action });
    setBusy(false);
    setConfirm(null);
    if (!result.ok) return setError(result.data.message ?? 'No se pudo cambiar el estado.');
    router.refresh();
  }

  async function duplicate() {
    setBusy(true);
    setError(null);
    const result = await post(`/api/followups/${id}/duplicate`);
    setBusy(false);
    if (!result.ok) return setError(result.data.message ?? 'No se pudo duplicar.');
    router.push(`/recuperacion/${result.data.data.id}`);
  }

  const size = compact ? 'sm' : 'default';
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1.5">
        {status === 'PUBLISHED' ? (
          <Button size={size} variant="outline" disabled={busy} onClick={() => run('pause')}>
            <Pause /> Pausar
          </Button>
        ) : status !== 'ARCHIVED' ? (
          <Button size={size} disabled={busy} onClick={() => (simulate ? run('publish') : setConfirm('publish'))}>
            <Play /> Activar
          </Button>
        ) : null}
        {!compact && editable && status !== 'PUBLISHED' && status !== 'ARCHIVED' && (
          <Button size={size} variant="outline" asChild>
            <Link href={`/recuperacion/${id}?editar=1`}>
              <Pencil /> Editar
            </Link>
          </Button>
        )}
        <Button size={size} variant="ghost" disabled={busy} onClick={duplicate}>
          <Copy /> Duplicar
        </Button>
        {!compact && status !== 'ARCHIVED' && (
          <Button size={size} variant="ghost" disabled={busy} onClick={() => setConfirm('archive')}>
            <Power /> Desactivar
          </Button>
        )}
      </div>
      {error && <p className="max-w-xs text-right text-xs text-danger-ink">{error}</p>}

      <ConfirmDialog
        open={confirm === 'publish'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Activar con envíos reales"
        description="Esta estrategia no está en modo prueba: a partir de ahora les escribirá a los contactos que cumplan el disparador, dentro de tu horario y límites."
        confirmLabel="Activar"
        busy={busy}
        onConfirm={() => run('publish')}
      />
      <ConfirmDialog
        open={confirm === 'archive'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Desactivar estrategia"
        description="Se cancelan los seguimientos en curso y no inscribe a nadie más. El historial se conserva."
        confirmLabel="Desactivar"
        destructive
        busy={busy}
        onConfirm={() => run('archive')}
      />
    </div>
  );
}

/** Cancelar o adelantar (solo prueba) una inscripcion. */
export function EnrollmentActions({ id, simulated }: { id: string; simulated: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function act(path: 'cancel' | 'run-now') {
    setBusy(true);
    setMessage(null);
    const result = await post(`/api/followups/enrollments/${id}/${path}`);
    setBusy(false);
    if (!result.ok) return setMessage(result.data.message ?? 'No se pudo completar la acción.');
    if (path === 'run-now' && result.data.data?.outcome === 'RESCHEDULE') setMessage(`Reprogramado: ${result.data.data.detail}`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {simulated && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act('run-now')}>
          <Play /> Ejecutar paso ahora
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => act('cancel')}>
        Cancelar
      </Button>
      {message && <span className="text-[11px] text-warning-ink">{message}</span>}
    </div>
  );
}
