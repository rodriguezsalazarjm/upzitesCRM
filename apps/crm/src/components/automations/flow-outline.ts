import type { FlowNode } from '@/lib/automations/schema';

/**
 * Outline topológico del grafo, para el viewer mobile (<768px). Puramente
 * derivado de `nodes`/`edges` ya existentes — mismo dato que ya consume
 * `graph()` en flow-builder.tsx, sin ninguna regla nueva.
 *
 * Por qué no es una lista lineal: el grafo puede ramificar (CONDITION
 * true/false, RANDOM_SPLIT) y esas ramas pueden RECONVERGER en un nodo común
 * (p.ej. ambas ramas de una condición terminan en el mismo "Fin"). Un árbol
 * estricto duplicaría ese nodo o perdería su identidad; en su lugar, cuando
 * el recorrido vuelve a un nodo ya visitado se corta con una referencia
 * ("continúa en: <título>") en vez de re-renderizar el subárbol. Mismo
 * mecanismo protege contra ciclos (el grafo puede tener uno temporalmente
 * mientras se edita, antes de Validar).
 */
export type OutlineEntry =
  | { kind: 'node'; id: string; step: FlowNode; branchLabel?: string; children: OutlineEntry[] }
  | { kind: 'ref'; id: string; step: FlowNode; branchLabel?: string };

type OutlineNodeInput = { id: string; step: FlowNode };
type OutlineEdgeInput = { source: string; target: string; branch?: string };

export function buildFlowOutline(
  nodes: OutlineNodeInput[],
  edges: OutlineEdgeInput[],
  entryId: string | undefined,
): { root: OutlineEntry | null; orphans: FlowNode[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, OutlineEdgeInput[]>();
  for (const edge of edges) {
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source)!.push(edge);
  }

  const visited = new Set<string>();
  function visit(id: string, branchLabel?: string): OutlineEntry | null {
    const input = byId.get(id);
    if (!input) return null;
    if (visited.has(id)) return { kind: 'ref', id, step: input.step, branchLabel };
    visited.add(id);
    const children = (outgoing.get(id) ?? [])
      .map((edge) => visit(edge.target, edge.branch))
      .filter((entry): entry is OutlineEntry => entry !== null);
    return { kind: 'node', id, step: input.step, branchLabel, children };
  }

  const root = entryId && byId.has(entryId) ? visit(entryId) : null;
  const orphans = nodes.filter((n) => !visited.has(n.id)).map((n) => n.step);
  return { root, orphans };
}
