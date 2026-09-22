import { Header } from '@/components/layout/header';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { requireCurrentUser } from '@/lib/auth';
import { openAlerts } from '@/lib/billing/alerts';
import { getOnboardingState } from '@/lib/onboarding/steps';
import { canActivate } from '@/lib/onboarding/activation';
import { OnboardingClient } from './onboarding-client';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const user = await requireCurrentUser();

  const [state, alerts] = await Promise.all([
    getOnboardingState(user.workspace.id),
    openAlerts(user.workspace.id),
  ]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Puesta en marcha"
        subtitle="Lo que falta para que el agente atienda solo"
      />

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {alerts.length > 0 && (
          <section>
            <Eyebrow className="mb-2">Avisos ({alerts.length})</Eyebrow>
            <Card className="divide-y divide-line">
              {alerts.map((alert) => (
                <div key={alert.id} className="px-4 py-3">
                  <p
                    className={
                      alert.severity === 'CRITICAL'
                        ? 'text-xs font-semibold text-danger-ink'
                        : 'text-xs font-semibold text-warning-ink'
                    }
                  >
                    {alert.title}
                  </p>
                  {alert.detail && <p className="mt-0.5 text-[11px] text-soft">{alert.detail}</p>}
                </div>
              ))}
            </Card>
          </section>
        )}

        <OnboardingClient state={state} canActivate={canActivate(user.role)} />
      </div>
    </div>
  );
}
