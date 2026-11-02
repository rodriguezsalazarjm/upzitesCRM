import { prisma } from '../prisma';
import { buildStructuredWorkspaceContext, loadWorkspaceProfileForContext } from '../workspace-knowledge/context';
import { queryTerms, recentWorkspaceKnowledge, retrieveWorkspaceKnowledge } from '../workspace-knowledge/retrieval';

/**
 * Catalogs are read on every call, never copied into stale knowledge documents.
 * Las fuentes devuelven fragmentos acotados (nunca el documento entero) y van
 * marcadas como contenido no confiable: un PDF o una página pueden traer texto
 * que intente dar órdenes al agente.
 */
export async function searchKnowledge(workspaceId: string, query = '') {
  const chunks = queryTerms(query).length ? await retrieveWorkspaceKnowledge(workspaceId, query) : await recentWorkspaceKnowledge(workspaceId);
  return {
    trust: 'UNTRUSTED_REFERENCE_ONLY',
    results: chunks.map((chunk) => ({ sourceId: chunk.sourceId, type: chunk.sourceType, title: chunk.title, excerpt: chunk.content })),
  };
}

export async function getBusinessInfo(workspaceId: string) {
  const [profile, sources] = await Promise.all([
    loadWorkspaceProfileForContext(workspaceId),
    prisma.knowledgeSource.findMany({
      where: { workspaceId, isActive: true, status: 'READY' },
      select: { id: true, type: true, title: true },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    }),
  ]);
  return {
    profile: buildStructuredWorkspaceContext(profile) || 'Sin perfil del negocio configurado.',
    sources,
    hint: 'Usa searchKnowledge con una consulta concreta para leer el contenido de las fuentes.',
  };
}
