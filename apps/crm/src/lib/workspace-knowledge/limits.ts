/** Límites del Punto 5. Módulo puro: lo importan también componentes cliente. */
export const KNOWLEDGE_LIMITS = {
  profileText: 4_000,
  faqCount: 30,
  faqItem: 1_000,
  sourceTitle: 200,
  manualText: 120_000,
  extractedText: 500_000,
  /** El archivo viaja en el cuerpo de la request: Vercel corta en 4,5 MB. */
  fileBytes: 4 * 1024 * 1024,
  maxPdfPages: 100,
  chunkChars: 1_200,
  chunkOverlap: 160,
  maxChunksPerSource: 400,
  retrievalChunks: 5,
  retrievalChars: 6_000,
} as const;
