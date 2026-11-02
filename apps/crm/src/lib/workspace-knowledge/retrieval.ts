import { Prisma } from '../../../generated/prisma/client';
import { KNOWLEDGE_LIMITS, normalizeKnowledgeText } from './rules';

export type RetrievedKnowledgeChunk = {
  id: string;
  sourceId: string;
  sourceType: string;
  title: string;
  content: string;
  rank: number;
};

/** Palabras sin carga semántica: con OR harían que casi todo coincida. */
const STOPWORDS = new Set([
  'que', 'cual', 'cuales', 'como', 'cuando', 'donde', 'quien', 'para', 'por', 'con', 'sin', 'los', 'las', 'del',
  'una', 'uno', 'unos', 'unas', 'este', 'esta', 'esto', 'ese', 'esa', 'son', 'hay', 'tiene', 'tienen', 'tienes',
  'puedo', 'puede', 'quiero', 'hola', 'gracias', 'favor', 'sus', 'mis', 'tus', 'mas', 'pero', 'muy',
]);

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Términos de búsqueda en minúscula, sin tildes y sin stopwords. */
export function queryTerms(value: string) {
  const words = fold(normalizeKnowledgeText(value).toLocaleLowerCase('es')).match(/[a-z0-9ñ]{3,}/g) ?? [];
  return [...new Set(words.filter((word) => !STOPWORDS.has(word)))].slice(0, 24);
}

/**
 * tsquery OR con cada término y su prefijo: `simple` no quita tildes, así que
 * "ubicacion" se busca también como prefijo "ubicaci:*", que cubre "ubicación".
 * Solo entran caracteres [a-z0-9ñ]: nada del lead llega como sintaxis tsquery.
 */
export function buildTsQuery(terms: string[]) {
  const parts = terms.flatMap((term) => {
    const stem = term.replace(/[aeiou]?n?$/, '');
    return stem.length >= 4 && stem !== term ? [term, `${stem}:*`] : [term];
  });
  return [...new Set(parts)].join(' | ');
}

export function lexicalScore(terms: string[], title: string, content: string) {
  if (!terms.length) return 0;
  const haystack = fold(`${title} ${content}`.toLocaleLowerCase('es'));
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0) / terms.length;
}

export async function retrieveWorkspaceKnowledge(workspaceId: string, rawQuery: string, limits = KNOWLEDGE_LIMITS) {
  const terms = queryTerms(rawQuery.slice(0, 1_000));
  if (!terms.length) return [] as RetrievedKnowledgeChunk[];

  // Import diferido: las funciones puras de este módulo se prueban sin base de datos.
  const { prisma } = await import('../prisma');
  const fts = await prisma.$queryRaw<RetrievedKnowledgeChunk[]>(Prisma.sql`
    SELECT kc.id,
           kc.source_id AS "sourceId",
           ks.type::text AS "sourceType",
           ks.title,
           kc.content,
           ts_rank_cd(kc.search_vector, to_tsquery('simple', ${buildTsQuery(terms)}))::float8 AS rank
      FROM knowledge_chunks kc
      JOIN knowledge_sources ks
        ON ks.id = kc.source_id AND ks.workspace_id = kc.workspace_id
     WHERE kc.workspace_id = ${workspaceId}
       AND ks.workspace_id = ${workspaceId}
       AND ks.is_active = true
       AND ks.status = 'READY'
       AND kc.search_vector @@ to_tsquery('simple', ${buildTsQuery(terms)})
     ORDER BY rank DESC, ks.updated_at DESC, kc.position ASC
     LIMIT ${limits.retrievalChunks * 3}
  `);

  // El índice no pliega tildes en el contenido ("envío" vs "envio"): se
  // complementa con una pasada léxica acotada sobre los fragmentos recientes.
  let candidates = fts;
  if (fts.length < limits.retrievalChunks) {
    const known = new Set(fts.map((row) => row.id));
    const lexical = await prisma.knowledgeChunk.findMany({
      where: { workspaceId, source: { workspaceId, isActive: true, status: 'READY' } },
      select: { id: true, sourceId: true, content: true, source: { select: { type: true, title: true } } },
      orderBy: [{ source: { updatedAt: 'desc' } }, { position: 'asc' }],
      take: 200,
    });
    candidates = [
      ...fts,
      ...lexical
        .filter((row) => !known.has(row.id))
        .map((row) => ({
          id: row.id, sourceId: row.sourceId, sourceType: row.source.type, title: row.source.title,
          content: row.content, rank: lexicalScore(terms, row.source.title, row.content) / 10,
        }))
        .filter((row) => row.rank > 0)
        .sort((a, b) => b.rank - a.rank),
    ];
  }

  const result: RetrievedKnowledgeChunk[] = [];
  const seen = new Set<string>();
  let chars = 0;
  for (const item of candidates) {
    const fingerprint = normalizeKnowledgeText(item.content).toLocaleLowerCase('es');
    if (seen.has(fingerprint)) continue;
    if (result.length >= limits.retrievalChunks || chars + item.content.length > limits.retrievalChars) break;
    seen.add(fingerprint);
    result.push(item);
    chars += item.content.length;
  }
  return result;
}

/** Sin consulta útil (p. ej. la tool sin texto): los fragmentos más recientes, con los mismos topes. */
export async function recentWorkspaceKnowledge(workspaceId: string, limits = KNOWLEDGE_LIMITS) {
  const { prisma } = await import('../prisma');
  const rows = await prisma.knowledgeChunk.findMany({
    where: { workspaceId, source: { workspaceId, isActive: true, status: 'READY' } },
    select: { id: true, sourceId: true, content: true, source: { select: { type: true, title: true } } },
    orderBy: [{ source: { updatedAt: 'desc' } }, { position: 'asc' }],
    take: limits.retrievalChunks,
  });
  const result: RetrievedKnowledgeChunk[] = [];
  let chars = 0;
  for (const row of rows) {
    if (chars + row.content.length > limits.retrievalChars) break;
    result.push({ id: row.id, sourceId: row.sourceId, sourceType: row.source.type, title: row.source.title, content: row.content, rank: 0 });
    chars += row.content.length;
  }
  return result;
}
