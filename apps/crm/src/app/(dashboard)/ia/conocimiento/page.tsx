import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { prisma } from '@/lib/prisma';
import { KnowledgeManager } from '@/components/agents/knowledge-manager';

export default async function Page() {
  const user = await requireCurrentUser();
  const sources = await prisma.knowledgeSource.findMany({
    where: { workspaceId: user.workspace.id },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, type: true, title: true, content: true, isActive: true },
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="IA · Conocimiento" subtitle="Fuentes estructuradas de este negocio" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-2 sm:px-8">
        <p className="mb-1 text-sm text-soft">
          Los precios y servicios se consultan desde sus catálogos actuales.
        </p>
        <nav className="mb-5 flex flex-wrap gap-4 text-sm font-semibold">
          <Link href="/productos" className="text-electric hover:text-electric-strong">
            Productos
          </Link>
          <Link href="/cotizaciones" className="text-electric hover:text-electric-strong">
            Servicios
          </Link>
          <Link href="/ia/agente" className="text-electric hover:text-electric-strong">
            Configurar agente
          </Link>
        </nav>
        <KnowledgeManager sources={sources} canManage={canManageChannels(user.role)} />
      </div>
    </div>
  );
}
