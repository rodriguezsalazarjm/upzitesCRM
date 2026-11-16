import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canManageAutomations } from '@/lib/automations/roles';
import { editorData } from '@/lib/automations/editor-data';
import { FlowBuilder } from '@/components/automations/flow-builder';
import { FlowRuns } from '@/components/automations/flow-runs';
import type { FlowGraph } from '@/lib/automations/schema';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser(); const { id } = await params;
  const flow = await prisma.automationFlow.findFirst({ where: { id, workspaceId: user.workspace.id }, include: { versions: { orderBy: { version: 'desc' } }, runs: { orderBy: { startedAt: 'desc' }, take: 40, include: { contact: { select: { firstName: true, lastName: true } }, flowVersion: { select: { trigger: true } } } } } });
  if (!flow || !flow.versions[0]) notFound();
  const v = flow.versions[0];
  return <div className="h-full overflow-y-auto p-4 md:p-6"><div className="mb-4 flex min-h-10 items-center justify-between pl-12 md:pl-0"><Link href="/automatizaciones" className="text-sm text-indigo-600">← Mis automatizaciones</Link><Link href="/integraciones" className="text-sm text-indigo-600">Canales / demo</Link></div>
    <FlowBuilder flowId={id} name={flow.name} channel={flow.channelScope[0] ?? 'INSTAGRAM'} graph={{ trigger: v.trigger, nodes: v.nodes, edges: v.edges } as FlowGraph} version={{ id: v.id, status: v.status, updatedAt: v.updatedAt.toISOString(), version: v.version }} {...await editorData(user.workspace.id)} canManage={canManageAutomations(user.role)} />
    <FlowRuns versions={flow.versions} runs={flow.runs} />
  </div>;
}
