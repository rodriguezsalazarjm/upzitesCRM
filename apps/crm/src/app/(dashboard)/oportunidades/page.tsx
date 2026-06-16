import { getOpportunities, getPipelineStages } from '@/lib/crm-data';
import { OportunidadesClient } from './oportunidades-client';

export const dynamic = 'force-dynamic';

export default async function OportunidadesPage() {
  const [opportunities, stages] = await Promise.all([getOpportunities(), getPipelineStages()]);

  return <OportunidadesClient opportunities={opportunities} stages={stages} />;
}
