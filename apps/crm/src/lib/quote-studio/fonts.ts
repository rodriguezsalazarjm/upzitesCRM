/**
 * Anchos (AFM, milésimas de em) de las fuentes base del PDF para ASCII 32–126.
 * Con ellos la maqueta corta líneas y alinea igual en el PDF y en la vista previa.
 */
const H = '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584';
const HB = '278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584';
const T = '250 333 408 500 500 833 778 180 333 333 500 564 250 333 250 278 500 500 500 500 500 500 500 500 500 500 278 278 564 564 564 444 921 722 667 667 722 611 556 722 722 333 389 722 611 889 722 722 556 722 667 556 611 722 722 944 722 722 611 333 278 333 469 500 333 444 500 444 500 444 333 500 500 278 278 500 278 778 500 500 500 500 333 389 278 500 500 722 500 500 444 480 200 480 541';
const TB = '250 333 555 500 500 1000 833 278 333 333 500 570 250 333 250 278 500 500 500 500 500 500 500 500 500 500 333 333 570 570 570 500 930 722 667 722 722 667 611 778 778 389 500 778 667 944 722 778 611 778 722 556 667 722 722 1000 722 722 667 333 278 333 581 500 333 500 556 444 556 444 333 500 556 278 333 556 278 833 556 500 556 556 444 389 333 556 500 722 500 500 444 394 220 394 520';

export type FontKey = 'helvetica' | 'helvetica-bold' | 'times' | 'times-bold' | 'courier' | 'courier-bold';
const table = (s: string) => s.split(' ').map(Number);
const WIDTHS: Record<FontKey, number[] | null> = { helvetica: table(H), 'helvetica-bold': table(HB), times: table(T), 'times-bold': table(TB), courier: null, 'courier-bold': null };

/** Nombre PostScript de la fuente base del PDF. */
export const PDF_FONT: Record<FontKey, string> = {
  helvetica: 'Helvetica', 'helvetica-bold': 'Helvetica-Bold', times: 'Times-Roman', 'times-bold': 'Times-Bold', courier: 'Courier', 'courier-bold': 'Courier-Bold',
};
/** Equivalente en la vista previa (Arial y Times New Roman comparten métricas con las base). */
export const CSS_FONT: Record<FontKey, { family: string; weight: number }> = {
  helvetica: { family: 'Helvetica, Arial, sans-serif', weight: 400 },
  'helvetica-bold': { family: 'Helvetica, Arial, sans-serif', weight: 700 },
  times: { family: '"Times New Roman", Times, serif', weight: 400 },
  'times-bold': { family: '"Times New Roman", Times, serif', weight: 700 },
  courier: { family: '"Courier New", Courier, monospace', weight: 400 },
  'courier-bold': { family: '"Courier New", Courier, monospace', weight: 700 },
};

export const fontKey = (family: 'helvetica' | 'times' | 'courier', bold = false) => (bold ? `${family}-bold` : family) as FontKey;

/** Caracteres que el PDF (WinAnsi) sabe dibujar además de ASCII; el resto se cambia antes de maquetar. */
const LATIN = 'áéíóúñüÁÉÍÓÚÑÜ¿¡°·×±ºª€àèìòùçÀÈÌÒÙÇ';
const BASE: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n', ü: 'u', Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ñ: 'N', Ü: 'U', à: 'a', è: 'e', ì: 'i', ò: 'o', ù: 'u', ç: 'c', À: 'A', È: 'E', Ì: 'I', Ò: 'O', Ù: 'U', Ç: 'C', '¿': '?', '¡': '!', '°': 'o', '·': '.', '×': 'x', '±': '+', º: 'o', ª: 'a', '€': 'C' };
const SWAP: Record<string, string> = { ' ': ' ', ' ': ' ', ' ': ' ', '—': '-', '–': '-', '“': '"', '”': '"', '‘': "'", '’': "'", '…': '...', '•': '-', '\t': ' ' };

/** Deja solo lo que el PDF puede dibujar, igual en ambos lados. */
export function sanitize(text: string) {
  let out = '';
  for (const ch of text) {
    const swapped = SWAP[ch] ?? ch;
    for (const c of swapped) out += c === '\n' || (c >= ' ' && c <= '~') || LATIN.includes(c) ? c : '?';
  }
  return out;
}

export function textWidth(text: string, font: FontKey, size: number) {
  const widths = WIDTHS[font];
  let total = 0;
  for (const ch of text) {
    if (!widths) total += 600;
    else {
      const code = (BASE[ch] ?? ch).charCodeAt(0);
      total += code >= 32 && code <= 126 ? widths[code - 32] : 556;
    }
  }
  return (total * size) / 1000;
}

/** Corta en líneas que caben en `max` (respeta saltos de línea; parte palabras larguísimas). */
export function wrap(text: string, font: FontKey, size: number, max: number) {
  const lines: string[] = [];
  for (const paragraph of sanitize(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/ +/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, font, size) <= max) { line = candidate; continue; }
      if (line) lines.push(line);
      line = word;
      while (textWidth(line, font, size) > max && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && textWidth(line.slice(0, cut), font, size) > max) cut -= 1;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}
