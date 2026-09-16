import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canManageAutomations } from '@/lib/automations/roles';
import { editorData } from '@/lib/automations/editor-data';
import { FlowBuilder } from '@/components/automations/flow-builder';
import type { FlowGraph } from '@/lib/automations/schema';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser(); const { id } = await params;
  const flow = await prisma.automationFlow.findFirst({ where: { id, workspaceId: user.workspace.id }, include: { versions: { orderBy: { version: 'desc' } }, runs: { orderBy: { startedAt: 'desc' }, take: 40, include: { contact: { select: { firstName: true, lastName: true } }, flowVersion: { select: { trigger: true } } } } } });
  if (!flow || !flow.versions[0]) notFound();
  const v = flow.versions[0];
  const counts = await prisma.automationFlowRun.groupBy({ by: ['status'], where: { workspaceId: user.workspace.id, flowId: id }, _count: true });
  const total = (key: 'checkoutsCreated' | 'handoffs') => flow.versions.reduce((n, v) => n + v[key], 0);
  return <div className="h-full overflow-y-auto p-4 md:p-6"><div className="mb-4 flex justify-between"><Link href="/automatizaciones" className="text-sm text-indigo-600">← Mis automatizaciones</Link><Link href="/integraciones" className="text-sm text-indigo-600">Canales / demo</Link></div>
    <FlowBuilder flowId={id} name={flow.name} channel={flow.channelScope[0] ?? 'INSTAGRAM'} graph={{ trigger: v.trigger, nodes: v.nodes, edges: v.edges } as FlowGraph} version={{ id: v.id, status: v.status, updatedAt: v.updatedAt.toISOString(), version: v.version }} {...await editorData(user.workspace.id)} canManage={canManageAutomations(user.role)} />
    <section className="mt-8"><h2 className="text-xl font-semibold">Ejecuciones recientes</h2><div className="my-4 flex flex-wrap gap-3 text-sm">{counts.map(c => <span key={c.status} className="rounded border bg-white p-3">{c.status}: {c._count}</span>)}<span className="rounded border bg-white p-3">Checkout: {total('checkoutsCreated')} · Handoff: {total('handoffs')}</span></div>
      {!flow.runs.length && <p className="text-sm text-slate-500">Aún no hay ejecuciones. Publica y dispara un evento desde el canal demo.</p>}
      <div className="space-y-2">{flow.runs.map(run => <details key={run.id} className="rounded-lg border bg-white p-4"><summary className="cursor-pointer text-sm">{run.contact?.firstName ?? 'Sin contacto'} {run.contact?.lastName} · {run.channel} · {(run.flowVersion.trigger as { type?: string }).type} · {run.status} · {run.startedAt.toLocaleString('es-CL')}</summary><div className="mt-3 space-y-2 text-xs"><p>Run: {run.id}</p><p>Paso actual: {run.currentNodeId ?? '—'} · Pasos: {run.stepsExecuted}</p><p>Fin: {run.endedAt?.toISOString() ?? '—'} · Espera: {run.waitingUntil?.toISOString() ?? '—'}</p>{run.error && <p className="text-red-700">{run.error}</p>}<pre className="max-h-72 overflow-auto rounded bg-slate-50 p-3">{JSON.stringify(run.state, null, 2)}</pre></div></details>)}</div>
    </section>
  </div>;
}
