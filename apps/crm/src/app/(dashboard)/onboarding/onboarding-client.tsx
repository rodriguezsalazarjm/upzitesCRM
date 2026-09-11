'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { OnboardingState } from '@/lib/onboarding/steps';

/**
 * Wizard de puesta en marcha.
 *
 * No es un formulario de diez pasos encadenados: es una lista de lo que falta,
 * cada cosa con su enlace. El cliente rara vez puede completar el onboarding de
 * una sentada —verificar un dominio depende del DNS, conectar WhatsApp depende
 * de Meta— y un wizard que obliga a avanzar en orden lo dejaria atascado en el
 * paso que no depende de el.
 */
export function OnboardingClient({
  state,
  canActivate,
}: {
  state: OnboardingState;
  canActivate: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function activate() {
    setError(null);
    setBusy(true);

    const response = await fetch('/api/onboarding/activate', { method: 'POST' });
    setBusy(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const blockers = Array.isArray(data.blockers) ? data.blockers.join(' · ') : '';
      setError(blockers ? `${data.message} ${blockers}` : (data.message ?? 'No se pudo activar.'));
      return;
    }

    router.refresh();
  }

  const active = state.status === 'ACTIVE';
  const percent = state.total === 0 ? 100 : Math.round((state.completed / state.total) * 100);

  return (
    <>
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {active ? 'Workspace activo' : 'Todavia en configuracion'}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {active
                  ? 'El agente atiende conversaciones y la recuperacion esta corriendo.'
                  : 'Mientras tanto el equipo puede usar el CRM, pero la IA no responde sola.'}
              </p>
            </div>
            <Badge variant={active ? 'success' : 'warning'}>
              {state.completed} de {state.total}
            </Badge>
          </div>

          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={active ? 'h-full bg-emerald-500' : 'h-full bg-slate-900'}
              style={{ width: `${percent}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <Card className="border-0 shadow-sm">
        <CardContent className="divide-y p-0">
          {state.steps.map((step) => (
            <div key={step.key} className="flex items-start gap-3 px-4 py-3">
              {step.done ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
              )}

              <div className="min-w-0 flex-1">
                <p
                  className={
                    step.done
                      ? 'text-xs font-semibold text-slate-400 line-through'
                      : 'text-xs font-semibold text-slate-800'
                  }
                >
                  {step.title}
                </p>
                <p className="text-[11px] text-slate-500">{step.hint ?? step.description}</p>
              </div>

              {!step.required && <Badge variant="outline">Opcional</Badge>}

              {!step.done && step.href && (
                <Link
                  href={step.href}
                  className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-blue-700 hover:underline"
                >
                  Ir <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {!active && (
        <Card className="border-0 shadow-sm">
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="text-sm font-semibold text-slate-900">Activar el workspace</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {state.canActivate
                  ? 'A partir de aqui el agente conversa con clientes reales.'
                  : `Faltan ${state.blockers.length} pasos obligatorios.`}
              </p>
            </div>

            <button
              type="button"
              disabled={!canActivate || !state.canActivate || busy}
              onClick={activate}
              className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40"
            >
              {busy ? 'Activando…' : 'Activar'}
            </button>
          </CardContent>
        </Card>
      )}
    </>
  );
}
