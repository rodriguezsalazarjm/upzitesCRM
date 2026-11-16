import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { requireCurrentUser } from '@/lib/auth';
import { canManageAutomations } from '@/lib/automations/roles';
import { editorData } from '@/lib/automations/editor-data';
import { NewFlow } from '@/components/automations/new-flow';
import { getWorkspaceExperience } from '@/lib/workspace-experience';

export default async function Page({ searchParams }: { searchParams: Promise<{ plantilla?: string }> }) {
  const user = await requireCurrentUser();
  const { plantilla } = await searchParams;
  const { preset } = (await getWorkspaceExperience({ workspaceId: user.workspace.id, userId: user.id, role: user.role })).preset;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Nueva automatización" subtitle="Elige cómo quieres empezar: desde cero, rápida o con una plantilla" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-2 sm:px-8">
        <Button variant="ghost" size="sm" className="mb-4" asChild>
          <Link href="/automatizaciones">
            <ArrowLeft aria-hidden />
            Mis automatizaciones
          </Link>
        </Button>

        {canManageAutomations(user.role) ? (
          <NewFlow {...await editorData(user.workspace.id)} recommended={preset.recommendedTemplates} initialTemplateId={plantilla} />
        ) : (
          <p className="text-sm text-soft">Solo owner/admin pueden crear automatizaciones.</p>
        )}
      </div>
    </div>
  );
}
