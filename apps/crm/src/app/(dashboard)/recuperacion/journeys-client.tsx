'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pause, Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

export type JourneyView = {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  status: string;
  statusLabel: string;
  statusVariant: 'success' | 'warning' | 'outline';
  steps: number;
  active: number;
  completed: number;
  exited: number;
  recoveryRate: number;
};

const TRIGGER_LABEL: Record<string, string> = {
  NO_ACTIVITY: 'Lead sin respuesta',
  CHECKOUT_ABANDONED: 'Checkout abandonado',
  QUOTE_PENDING: 'Cotizacion pendiente',
  ORDER_PAID: 'Compra pagada',
  MANUAL: 'Manual',
};

/**
 * Lista de journeys con su interruptor.
 *
 * Publicar y pausar es lo unico que se hace desde aqui, y a proposito: es la
 * accion que la spec pide poder tomar rapido —"apagar campanas sin detener el
 * CRM"—. Editar los pasos es una tarea distinta y mas lenta.
 */
export function JourneysClient({
  journeys,
  canManage,
}: {
  journeys: JourneyView[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(journey: JourneyView) {
    const action = journey.status === 'PUBLISHED' ? 'pause' : 'publish';
    setError(null);
    setBusy(journey.id);

    const response = await fetch(`/api/journeys/${journey.id}/${action}`, { method: 'POST' });
    setBusy(null);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.message ?? 'No se pudo cambiar el estado del journey.');
      return;
    }

    router.refresh();
  }

  if (journeys.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-8 text-center">
          <p className="text-sm font-medium text-slate-700">Todavia no hay journeys</p>
          <p className="mt-1 text-xs text-slate-500">
            Se crean con <code>POST /api/journeys</code>.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <Card className="border-0 shadow-sm">
        <CardContent className="divide-y p-0">
          {journeys.map((journey) => (
            <div key={journey.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-800">{journey.name}</p>
                <p className="truncate text-[11px] text-slate-500">
                  {TRIGGER_LABEL[journey.trigger] ?? journey.trigger} · {journey.steps} pasos
                </p>
              </div>

              <div className="hidden w-56 text-right text-[11px] text-slate-500 md:block">
                {journey.active} en curso · {journey.exited} recuperados
                {journey.completed > 0 && ` · ${journey.completed} sin respuesta`}
              </div>

              <Badge variant={journey.statusVariant}>{journey.statusLabel}</Badge>

              {canManage && (
                <button
                  type="button"
                  disabled={busy === journey.id}
                  onClick={() => toggle(journey)}
                  className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 disabled:opacity-50"
                >
                  {journey.status === 'PUBLISHED' ? (
                    <>
                      <Pause className="h-3 w-3" /> Pausar
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3" /> Activar
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
