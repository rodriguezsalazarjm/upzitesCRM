'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Power, PowerOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { FlagState } from '@/lib/ops/flags';

/**
 * Interruptores de funciones: el freno de mano.
 *
 * Cada fila dice que pasa exactamente si se apaga. Un interruptor sin esa frase
 * es un interruptor que nadie se atreve a tocar en una emergencia, que es justo
 * cuando hace falta.
 */
export function FlagsClient({ flags, canManage }: { flags: FlagState[]; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(flag: FlagState) {
    setError(null);
    setBusy(flag.key);

    const response = await fetch('/api/ops/flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: flag.key,
        enabled: !flag.enabled,
        note: flag.enabled ? 'Apagado desde Ops' : undefined,
      }),
    });

    setBusy(null);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.message ?? 'No se pudo cambiar el interruptor.');
      return;
    }

    router.refresh();
  }

  return (
    <>
      {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <Card className="border-0 shadow-sm">
        <CardContent className="divide-y p-0">
          {flags.map((flag) => (
            <div key={flag.key} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-800">{flag.label}</p>
                <p className="text-[11px] text-slate-500">{flag.effect}</p>
                {flag.note && (
                  <p className="mt-0.5 text-[11px] italic text-slate-400">{flag.note}</p>
                )}
              </div>

              {flag.disabledBy === 'GLOBAL' && (
                <Badge variant="destructive">Apagado por plataforma</Badge>
              )}

              <Badge variant={flag.enabled ? 'success' : 'outline'}>
                {flag.enabled ? 'Activo' : 'Apagado'}
              </Badge>

              {/* Un corte global no se puede reencender desde aqui: si un
                  workspace pudiera, el corte no serviria de nada. */}
              {canManage && flag.disabledBy !== 'GLOBAL' && (
                <button
                  type="button"
                  disabled={busy === flag.key}
                  onClick={() => toggle(flag)}
                  className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 disabled:opacity-50"
                >
                  {flag.enabled ? (
                    <>
                      <PowerOff className="h-3 w-3" /> Apagar
                    </>
                  ) : (
                    <>
                      <Power className="h-3 w-3" /> Encender
                    </>
                  )}
                </button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
