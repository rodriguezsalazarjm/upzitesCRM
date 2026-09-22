import { Header } from '@/components/layout/header';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { prisma } from '@/lib/prisma';
import { ALL_TOOL_NAMES } from '@/lib/agents/tools';
import { isLocalDemo } from '@/lib/testing/local-mode';
import { AgentSettings } from '@/components/agents/agent-settings';

export default async function Page() {
  const user = await requireCurrentUser();
  const agent = await prisma.agentDefinition.findFirst({
    where: { workspaceId: user.workspace.id, key: 'SALES' },
    select: {
      id: true,
      name: true,
      isActive: true,
      versions: {
        orderBy: { version: 'desc' },
        select: { id: true, version: true, status: true, instructions: true, allowedTools: true, options: true, maxSteps: true },
      },
    },
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="IA · Agente"
        subtitle="Rol, tono y herramientas del agente de ventas"
        action={{ label: 'Administrar conocimiento', href: '/ia/conocimiento' }}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-2 sm:px-8">
        <AgentSettings
          agent={agent}
          tools={ALL_TOOL_NAMES}
          canManage={canManageChannels(user.role)}
          canPublish={user.role === 'OWNER'}
          demo={isLocalDemo()}
        />
      </div>
    </div>
  );
}
