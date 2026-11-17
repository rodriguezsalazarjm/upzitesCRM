import { crc32, deflateSync, inflateSync } from 'node:zlib';

/**
 * P37: logo para el PDF sin dependencias. JPEG se incrusta tal cual (DCTDecode);
 * PNG de 8 bits se descomprime, se quitan los filtros y se separa la
 * transparencia en una máscara (SMask). Lo raro (16 bits, entrelazado, CMYK)
 * se rechaza al subir, con un mensaje claro.
 */

export class LogoError extends Error {}
export const LOGO_MAX_BYTES = 500 * 1024;
const MAX_SIDE = 2000;

export type PdfImage =
  | { kind: 'jpeg'; width: number; height: number; gray: boolean; data: Buffer }
  | { kind: 'flate'; width: number; height: number; gray: boolean; data: Buffer; alpha: Buffer | null };

export function logoMime(bytes: Uint8Array): 'image/jpeg' | 'image/png' | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  return null;
}

function jpeg(buf: Buffer): PdfImage {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) throw new LogoError('El JPG está dañado.');
    const marker = buf[i + 1];
    const length = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc2) {
      const components = buf[i + 9];
      if (components !== 1 && components !== 3) throw new LogoError('El JPG usa CMYK: expórtalo en RGB.');
      return { kind: 'jpeg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), gray: components === 1, data: buf };
    }
    i += 2 + length;
  }
  throw new LogoError('No se pudo leer el tamaño del JPG.');
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function png(buf: Buffer): PdfImage {
  let i = 8;
  let width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  let palette: Buffer | null = null;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (i + 8 <= buf.length) {
    const length = buf.readUInt32BE(i);
    const kind = buf.toString('latin1', i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + length);
    // Igual que el navegador: un chunk dañado invalida la imagen (si no, el PDF la mostraría y la vista previa no).
    if (i + 12 + length > buf.length || crc32(buf.subarray(i + 4, i + 8 + length)) !== buf.readUInt32BE(i + 8 + length)) throw new LogoError('El PNG está dañado. Vuelve a exportarlo.');
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === 'PLTE') palette = data;
    else if (kind === 'tRNS') trns = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    i += 12 + length;
  }
  if (depth !== 8 || interlace !== 0 || ![0, 2, 3, 4, 6].includes(type)) throw new LogoError('Ese PNG no se puede usar: expórtalo como PNG de 24/32 bits sin entrelazar, o como JPG.');
  if (type === 3 && !palette) throw new LogoError('El PNG no trae paleta.');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type]!;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (stride + 1)];
    const src = row * (stride + 1) + 1;
    const out = row * stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? pixels[out + x - channels] : 0;
      const b = row ? pixels[out - stride + x] : 0;
      const c = row && x >= channels ? pixels[out - stride + x - channels] : 0;
      const v = raw[src + x];
      pixels[out + x] = (filter === 0 ? v : filter === 1 ? v + a : filter === 2 ? v + b : filter === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c)) & 255;
    }
  }
  const gray = type === 0 || type === 4;
  const colorChannels = gray ? 1 : 3;
  const color = Buffer.alloc(width * height * colorChannels);
  const alpha = Buffer.alloc(width * height, 255);
  let hasAlpha = false;
  for (let p = 0; p < width * height; p += 1) {
    if (type === 3) {
      const index = pixels[p];
      palette!.copy(color, p * 3, index * 3, index * 3 + 3);
      if (trns && index < trns.length) { alpha[p] = trns[index]; hasAlpha = true; }
    } else {
      pixels.copy(color, p * colorChannels, p * channels, p * channels + colorChannels);
      if (type === 4 || type === 6) { alpha[p] = pixels[p * channels + channels - 1]; hasAlpha = true; }
    }
  }
  return { kind: 'flate', width, height, gray, data: deflateSync(color), alpha: hasAlpha ? deflateSync(alpha) : null };
}

/** Valida y prepara el logo; lanza LogoError con un motivo para la persona. */
export function decodeLogo(bytes: Uint8Array): PdfImage {
  if (bytes.byteLength > LOGO_MAX_BYTES) throw new LogoError('El logo pesa más de 500 KB.');
  const mime = logoMime(bytes);
  if (!mime) throw new LogoError('Sube el logo como PNG o JPG.');
  const buf = Buffer.from(bytes);
  let image: PdfImage;
  try {
    image = mime === 'image/jpeg' ? jpeg(buf) : png(buf);
  } catch (error) {
    throw error instanceof LogoError ? error : new LogoError('No se pudo leer la imagen.');
  }
  if (!image.width || !image.height || image.width > MAX_SIDE || image.height > MAX_SIDE) throw new LogoError(`El logo debe medir como máximo ${MAX_SIDE}×${MAX_SIDE} px.`);
  return image;
}

/** Para leer lo ya guardado: un logo que dejó de ser válido se omite, no rompe la página ni el PDF. */
export function tryDecodeLogo(bytes: Uint8Array) {
  try {
    return decodeLogo(bytes);
  } catch (error) {
    if (error instanceof LogoError) return null;
    throw error;
  }
}
