/** P23: catálogo puro de tareas y tonos (lo usa también el cliente). */
export const CONTENT_TASKS = {
  variants: 'Variantes para Instagram y TikTok',
  ideas: 'Ideas de publicaciones',
  hooks: 'Ganchos (primera línea)',
  captions: 'Textos (captions)',
  cta: 'Llamados a la acción',
  hashtags: 'Hashtags',
  variations: 'Variaciones del texto',
  adapt_tiktok: 'Adaptar a TikTok',
  calendar: 'Calendario sugerido (2 semanas)',
  pillars: 'Pilares de contenido',
  rewrite_tone: 'Reescribir con otro tono',
  gaps: 'Qué tipo de pieza falta',
} as const;
export type ContentTask = keyof typeof CONTENT_TASKS;
export const CONTENT_TONES = ['cercano', 'profesional', 'inspirador', 'divertido', 'urgente sin presión'] as const;

export type ContentSuggestion = {
  network: 'INSTAGRAM' | 'TIKTOK';
  format: 'IMAGE' | 'REEL';
  title: string;
  hook: string;
  text: string;
  cta: string;
  hashtags: string[];
  /** YYYY-MM-DD, solo si es de hoy en adelante. */
  date: string | null;
  note: string;
};
