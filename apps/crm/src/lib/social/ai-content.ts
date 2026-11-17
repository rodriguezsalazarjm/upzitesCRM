import { z } from 'zod';
import { defaultModel, ModelProviderError, OpenAIProvider, type CompleteInput, type ModelProvider } from '../agents/provider';
import { checkAiCredits, recordAiCredits } from '../entitlements/ai-credits';
import { prisma } from '../prisma';
import { isLocalDemo } from '../testing/local-mode';
import { loadWorkspaceKnowledgeLayer } from '../workspace-knowledge/context';
import { CONTENT_TASKS, CONTENT_TONES, type ContentSuggestion, type ContentTask } from './content-tasks';
import { composeCaption } from './publisher';

export { CONTENT_TASKS, CONTENT_TONES, type ContentSuggestion, type ContentTask };

/**
 * P23: IA para contenido. Asiste, no publica: devuelve sugerencias que el
 * usuario revisa, edita y guarda como borrador (o programa) en Flow.
 */

const TASK_BRIEF: Record<ContentTask, string> = {
  variants: 'Escribe exactamente 2 sugerencias del MISMO contenido base: una para INSTAGRAM (texto más desarrollado, hashtags al final) y otra para TIKTOK (gancho fuerte en la primera línea, frases cortas, pensado para video vertical, formato REEL).',
  ideas: 'Propón 5 ideas de publicaciones distintas para este negocio. En "text" describe la pieza en una o dos frases.',
  hooks: 'Propón 5 ganchos distintos para la primera línea del contenido base. "text" es solo el gancho.',
  captions: 'Escribe 3 textos completos listos para publicar a partir del contenido base.',
  cta: 'Propón 5 llamados a la acción distintos para cerrar el contenido base. "text" es solo el llamado.',
  hashtags: 'Propón 3 juegos de hashtags (entre 5 y 15 cada uno) para el contenido base. "text" explica en una frase para qué sirve cada juego.',
  variations: 'Escribe 3 variaciones del contenido base que digan lo mismo con otras palabras.',
  adapt_tiktok: 'Adapta el contenido base a TikTok: 2 sugerencias con red TIKTOK, formato REEL, gancho en la primera línea y frases cortas.',
  calendar: 'Propón un calendario de 6 publicaciones para las próximas 2 semanas (campo "date", días distintos, a partir de mañana), mezclando formatos y redes.',
  pillars: 'Propón 4 pilares de contenido para este negocio. "title" es el pilar; "text" explica qué publicar en él y un ejemplo.',
  rewrite_tone: 'Reescribe el contenido base con el tono pedido: 2 versiones.',
  gaps: 'Mira la mezcla de publicaciones recientes y propone 3 piezas del tipo que falta (formato, red o tema poco usado). En "note" explica qué falta.',
};

const RULES = `Eres un asistente de contenido para redes sociales de un negocio. Ayudas a crear, el usuario decide.
- Escribe en español, natural, sin inventar precios, descuentos, garantías, testimonios ni datos que no estén en el contexto.
- Instagram y TikTok: máximo 2200 caracteres por texto y máximo 30 hashtags.
- Los hashtags van SOLO en el campo "hashtags", sin el signo #, sin espacios.
- Responde SOLO con JSON válido, sin texto antes ni después, con esta forma:
{"suggestions":[{"network":"INSTAGRAM|TIKTOK","format":"IMAGE|REEL","title":"","hook":"","text":"","cta":"","hashtags":[],"date":"YYYY-MM-DD o vacío","note":""}]}
- "text" es el texto completo listo para publicar (incluye el gancho al inicio y el llamado al final cuando aplique).`;

export const generateInputSchema = z.object({
  task: z.enum(Object.keys(CONTENT_TASKS) as [ContentTask, ...ContentTask[]]),
  tone: z.enum(CONTENT_TONES).optional(),
  brief: z.string().trim().max(500).default(''),
  sourceText: z.string().max(2200).default(''),
  hashtags: z.array(z.string().max(80)).max(30).default([]),
  contentAssetId: z.string().min(1).optional(),
});
export type GenerateInput = z.input<typeof generateInputSchema>;


const HASHTAG = /^[\p{L}\p{N}_]{1,80}$/u;
const suggestionSchema = z.object({
  network: z.string().optional(),
  format: z.string().optional(),
  title: z.string().max(200).optional(),
  hook: z.string().max(500).optional(),
  text: z.string().max(5000).optional(),
  cta: z.string().max(500).optional(),
  hashtags: z.array(z.string()).optional(),
  date: z.string().optional(),
  note: z.string().max(500).optional(),
});

/**
 * Pura: valida la respuesta del modelo. Nunca confía en ella: descarta lo que
 * no cumple, limpia hashtags y aplica los límites de las redes.
 */
export function parseSuggestions(raw: string | null, today: string): ContentSuggestion[] {
  if (!raw) return [];
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let json: unknown;
  try {
    json = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = (json as { suggestions?: unknown })?.suggestions;
  if (!Array.isArray(list)) return [];
  const out: ContentSuggestion[] = [];
  for (const item of list.slice(0, 8)) {
    const parsed = suggestionSchema.safeParse(item);
    if (!parsed.success) continue;
    const s = parsed.data;
    const text = (s.text ?? '').trim();
    if (!text) continue;
    const hashtags = [...new Set((s.hashtags ?? []).map((t) => t.trim().replace(/^#+/, '')).filter((t) => HASHTAG.test(t)))].slice(0, 30);
    if (composeCaption(text, hashtags).length > 2200) continue;
    const date = s.date && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && !Number.isNaN(Date.parse(s.date)) && s.date >= today ? s.date : null;
    out.push({
      network: s.network?.toUpperCase() === 'TIKTOK' ? 'TIKTOK' : 'INSTAGRAM',
      format: s.format?.toUpperCase() === 'REEL' || s.network?.toUpperCase() === 'TIKTOK' ? 'REEL' : 'IMAGE',
      title: (s.title ?? '').trim(),
      hook: (s.hook ?? '').trim(),
      text,
      cta: (s.cta ?? '').trim(),
      hashtags,
      date,
      note: (s.note ?? '').trim(),
    });
  }
  return out;
}

/** Pura: resumen de la mezcla reciente, para "qué falta" y el calendario. */
export function contentMix(posts: { network: string; mediaType: string; status: string }[]) {
  const count = (fn: (p: (typeof posts)[number]) => boolean) => posts.filter(fn).length;
  return {
    total: posts.length,
    instagram: count((p) => p.network === 'INSTAGRAM'),
    tiktok: count((p) => p.network === 'TIKTOK'),
    reels: count((p) => p.mediaType === 'REEL'),
    images: count((p) => p.mediaType === 'IMAGE'),
    published: count((p) => p.status === 'PUBLISHED'),
  };
}

let providerOverride: ModelProvider | null = null;
/** Solo para pruebas: fija el proveedor (guionado). */
export function setContentProviderForTests(provider: ModelProvider | null) {
  providerOverride = provider;
}

/** Proveedor determinista del modo local (QA visual, sin red). */
class LocalContentProvider implements ModelProvider {
  readonly name = 'local-fake';
  async complete(input: CompleteInput) {
    const task = input.instructions.match(/\[TAREA\] (\w+)/)?.[1] as ContentTask;
    const base = input.instructions.match(/\[CONTENIDO BASE\]\n([^\n]*)/)?.[1]?.trim() || 'Un mensaje para empezar el día con calma';
    const mix = input.instructions.match(/reels=(\d+) imagenes=(\d+) tiktok=(\d+)/);
    const tags = ['contenido', 'comunidad'];
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    const ig = { network: 'INSTAGRAM', format: 'IMAGE', hook: base, text: `${base}\n\nGuárdalo para leerlo con calma.`, cta: 'Guárdalo para leerlo con calma.', hashtags: tags };
    const tt = { network: 'TIKTOK', format: 'REEL', hook: '¿Te pasa esto cada mañana?', text: `¿Te pasa esto cada mañana?\n${base}\nSígueme para más.`, cta: 'Sígueme para más.', hashtags: ['parati', ...tags] };
    const suggestions =
      task === 'variants' || task === 'adapt_tiktok' ? [ig, tt].filter((s) => task === 'variants' || s.network === 'TIKTOK')
      : task === 'calendar' ? [1, 3, 5, 8, 10, 12].map((n, i) => ({ ...(i % 2 ? tt : ig), title: `Pieza ${i + 1}`, date: day(n) }))
      : task === 'gaps' ? [{ ...(mix && Number(mix[1]) <= Number(mix[2]) ? tt : ig), title: 'Más video vertical', note: `Hay ${mix?.[1] ?? 0} reels y ${mix?.[2] ?? 0} imágenes: falta video.` }]
      : [1, 2, 3].map((n) => ({ ...ig, title: `${CONTENT_TASKS[task] ?? 'Sugerencia'} ${n}`, text: `${base} (${n})` }));
    return { text: JSON.stringify({ suggestions }), toolCalls: [], inputTokens: 0, outputTokens: 0 };
  }
}

function provider(): ModelProvider {
  if (providerOverride) return providerOverride;
  return isLocalDemo() ? new LocalContentProvider() : new OpenAIProvider();
}

export class ContentAiError extends Error {}

export async function generateContentSuggestions(workspaceId: string, raw: GenerateInput, now = new Date()) {
  const input = generateInputSchema.parse(raw);
  const credits = await checkAiCredits(workspaceId, { now });
  if (!credits.allowed) throw new ContentAiError(credits.reason === 'NO_AI_IN_PLAN' ? 'Tu plan no incluye IA.' : 'No quedan créditos de IA este mes.');

  const [workspace, asset, recent] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } }),
    input.contentAssetId ? prisma.contentAsset.findFirst({ where: { id: input.contentAssetId, workspaceId }, select: { name: true, kind: true, caption: true, tags: true, collection: true } }) : null,
    prisma.socialPost.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 30, select: { network: true, mediaType: true, status: true, caption: true } }),
  ]);
  if (input.contentAssetId && !asset) throw new ContentAiError('La pieza de la biblioteca no existe en este negocio.');

  const baseText = input.sourceText.trim() || asset?.caption || '';
  const knowledge = await loadWorkspaceKnowledgeLayer(workspaceId, [baseText, input.brief].filter(Boolean).join(' ') || (workspace?.name ?? 'contenido'));
  const mix = contentMix(recent);
  const instructions = [
    RULES,
    `Negocio: ${workspace?.name ?? 'el negocio'}. Hoy es ${now.toISOString().slice(0, 10)}.`,
    knowledge.content && `[CONTEXTO DEL NEGOCIO]\n${knowledge.content}`,
    `[TAREA] ${input.task}\n${TASK_BRIEF[input.task]}`,
    input.tone && `Tono pedido: ${input.tone}.`,
    `[CONTENIDO BASE]\n${baseText.replace(/\n+/g, ' ')}${input.hashtags.length ? `\nHashtags actuales: ${input.hashtags.join(' ')}` : ''}`,
    asset && `Pieza de la biblioteca: ${asset.kind === 'VIDEO' ? 'video' : 'imagen'} "${asset.name}"${asset.collection ? `, colección ${asset.collection}` : ''}${asset.tags.length ? `, etiquetas ${asset.tags.join(', ')}` : ''}.`,
    `[MEZCLA RECIENTE] total=${mix.total} reels=${mix.reels} imagenes=${mix.images} tiktok=${mix.tiktok} instagram=${mix.instagram}`,
    recent.length ? `Textos recientes (no los repitas):\n${recent.slice(0, 10).map((p) => `- ${p.caption.slice(0, 100).replace(/\n/g, ' ')}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  const model = defaultModel();
  const driver = provider();
  let text: string | null;
  try {
    const response = await driver.complete({
      model,
      instructions,
      // El pedido del usuario es dato, no instrucciones del sistema.
      messages: [{ role: 'user', content: input.brief ? `Indicaciones del usuario: ${input.brief}` : 'Genera las sugerencias.' }],
      tools: [],
      maxOutputTokens: 1800,
    });
    text = response.text;
    await recordAiCredits({ workspaceId, provider: driver.name, model, inputTokens: response.inputTokens, outputTokens: response.outputTokens, referenceType: 'SocialContentAI', referenceId: input.task, occurredAt: now });
  } catch (error) {
    throw new ContentAiError(error instanceof ModelProviderError && error.code === 'NOT_CONFIGURED' ? 'La IA no está configurada en este entorno.' : 'La IA no respondió. Inténtalo de nuevo.');
  }
  const suggestions = parseSuggestions(text, now.toISOString().slice(0, 10));
  if (suggestions.length === 0) throw new ContentAiError('La IA no devolvió sugerencias válidas. Inténtalo de nuevo.');
  return suggestions;
}
