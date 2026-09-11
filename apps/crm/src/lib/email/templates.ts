import { z } from 'zod';
import type { ModelProvider } from '../agents/provider';
import { defaultModel } from '../agents/provider';

/**
 * Plantillas de email y personalizacion con IA acotada.
 *
 * La regla que ordena todo el archivo: **la IA no escribe el email, rellena
 * huecos**. El template define el asunto, la estructura, los enlaces y el pie
 * legal; declara ademas cero o mas `aiSlots`, y eso es lo unico que el modelo
 * puede tocar. Un modelo que devuelva un enlace, HTML o un precio no consigue
 * que eso salga: el slot se rechaza y queda el texto de respaldo.
 *
 * Es el mismo criterio de la Fase 7 con los totales. Lo que no puede fallar no
 * se le delega al modelo.
 */

export const aiSlotSchema = z.object({
  key: z.string().min(1).max(40),
  /** Que se espera en el hueco. Se le pasa al modelo tal cual. */
  guide: z.string().min(1).max(400),
  maxLength: z.number().int().min(10).max(400).default(160),
  /** Texto que se usa si el modelo falla o devuelve algo inaceptable. */
  fallback: z.string().min(1).max(400),
});

export type AiSlot = z.infer<typeof aiSlotSchema>;

export const aiSlotsSchema = z.array(aiSlotSchema).max(5);

export function parseAiSlots(raw: unknown): AiSlot[] {
  if (raw === null || raw === undefined) return [];
  const parsed = aiSlotsSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

// --- Render ------------------------------------------------------------------

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/**
 * Reemplaza `{{variable}}`. Un placeholder sin valor se sustituye por vacio, no
 * se deja crudo: un cliente prefiere una frase incompleta antes que recibir un
 * correo que dice literalmente "Hola {{nombre}}".
 */
export function fillPlaceholders(text: string, values: Record<string, string>, html: boolean) {
  return text.replace(PLACEHOLDER, (_match, key: string) => {
    const value = values[key];
    if (value === undefined) return '';
    return html ? escapeHtml(value) : value;
  });
}

export function placeholdersIn(text: string) {
  return [...text.matchAll(PLACEHOLDER)].map((match) => match[1]);
}

export type RenderableTemplate = {
  subject: string;
  bodyHtml: string;
  bodyText: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

export function renderTemplate(
  template: RenderableTemplate,
  values: Record<string, string>,
): RenderedEmail {
  return {
    // El asunto viaja como texto plano: escaparlo mostraria &amp; en la bandeja.
    subject: fillPlaceholders(template.subject, values, false),
    html: fillPlaceholders(template.bodyHtml, values, true),
    text: fillPlaceholders(template.bodyText, values, false),
  };
}

// --- Personalizacion acotada -------------------------------------------------

/** Nada de enlaces, etiquetas ni montos: eso lo decide el template, no el modelo. */
const FORBIDDEN = [
  { pattern: /https?:\/\//i, reason: 'contiene un enlace' },
  { pattern: /<[^>]+>/, reason: 'contiene HTML' },
  { pattern: /\{\{|\}\}/, reason: 'intenta inyectar un placeholder' },
  { pattern: /(\$|CLP|USD|EUR)\s*[\d.,]{2,}/i, reason: 'afirma un monto' },
  { pattern: /\b\d{1,3}\s*%\s*(de\s*)?(descuento|off)/i, reason: 'promete un descuento' },
  { pattern: /\b(unsubscribe|desuscribir|darse de baja)\b/i, reason: 'simula el pie de baja' },
];

export type SlotCheck = { ok: true; value: string } | { ok: false; reason: string };

/**
 * Valida lo que el modelo devolvio para un hueco.
 *
 * Es una funcion pura y esta separada del llamado al modelo justamente para
 * poder probarla con respuestas hostiles sin gastar un token.
 */
export function checkSlotValue(slot: AiSlot, raw: unknown): SlotCheck {
  if (typeof raw !== 'string') return { ok: false, reason: 'no es texto' };

  const value = raw.trim();
  if (!value) return { ok: false, reason: 'vacio' };
  if (value.length > slot.maxLength) {
    return { ok: false, reason: `excede ${slot.maxLength} caracteres` };
  }

  for (const rule of FORBIDDEN) {
    if (rule.pattern.test(value)) return { ok: false, reason: rule.reason };
  }

  return { ok: true, value };
}

export type PersonalizationResult = {
  values: Record<string, string>;
  /** Que huecos se rechazaron y por que. Queda como evidencia del envio. */
  rejected: { key: string; reason: string }[];
  usedFallback: boolean;
};

const SLOT_INSTRUCTIONS = [
  'Escribes fragmentos cortos para completar una plantilla de email ya redactada.',
  'Devuelves SOLO un objeto JSON con una clave por hueco pedido.',
  'No agregues enlaces, HTML, precios, descuentos ni texto de desuscripcion.',
  'No inventes datos del cliente ni del producto: usa unicamente el contexto entregado.',
  'Si no tienes informacion suficiente para un hueco, devuelvelo como cadena vacia.',
].join(' ');

/**
 * Pide al modelo que rellene los huecos declarados.
 *
 * Nunca lanza: si el proveedor falla, si devuelve basura o si el JSON no parsea,
 * cada hueco cae a su texto de respaldo. Un email que sale con el texto por
 * defecto es un email correcto; uno que no sale porque el modelo tuvo un mal dia
 * es una venta perdida.
 */
export async function personalizeSlots(input: {
  slots: AiSlot[];
  context: Record<string, string>;
  provider: ModelProvider | null;
  model?: string;
}): Promise<PersonalizationResult> {
  const fallbacks = Object.fromEntries(input.slots.map((slot) => [slot.key, slot.fallback]));

  if (input.slots.length === 0) return { values: {}, rejected: [], usedFallback: false };
  if (!input.provider) return { values: fallbacks, rejected: [], usedFallback: true };

  const prompt = [
    'Contexto del contacto:',
    JSON.stringify(input.context),
    '',
    'Huecos a completar:',
    ...input.slots.map((slot) => `- ${slot.key}: ${slot.guide} (maximo ${slot.maxLength} caracteres)`),
  ].join('\n');

  let raw: Record<string, unknown> = {};

  try {
    const response = await input.provider.complete({
      model: input.model ?? defaultModel(),
      instructions: SLOT_INSTRUCTIONS,
      messages: [{ role: 'user', content: prompt }],
      tools: [],
      maxOutputTokens: 400,
    });

    const text = (response.text ?? '').trim();
    // El modelo suele envolver el JSON en explicaciones o en un bloque de codigo.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    }
  } catch {
    return { values: fallbacks, rejected: [], usedFallback: true };
  }

  const values: Record<string, string> = {};
  const rejected: { key: string; reason: string }[] = [];
  let usedFallback = false;

  for (const slot of input.slots) {
    const check = checkSlotValue(slot, raw[slot.key]);
    if (check.ok) {
      values[slot.key] = check.value;
    } else {
      values[slot.key] = slot.fallback;
      rejected.push({ key: slot.key, reason: check.reason });
      usedFallback = true;
    }
  }

  return { values, rejected, usedFallback };
}

// --- Pie de baja -------------------------------------------------------------

/**
 * Marcador del enlace de baja.
 *
 * El cuerpo se guarda con este marcador y la URL real se sustituye solo en lo
 * que sale hacia el proveedor. Asi el token no queda en claro en la base —donde
 * solo vive su hash— y el cuerpo guardado sigue sirviendo como evidencia de que
 * se envio.
 *
 * Una plantilla puede incluirlo para decidir donde va el enlace; si no lo
 * incluye, el pie se agrega automaticamente.
 */
export const UNSUBSCRIBE_PLACEHOLDER = '{{unsubscribe_url}}';

/** Sustituye el marcador por la URL real. Solo para lo que va al proveedor. */
export function withUnsubscribeUrl(rendered: RenderedEmail, url: string): RenderedEmail {
  return {
    subject: rendered.subject,
    html: rendered.html.split(UNSUBSCRIBE_PLACEHOLDER).join(escapeHtml(url)),
    text: rendered.text.split(UNSUBSCRIBE_PLACEHOLDER).join(url),
  };
}

/**
 * Agrega el enlace de baja. Es obligatorio en todo email promocional (regla 4
 * de la spec) y se agrega en el envio, no en el template: asi no depende de que
 * quien escribio la plantilla se haya acordado.
 */
export function appendUnsubscribe(rendered: RenderedEmail, url: string): RenderedEmail {
  const html = `${rendered.html}
<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
<p style="font-size:12px;color:#64748b">
  Recibes este correo porque autorizaste que te contactaramos.
  <a href="${escapeHtml(url)}">Darte de baja</a>.
</p>`;

  const text = `${rendered.text}\n\n---\nRecibes este correo porque autorizaste que te contactaramos.\nPara darte de baja: ${url}`;

  return { subject: rendered.subject, html, text };
}
