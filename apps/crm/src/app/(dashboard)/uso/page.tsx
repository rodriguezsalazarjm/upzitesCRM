import { Header } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { requireCurrentUser } from '@/lib/auth';
import { usageSummary } from '@/lib/billing/usage';

export const dynamic = 'force-dynamic';

function formatClp(value: number) {
  return `$${value.toLocaleString('es-CL')}`;
}

export default async function UsoPage() {
  const user = await requireCurrentUser();
  const summary = await usageSummary(user.workspace.id);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Uso y costos" subtitle="Cuanto llevas consumido este mes y de cuanto dispones" />

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {!summary ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-8 text-center">
              <p className="text-sm font-medium text-slate-700">Sin suscripcion</p>
              <p className="mt-1 text-xs text-slate-500">
                El workspace no tiene un plan asociado, asi que no hay cupos que mostrar.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-0 shadow-sm">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{summary.plan.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Periodo {summary.period} · {formatClp(summary.plan.priceClp)} al mes
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">
                    Costo variable del periodo
                  </p>
                  <p className="text-sm font-bold text-slate-900">{formatClp(summary.costClp)}</p>
                </div>

                <Badge variant={summary.active ? 'success' : 'outline'}>
                  {summary.active ? 'Vigente' : summary.status}
                </Badge>
              </CardContent>
            </Card>

            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Cupos del plan
              </p>
              <Card className="border-0 shadow-sm">
                <CardContent className="divide-y p-0">
                  {summary.allowances.map((allowance) => (
                    <div key={allowance.metric} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-slate-800">{allowance.label}</p>
                        <p className="text-xs text-slate-500">
                          {allowance.metric === 'ai_cost_clp'
                            ? `${formatClp(allowance.used)} de ${formatClp(allowance.limit)}`
                            : `${allowance.used} de ${allowance.limit}`}
                        </p>
                      </div>

                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          // Rojo solo si de verdad no queda margen. Pintar de
                          // rojo "1 de 1 numeros" asustaria por un estado sano.
                          className={
                            allowance.exhausted
                              ? 'h-full bg-red-500'
                              : allowance.percent >= 80
                                ? 'h-full bg-amber-500'
                                : 'h-full bg-emerald-500'
                          }
                          style={{ width: `${Math.min(100, allowance.percent)}%` }}
                        />
                      </div>

                      {/* Un cupo en cero no es un limite alcanzado: es algo que
                          el plan no incluye. Decirlo evita el susto. */}
                      {allowance.limit === 0 && (
                        <p className="mt-1 text-[11px] text-slate-400">
                          No incluido en este plan.
                        </p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>

            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Capacidades
              </p>
              <Card className="border-0 shadow-sm">
                <CardContent className="flex flex-wrap gap-2 p-5">
                  {summary.plan.capabilities.map((capability) => (
                    <Badge key={capability} variant="info">
                      {capability}
                    </Badge>
                  ))}
                </CardContent>
              </Card>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
