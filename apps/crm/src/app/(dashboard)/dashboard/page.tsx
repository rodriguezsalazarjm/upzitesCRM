import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card } from '@/components/ui/card';
import { ChecklistCard } from '@/components/dashboard/checklist-card';
import { DashboardToolbar } from '@/components/dashboard/dashboard-controls';
import { WidgetCard } from '@/components/dashboard/widget-card';
import { requireCurrentUser } from '@/lib/auth';
import { AUTOMATION_TEMPLATES } from '@/lib/automations/catalog';
import { canManageAutomations } from '@/lib/automations/roles';
import { DEV_DEMO_USER } from '@/lib/dev-demo';
import { getChecklist, getWorkspaceExperience, loadDashboard } from '@/lib/workspace-experience';
import { canManageProfile } from '@/lib/workspace-profile/service';

export const dynamic = 'force-dynamic';

/**
 * Dashboard adaptativo (P0-E): widgets del registro segun el preset del
 * negocio, filtrados por plan, en el layout personal de la persona en ESTE
 * workspace. El workspaceId sale de la sesion verificada.
 */
export default async function DashboardPage() {
  const user = await requireCurrentUser();
  const subtitle = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

  if (user.id === DEV_DEMO_USER.id) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <Header title="Inicio" subtitle={subtitle} />
        <p className="px-8 text-sm text-soft">Modo demo: el dashboard adaptativo necesita la base de datos.</p>
      </div>
    );
  }

  const experience = await getWorkspaceExperience({ workspaceId: user.workspace.id, userId: user.id, role: user.role });
  const [dashboard, checklist] = await Promise.all([
    loadDashboard(experience, user.workspace.id),
    experience.preference.checklistHidden ? null : getChecklist(experience, { workspaceId: user.workspace.id, role: user.role }),
  ]);
  const needsSetup = !experience.profile.onboardingCompletedAt;
  const canSetup = canManageProfile(user.role);
  const { preset } = experience.preset;
  // La acción del rubro solo si el plan habilita su módulo; si no, la neutra.
  const nav = [...experience.navigation.primary, ...experience.navigation.hidden];
  const actionLocked = nav.some((entry) => entry.locked && preset.primaryAction.href.startsWith(entry.href));
  const primaryAction = actionLocked ? { label: 'Nuevo contacto', href: '/contactos/nuevo' } : preset.primaryAction;
  // P14: plantillas del rubro, en el orden del preset.
  const recommended = canManageAutomations(user.role) ? preset.recommendedTemplates.flatMap((id) => AUTOMATION_TEMPLATES.filter((t) => t.id === id)) : [];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Inicio" subtitle={subtitle} action={primaryAction} />

      <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-8 pt-2 sm:px-8">
        {needsSetup && (
          <Card tone="dark" className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between" data-setup-prompt>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Configura tu negocio en 1 minuto</h2>
              <p className="mt-1 text-sm text-mist">
                {canSetup
                  ? 'Cuéntanos qué haces y ordenamos el menú, el inicio y los primeros pasos a tu medida.'
                  : 'Un owner o admin de este negocio puede configurarlo para adaptar el CRM.'}
              </p>
            </div>
            {canSetup && (
              <Link href="/bienvenida" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-lime px-4 text-sm font-semibold text-carbon">
                Empezar <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </Card>
        )}

        {checklist && !checklist.done && (
          <ChecklistCard items={checklist.items} completed={checklist.completed} actionable={checklist.actionable} />
        )}

        {recommended.length > 0 && (
          <Card className="p-5" data-recommended-templates>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold text-carbon">Automatizaciones recomendadas para {preset.label.toLowerCase()}</h2>
              <Link href="/automatizaciones/nueva" className="text-xs font-semibold text-electric">Ver todas las plantillas</Link>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {recommended.map((t) => (
                <Link key={t.id} href={`/automatizaciones/nueva?plantilla=${t.id}`} className="rounded-xl border border-line p-3 transition-colors hover:border-stone">
                  <p className="text-sm font-semibold text-carbon">{t.name}</p>
                  <p className="mt-1 text-xs text-soft">{t.description}</p>
                </Link>
              ))}
            </div>
          </Card>
        )}

        <DashboardToolbar
          available={dashboard.available.map((widget) => ({ id: widget.id, title: widget.title, locked: widget.locked }))}
          customized={!dashboard.fromPreset}
        />

        {dashboard.widgets.length === 0 ? (
          <Card className="p-8 text-center text-sm text-soft">Ocultaste todos los widgets. Usa “Agregar widget” para volver a verlos.</Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {dashboard.widgets.map((widget, index) => (
              <WidgetCard
                key={widget.id}
                widget={widget}
                currency={dashboard.currency}
                first={index === 0}
                last={index === dashboard.widgets.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
