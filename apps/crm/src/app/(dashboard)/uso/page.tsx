import { Header } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow } from '@/components/ui/eyebrow';
import { SettingsCard } from '@/components/ui/settings-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Gauge } from 'lucide-react';
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
          <EmptyState
            icon={Gauge}
            title="Sin suscripcion"
            description="El workspace no tiene un plan asociado, asi que no hay cupos que mostrar."
          />
        ) : (
          <>
            <SettingsCard
              title={summary.plan.name}
              description={`Periodo ${summary.period} · ${formatClp(summary.plan.priceClp)} al mes`}
              actions={
                <StatusBadge tone={summary.active ? 'success' : 'neutral'}>
                  {summary.active ? 'Vigente' : summary.status}
                </StatusBadge>
              }
            >
              <Eyebrow>Costo variable del periodo</Eyebrow>
              <p className="mt-1 type-display text-[32px]">{formatClp(summary.costClp)}</p>
            </SettingsCard>

            <section>
              <Eyebrow className="mb-2">Cupos del plan</Eyebrow>
              <SettingsCard title="Consumo" bodyClassName="space-y-5">
                {summary.allowances.map((allowance) => (
                  <div key={allowance.metric}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-carbon">{allowance.label}</p>
                      <p className="text-xs text-soft">
                        {allowance.metric === 'ai_cost_clp'
                          ? `${formatClp(allowance.used)} de ${formatClp(allowance.limit)}`
                          : `${allowance.used} de ${allowance.limit}`}
                      </p>
                    </div>

                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ivory">
                      <div
                        // Rojo solo si de verdad no queda margen. Pintar de
                        // rojo "1 de 1 numeros" asustaria por un estado sano.
                        className={
                          allowance.exhausted
                            ? 'h-full bg-tomato'
                            : allowance.percent >= 80
                              ? 'h-full bg-solar'
                              : 'h-full bg-lime'
                        }
                        style={{ width: `${Math.min(100, allowance.percent)}%` }}
                      />
                    </div>

                    {/* Un cupo en cero no es un limite alcanzado: es algo que
                        el plan no incluye. Decirlo evita el susto. */}
                    {allowance.limit === 0 && (
                      <p className="mt-1 text-[11px] text-soft">No incluido en este plan.</p>
                    )}
                  </div>
                ))}
              </SettingsCard>
            </section>

            <section>
              <Eyebrow className="mb-2">Capacidades</Eyebrow>
              <SettingsCard title="Incluidas en el plan" bodyClassName="flex flex-wrap gap-2">
                {summary.plan.capabilities.map((capability) => (
                  <Badge key={capability} variant="info">
                    {capability}
                  </Badge>
                ))}
              </SettingsCard>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
