import { NuevaOportunidadForm } from './nueva-oportunidad-form';
import { getContacts, getPipelineStages } from '@/lib/crm-data';

export const dynamic = 'force-dynamic';

export default async function NuevaOportunidadPage() {
  const [contacts, stages] = await Promise.all([getContacts(), getPipelineStages()]);

  return <NuevaOportunidadForm contacts={contacts} stages={stages} />;
}
