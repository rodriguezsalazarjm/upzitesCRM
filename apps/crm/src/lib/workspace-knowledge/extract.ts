import { extractText, getDocumentProxy } from 'unpdf';
import { KNOWLEDGE_LIMITS, normalizeKnowledgeText } from './rules';

export async function extractPdfText(bytes: Uint8Array) {
  const pdf = await Promise.race([
    getDocumentProxy(bytes, { maxImageSize: 16_777_216 }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('El PDF tardó demasiado en procesarse.')), 10_000)),
  ]);
  if (pdf.numPages > KNOWLEDGE_LIMITS.maxPdfPages) throw new Error(`El PDF supera el límite de ${KNOWLEDGE_LIMITS.maxPdfPages} páginas.`);
  const result = await Promise.race([
    extractText(pdf, { mergePages: true }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('La extracción del PDF excedió el tiempo permitido.')), 12_000)),
  ]);
  const text = normalizeKnowledgeText(Array.isArray(result.text) ? result.text.join('\n') : result.text);
  if (text.length < 20) throw new Error('No se detectó texto extraíble en el PDF.');
  return { text: text.slice(0, KNOWLEDGE_LIMITS.extractedText), metadata: { pages: result.totalPages } };
}
