import Link from 'next/link';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { prisma } from '@/lib/prisma';
import { KnowledgeManager } from '@/components/agents/knowledge-manager';
export default async function Page() {
  const user = await requireCurrentUser();
  const sources = await prisma.knowledgeSource.findMany({ where: { workspaceId: user.workspace.id }, orderBy: { updatedAt: 'desc' }, select: { id: true, type: true, title: true, content: true, isActive: true } });
  return <div className="h-full space-y-6 overflow-y-auto p-4 md:p-8"><h1 className="text-2xl font-bold">IA · Conocimiento</h1><p className="text-sm text-slate-500">Fuentes estructuradas de este negocio. Los precios y servicios se consultan desde sus catálogos actuales.</p><nav className="flex gap-4 text-sm text-indigo-600"><Link href="/productos">Productos</Link><Link href="/cotizaciones">Servicios</Link><Link href="/ia/agente">Configurar agente</Link></nav><KnowledgeManager sources={sources} canManage={canManageChannels(user.role)} /></div>;
}
