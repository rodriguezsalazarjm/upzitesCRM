import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { requireCurrentUser } from '@/lib/auth';
import { canManageAutomations } from '@/lib/automations/roles';
import { editorData } from '@/lib/automations/editor-data';
import { NewFlow } from '@/components/automations/new-flow';

export default async function Page() {
  const user = await requireCurrentUser();

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
          <NewFlow {...await editorData(user.workspace.id)} />
        ) : (
          <p className="text-sm text-soft">Solo owner/admin pueden crear automatizaciones.</p>
        )}
      </div>
    </div>
  );
}
