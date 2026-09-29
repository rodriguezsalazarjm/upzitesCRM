import { TutorialHint } from '@/components/tutorials/tutorial-hint';
import { getOpportunities, getPipelineStages } from '@/lib/crm-data';
import { OportunidadesClient } from './oportunidades-client';

export const dynamic = 'force-dynamic';

export default async function OportunidadesPage() {
  const [opportunities, stages] = await Promise.all([getOpportunities(), getPipelineStages()]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TutorialHint tutorialKey="pipeline.first_visit" className="mx-4 mt-3 shrink-0 sm:mx-8" />
      <div className="min-h-0 flex-1">
        <OportunidadesClient opportunities={opportunities} stages={stages} />
      </div>
    </div>
  );
}
