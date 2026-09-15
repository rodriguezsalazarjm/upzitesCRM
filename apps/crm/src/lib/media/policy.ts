import { MessageType } from '../../../generated/prisma/client';

/**
 * Politica de archivos recibidos.
 *
 * Todo lo de este archivo es puro: decide sobre tipos, tamanos y nombres sin
 * tocar red ni base. Es donde se concentran las tres preguntas que importan
 * antes de guardar algo que envio un desconocido: si cabe, si es lo que dice
 * ser, y si puede mostrarse sin riesgo.
 */

/** Los tipos de mensaje que traen archivo adjunto. */
export const MEDIA_KINDS = [
  MessageType.IMAGE,
  MessageType.AUDIO,
  MessageType.VIDEO,
  MessageType.DOCUMENT,
] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];

export function isMediaKind(type: MessageType): type is MediaKind {
  return (MEDIA_KINDS as readonly MessageType[]).includes(type);
}

/**
 * Topes de tamano por tipo.
 *
 * WhatsApp admite documentos de hasta 100 MB, pero aqui el archivo se descarga
 * completo en memoria de una funcion serverless antes de guardarlo. Un tope de
 * 25 MB protege al proceso; lo que exceda queda rechazado con un motivo visible
 * en la bandeja, que es mejor que una funcion que muere sin explicar por que.
 */
export const MAX_BYTES_BY_KIND: Record<MediaKind, number> = {
  [MessageType.IMAGE]: 5 * 1024 * 1024,
  [MessageType.AUDIO]: 16 * 1024 * 1024,
  [MessageType.VIDEO]: 16 * 1024 * 1024,
  [MessageType.DOCUMENT]: 25 * 1024 * 1024,
};

/**
 * Tipos admitidos por categoria.
 *
 * `image/svg+xml` no esta y no debe estar: un SVG es un documento con scripts,
 * no una imagen. Lo mismo vale para HTML y XML, que ademas se rechazan de forma
 * explicita mas abajo aunque lleguen disfrazados.
 */
export const ALLOWED_MIME_BY_KIND: Record<MediaKind, readonly string[]> = {
  [MessageType.IMAGE]: ['image/jpeg', 'image/png', 'image/webp'],
  [MessageType.AUDIO]: [
    'audio/aac',
    'audio/amr',
    'audio/mpeg',
    'audio/mp4',
    'audio/ogg',
    'audio/opus',
    'audio/wav',
  ],
  [MessageType.VIDEO]: ['video/mp4', 'video/3gpp'],
  [MessageType.DOCUMENT]: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'text/plain',
    'text/csv',
  ],
};

/**
 * Tipos que no se guardan aunque el proveedor los declare: se interpretan como
 * codigo en cuanto un navegador los abre en nuestro origen.
 */
const ACTIVE_CONTENT = [
  'image/svg+xml',
  'text/html',
  'application/xhtml+xml',
  'application/xml',
  'text/xml',
  'application/javascript',
  'text/javascript',
];

/** Quita parametros (`; codecs=opus`) y normaliza a minusculas. */
export function baseMime(value: string | null | undefined): string | null {
  if (!value) return null;
  const base = value.split(';')[0]?.trim().toLowerCase();
  return base || null;
}

export function isActiveContent(mime: string | null | undefined) {
  const base = baseMime(mime);
  return base !== null && ACTIVE_CONTENT.includes(base);
}

export function isAllowedMime(kind: MediaKind, mime: string | null | undefined) {
  const base = baseMime(mime);
  if (!base || isActiveContent(base)) return false;
  return ALLOWED_MIME_BY_KIND[kind].includes(base);
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/zip': 'zip',
  'text/plain': 'txt',
  'text/csv': 'csv',
};

export function extensionFor(mime: string | null | undefined) {
  return EXTENSIONS[baseMime(mime) ?? ''] ?? 'bin';
}

/**
 * Firma real del archivo a partir de sus primeros bytes.
 *
 * Existe porque el tipo lo declara quien envia: un ejecutable presentado como
 * `image/png` seguiria siendo un ejecutable. Reconoce los formatos que de
 * verdad llegan por WhatsApp; para el resto devuelve `null`, y quien llama
 * decide con prudencia en vez de creer la declaracion a ciegas.
 */
export function sniffMime(bytes: Uint8Array): string | null {
  const startsWith = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  const ascii = (offset: number, length: number) =>
    Array.from(bytes.slice(offset, offset + length))
      .map((byte) => String.fromCharCode(byte))
      .join('');

  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return 'audio/wav';
  if (ascii(0, 4) === '%PDF') return 'application/pdf';
  if (ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(0, 5) === '#!AMR') return 'audio/amr';
  if (ascii(0, 3) === 'ID3') return 'audio/mpeg';
  if (ascii(0, 4).toLowerCase() === '<svg') return 'image/svg+xml';
  if (ascii(0, 5) === '<?xml' || ascii(0, 5).toLowerCase() === '<html') return 'text/html';
  if (startsWith(0x1a, 0x45, 0xdf, 0xa3)) return 'video/webm';
  if (ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4);
    if (brand.startsWith('3g')) return 'video/3gpp';
    if (brand === 'M4A ' || brand === 'M4B ') return 'audio/mp4';
    return 'video/mp4';
  }
  // Los formatos de Office modernos son ZIP: el contenedor es lo unico visible
  // en los primeros bytes, asi que el tipo exacto lo resuelve la declaracion.
  if (startsWith(0x50, 0x4b, 0x03, 0x04)) return 'application/zip';
  // Audio MPEG sin etiqueta ID3: sincronismo de trama. Va al final porque el
  // patron es corto y podria ganarle a firmas mas especificas.
  if (bytes[0] === 0xff && bytes[1] !== undefined && (bytes[1] & 0xe0) === 0xe0) {
    // El ADTS de AAC comparte ese sincronismo; el segundo byte los separa.
    if ((bytes[1] & 0xf6) === 0xf0) return 'audio/aac';
    return 'audio/mpeg';
  }

  return null;
}

const familyOf = (mime: string) => mime.split('/')[0];

/** Los contenedores ZIP y MP4 alojan varios tipos declarables sin contradiccion. */
function compatible(sniffed: string, declared: string) {
  if (sniffed === declared) return true;
  if (sniffed === 'application/zip') {
    return declared.includes('openxmlformats') || declared === 'application/zip';
  }
  if (sniffed === 'video/mp4' && declared === 'audio/mp4') return true;
  if (sniffed === 'audio/mp4' && declared === 'video/mp4') return true;
  if (sniffed === 'audio/ogg' && declared === 'audio/opus') return true;
  if (sniffed === 'audio/opus' && declared === 'audio/ogg') return true;
  return familyOf(sniffed) === familyOf(declared);
}

export type ContentVerdict =
  | { ok: true; mimeType: string; confirmed: boolean }
  | { ok: false; reason: string };

/**
 * Decide con que tipo se guarda un archivo ya descargado.
 *
 * Los bytes mandan sobre la declaracion. Cuando la firma no se reconoce el
 * archivo no se descarta —muchos documentos legitimos no tienen una— pero se
 * marca como no confirmado, y mas adelante eso le cuesta el derecho a mostrarse
 * dentro de la pagina.
 */
export function verifyContent(
  kind: MediaKind,
  declaredMime: string | null | undefined,
  bytes: Uint8Array,
): ContentVerdict {
  const declared = baseMime(declaredMime);
  const sniffed = sniffMime(bytes);

  if (isActiveContent(sniffed) || isActiveContent(declared)) {
    return { ok: false, reason: 'El archivo contiene contenido ejecutable y no se guarda.' };
  }

  if (sniffed && declared && !compatible(sniffed, declared)) {
    return { ok: false, reason: 'El contenido del archivo no corresponde al tipo declarado.' };
  }

  if (sniffed && isAllowedMime(kind, sniffed)) {
    return { ok: true, mimeType: sniffed, confirmed: true };
  }

  if (declared && isAllowedMime(kind, declared)) {
    return { ok: true, mimeType: declared, confirmed: sniffed !== null };
  }

  return { ok: false, reason: 'Tipo de archivo no admitido.' };
}

/**
 * Como se entrega al navegador.
 *
 * Solo se muestra dentro de la pagina lo que se pudo confirmar por firma y es
 * imagen, audio o video. Todo lo demas se descarga: un documento abierto en
 * nuestro origen es una superficie de ataque, y ningun documento necesita
 * abrirse ahi para ser util.
 */
export function dispositionFor(mime: string | null | undefined, confirmed: boolean) {
  const base = baseMime(mime);
  if (!confirmed || !base || isActiveContent(base)) return 'attachment';
  const family = familyOf(base);
  return family === 'image' || family === 'audio' || family === 'video' ? 'inline' : 'attachment';
}

/**
 * Nombre de archivo utilizable.
 *
 * El nombre lo escribe quien envia: puede traer rutas, saltos de linea o
 * comillas que rompan la cabecera. Se conserva algo reconocible para la persona
 * que lo recibe y se descarta el resto.
 */
export function safeFileName(raw: string | null | undefined, mime: string | null | undefined) {
  const extension = extensionFor(mime);
  const candidate = (raw ?? '')
    .replace(/[\r\n\t]/g, ' ')
    .split(/[\\/]/)
    .pop()
    ?.replace(/[^\p{L}\p{N}\-_. ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Puede no quedar nada util: un nombre que era solo una ruta, o solo puntos.
  // Un archivo que se llame `.pdf` no es peligroso, pero tampoco es un nombre.
  if (!candidate || /^\.+[A-Za-z0-9]*$/.test(candidate)) return `archivo.${extension}`;

  const trimmed = candidate.slice(0, 120);
  return /\.[A-Za-z0-9]{1,8}$/.test(trimmed) ? trimmed : `${trimmed}.${extension}`;
}

/** Etiqueta para la bandeja cuando el mensaje no trae texto. */
export function mediaLabel(kind: MessageType) {
  if (kind === MessageType.IMAGE) return 'Imagen';
  if (kind === MessageType.AUDIO) return 'Audio';
  if (kind === MessageType.VIDEO) return 'Video';
  if (kind === MessageType.DOCUMENT) return 'Documento';
  return 'Adjunto';
}

/**
 * Cuanto tiempo se conserva un archivo recibido.
 *
 * Se guarda para que el operador pueda volver a mirarlo, no para siempre: son
 * datos de terceros que llegaron sin pedirlos.
 */
export function retentionDays() {
  const raw = Number(process.env.MEDIA_RETENTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 180;
}
