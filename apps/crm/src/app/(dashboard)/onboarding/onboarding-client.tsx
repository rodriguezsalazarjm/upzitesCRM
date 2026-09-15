'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Circle, Info, MinusCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { OnboardingState, StepState } from '@/lib/onboarding/steps';

/**
 * Puesta en marcha.
 *
 * No es un formulario de diez pasos encadenados: es una lista de lo que falta,
 * cada cosa con su enlace. El cliente rara vez puede completarla de una
 * sentada —verificar un dominio depende del DNS, conectar WhatsApp depende de
 * Meta— y un wizard que obliga a avanzar en orden lo dejaria atascado en el
 * paso que no depende de el.
 *
 * Lo obligatorio va primero y solo, sin nada que lo diluya. Lo opcional existe
 * pero empieza cerrado: son mejoras, y mostrarlas como deberes hace que la
 * puesta en marcha parezca el triple de larga de lo que es.
 */

/** Como se dice, para el cliente, hasta donde llego cada cosa. */
const EVIDENCE_LABEL: Record<StepState['evidence'], string | null> = {
  PENDIENTE: null,
  GUARDADO: 'Guardado',
  VERIFICADO: 'Confirmado',
  PROBADO: 'Probado',
};

function StepRow({ step }: { step: StepState }) {
  const unavailable = step.level === 'UNAVAILABLE';
  const evidence = EVIDENCE_LABEL[step.evidence];
  // "A medias" solo cuando hay algo guardado que todavia no alcanza: le dice al
  // cliente que su trabajo no se perdio.
  const partial = !step.done && step.evidence !== 'PENDIENTE';

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      {unavailable ? (
        <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
      ) : step.done ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={
              step.done
                ? 'text-xs font-semibold text-slate-400'
                : 'text-xs font-semibold text-slate-800'
            }
          >
            {step.title}
          </p>

          {step.done && evidence && (
            <Badge variant={step.evidence === 'GUARDADO' ? 'outline' : 'success'}>{evidence}</Badge>
          )}
          {partial && <Badge variant="warning">A medias</Badge>}
        </div>

        <p className="mt-0.5 text-[11px] text-slate-500">{step.hint ?? step.description}</p>

        {/* El porque solo aparece mientras falta: una vez hecho, estorba. */}
        {!step.done && step.why && (
          <p className="mt-1 flex items-start gap-1.5 text-[11px] text-slate-400">
            <Info className="mt-px h-3 w-3 shrink-0" />
            <span>{step.why}</span>
          </p>
        )}
      </div>

      {!step.done && step.href && !unavailable && (
        <Link
          href={step.href}
          className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-blue-700 hover:underline"
        >
          {step.action ?? 'Ir'} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

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

  const required = state.steps.filter(
    (step) => step.level === 'REQUIRED' && step.key !== 'activacion',
  );
  const optional = state.steps.filter((step) => step.level === 'OPTIONAL');
  const unavailable = state.steps.filter((step) => step.level === 'UNAVAILABLE');
  const optionalPending = optional.filter((step) => !step.done).length;

  return (
    <>
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {active ? 'Tu cuenta esta activa' : 'Todavia en configuracion'}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {active
                  ? 'El agente responde conversaciones y los seguimientos estan corriendo.'
                  : 'Mientras tanto tu equipo puede usar el CRM, pero el agente no responde solo.'}
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

      <section>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          Necesario para empezar
        </p>
        <Card className="border-0 shadow-sm">
          <CardContent className="divide-y p-0">
            {required.map((step) => (
              <StepRow key={step.key} step={step} />
            ))}
          </CardContent>
        </Card>
      </section>

      {optional.length > 0 && (
        <section>
          <details className="group">
            <summary className="mb-2 cursor-pointer list-none text-[10px] font-semibold uppercase tracking-widest text-slate-400 hover:text-slate-600">
              Puedes agregarlo despues
              {optionalPending > 0 && ` (${optionalPending})`}
            </summary>
            <Card className="border-0 shadow-sm">
              <CardContent className="divide-y p-0">
                {optional.map((step) => (
                  <StepRow key={step.key} step={step} />
                ))}
              </CardContent>
            </Card>
          </details>
        </section>
      )}

      {unavailable.length > 0 && (
        <section>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            No viene en tu plan
          </p>
          <Card className="border-0 shadow-sm">
            <CardContent className="divide-y p-0">
              {unavailable.map((step) => (
                <StepRow key={step.key} step={step} />
              ))}
            </CardContent>
          </Card>
          <p className="mt-2 text-[11px] text-slate-500">
            Si necesitas alguna de estas,{' '}
            <Link href="/billing" className="font-medium text-blue-700 hover:underline">
              revisa los planes
            </Link>
            .
          </p>
        </section>
      )}

      {!active && (
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Activar</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {state.canActivate
                  ? 'Desde aqui el agente conversa con clientes reales sin que nadie mire.'
                  : state.blockers.length === 1
                    ? 'Falta una cosa de la lista de arriba.'
                    : `Faltan ${state.blockers.length} cosas de la lista de arriba.`}
              </p>
              {!canActivate && (
                <p className="mt-1 text-[11px] text-slate-400">
                  Solo el dueno de la cuenta puede activar.
                </p>
              )}
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
