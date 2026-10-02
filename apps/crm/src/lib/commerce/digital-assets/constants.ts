/**
 * Constantes del Digital Asset Manager que tambien usa el navegador. Sin
 * imports de servidor (crypto, Prisma): las reglas completas viven en rules.ts.
 */

export const DELIVERABLE_FORMATS = ['PDF', 'AUDIO', 'ZIP', 'VIDEO', 'LINK'] as const;
export type DeliverableFormat = (typeof DELIVERABLE_FORMATS)[number];

/** Un enlace puede presentarse como enlace o como video (Vimeo, YouTube...). */
export const LINK_FORMATS = ['LINK', 'VIDEO'] as const;
export type LinkFormat = (typeof LINK_FORMATS)[number];

export const FORMAT_LABEL: Record<DeliverableFormat, string> = {
  PDF: 'PDF',
  AUDIO: 'Audio',
  ZIP: 'ZIP',
  VIDEO: 'Video',
  LINK: 'Enlace',
};

/**
 * Tope por archivo. Coincide con el limite recomendado para el bucket de
 * entregables (el maximo por archivo del plan gratuito de Supabase). Un video
 * mas pesado se entrega como enlace (Vimeo, YouTube no listado, Drive).
 */
export const DELIVERABLE_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Tipos admitidos, con el formato que representan. Es tambien la lista de MIME
 * que debe permitir el bucket de entregables. Nada de HTML, SVG, scripts ni
 * ejecutables: no estan aqui y ademas se rechazan por firma.
 */
export const DELIVERABLE_MIME: Record<string, Exclude<DeliverableFormat, 'LINK'>> = {
  'application/pdf': 'PDF',
  'application/zip': 'ZIP',
  'audio/mpeg': 'AUDIO',
  'audio/mp4': 'AUDIO',
  'audio/wav': 'AUDIO',
  'audio/ogg': 'AUDIO',
  'audio/aac': 'AUDIO',
  'video/mp4': 'VIDEO',
};

export const DELIVERABLE_MIME_TYPES = Object.keys(DELIVERABLE_MIME);

/** Lo que el selector de archivos ofrece (es solo una ayuda: decide el servidor). */
export const DELIVERABLE_ACCEPT = '.pdf,.zip,.mp3,.m4a,.wav,.ogg,.oga,.aac,.mp4,.m4v,' + DELIVERABLE_MIME_TYPES.join(',');
