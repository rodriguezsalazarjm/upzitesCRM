import { requireCurrentUser } from '@/lib/auth';
import { canManageAutomations } from '@/lib/automations/roles';
import { editorData } from '@/lib/automations/editor-data';
import { NewFlow } from '@/components/automations/new-flow';
import Link from 'next/link';
export default async function Page() {
  const user = await requireCurrentUser();
  if (!canManageAutomations(user.role)) return <p className="p-6">Solo owner/admin pueden crear automatizaciones.</p>;
  return <div className="h-full overflow-y-auto p-4 md:p-8"><Link href="/automatizaciones" className="text-sm text-indigo-600">← Mis automatizaciones</Link><h1 className="my-6 text-2xl font-bold">Nueva automatización</h1><NewFlow {...await editorData(user.workspace.id)} /></div>;
}
