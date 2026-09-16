import Link from 'next/link';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { prisma } from '@/lib/prisma';
import { ALL_TOOL_NAMES } from '@/lib/agents/tools';
import { isLocalDemo } from '@/lib/testing/local-mode';
import { AgentSettings } from '@/components/agents/agent-settings';
export default async function Page() {
  const user = await requireCurrentUser();
  const agent = await prisma.agentDefinition.findFirst({ where: { workspaceId: user.workspace.id, key: 'SALES' }, select: { id: true, name: true, isActive: true, versions: { orderBy: { version: 'desc' }, select: { id: true, version: true, status: true, instructions: true, allowedTools: true, options: true, maxSteps: true } } } });
  return <div className="h-full space-y-6 overflow-y-auto p-4 md:p-8"><h1 className="text-2xl font-bold">IA · Agente</h1><Link href="/ia/conocimiento" className="text-sm text-indigo-600">Administrar conocimiento →</Link><AgentSettings agent={agent} tools={ALL_TOOL_NAMES} canManage={canManageChannels(user.role)} canPublish={user.role === 'OWNER'} demo={isLocalDemo()} /></div>;
}
