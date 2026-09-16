import { prisma } from '../prisma';
/** Catalogs are read on every call, never copied into stale knowledge documents. */
export async function searchKnowledge(workspaceId: string, query = '') {
  return prisma.knowledgeSource.findMany({ where: { workspaceId, isActive: true, ...(query ? { OR: [{ title: { contains: query, mode: 'insensitive' as const } }, { content: { contains: query, mode: 'insensitive' as const } }] } : {}) }, select: { id: true, type: true, title: true, content: true }, orderBy: { updatedAt: 'desc' }, take: 20 });
}
