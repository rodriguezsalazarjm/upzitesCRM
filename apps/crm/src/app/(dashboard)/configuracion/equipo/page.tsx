import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { TutorialHint } from '@/components/tutorials/tutorial-hint';
import { requireCurrentUser } from '@/lib/auth';
import { PLAN_CATALOG } from '@/lib/billing/plan-catalog';
import { getTeamView } from '@/lib/team/service';
import { TeamClient } from './team-client';

export const dynamic = 'force-dynamic';

/**
 * Equipo del workspace (P0-F). Todos los miembros lo ven; las acciones que
 * aparecen dependen del rol, pero cada una se vuelve a autorizar en el
 * servidor (lib/team).
 */
export default async function TeamPage() {
  const user = await requireCurrentUser();
  const view = await getTeamView({ userId: user.id, role: user.role, workspaceId: user.workspace.id });
  const requiredPlanName = view.seats.requiredPlan ? PLAN_CATALOG[view.seats.requiredPlan].name : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header title="Equipo" subtitle={user.workspace.name} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 sm:px-6 xl:px-8">
          <Link href="/configuracion" className="inline-flex items-center gap-1 text-sm font-medium text-soft hover:text-carbon">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Configuración
          </Link>
          <TutorialHint tutorialKey="team.first_visit" />
          <TeamClient
            view={JSON.parse(JSON.stringify(view))}
            requiredPlanName={requiredPlanName}
          />
        </div>
      </div>
    </div>
  );
}
