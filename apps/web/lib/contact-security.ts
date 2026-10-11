import { createHash } from "node:crypto";
import {
  ALLOWED_BRIEF_TYPES,
  ALLOWED_BUDGETS,
  ALLOWED_KINDS,
  ALLOWED_SERVICES,
  ALLOWED_URGENCIES,
  HONEYPOT_FIELD,
  MIN_FILL_MS,
} from "./contact-options";

/**
 * Capas antispam de /api/contact. Solo servidor.
 *
 * Orden en que las aplica el endpoint (de más barata a más cara):
 *   tamaño/forma del body → honeypot + tiempo mínimo → validación →
 *   rate limit por IP → Turnstile → rate limit por email → correo/CRM.
 * Nada que falle antes de "correo/CRM" consume Resend ni crea un lead.
 */

export const MAX_BODY_BYTES = 64 * 1024;

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

export type ContactPayload = {
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  kind: string;
  briefType: string;
  company: string;
  industry: string;
  service: string;
  budget: string;
  urgency: string;
  message: string;
  consent: boolean;
  pageUrl: string;
  referrer: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
};

type ValidationResult = { ok: true; payload: ContactPayload } | { ok: false; message: string };

// Controles C0/C1 salvo tab y saltos de línea; también los separadores de
// línea Unicode, que algunos clientes de correo interpretan como salto.
const CONTROL_CHARS = new RegExp(`[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F${String.fromCharCode(0x2028, 0x2029)}]`, "g");
const LINE_BREAKS = /[\r\n\t]+/g;

function cleanText(value: unknown, multiline: boolean) {
  if (typeof value !== "string") return "";
  let text = value.normalize("NFC").replace(CONTROL_CHARS, "");
  text = multiline ? text.replace(/\r\n?/g, "\n") : text.replace(LINE_BREAKS, " ");
  return text.trim();
}

// Deliberadamente permisivo: acepta locales con acentos, subdominios y TLDs
// largos. Solo descarta lo que no puede ser una dirección entregable.
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/u;
const PHONE_RE = /^[+()\-.\s\d]+$/;

function isValidUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Valida y normaliza el body. Los campos que el usuario escribe se rechazan si
 * exceden el límite (mejor avisar que truncar en silencio lo que escribió); los
 * metadatos (URL, UTM) se recortan o se vacían, porque no son del usuario y no
 * vale la pena perder un lead por ellos.
 */
export function validateContact(body: Record<string, unknown>): ValidationResult {
  const text = (key: string) => cleanText(body[key], false);

  const fields = {
    name: text("name"),
    email: text("email").toLowerCase(),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    instagram: text("instagram"),
    kind: text("kind"),
    briefType: text("briefType"),
    company: text("company"),
    industry: text("industry"),
    service: text("service"),
    budget: text("budget"),
    urgency: text("urgency"),
    message: cleanText(body.message, true),
  };

  const limits: Record<keyof typeof fields, number> = {
    name: 120,
    email: 254,
    phone: 40,
    whatsapp: 40,
    instagram: 120,
    kind: 20,
    briefType: 60,
    company: 160,
    industry: 160,
    service: 80,
    budget: 80,
    urgency: 40,
    message: 20_000,
  };

  for (const [key, max] of Object.entries(limits) as [keyof typeof fields, number][]) {
    if (fields[key].length > max) {
      return { ok: false, message: "Uno de los campos es demasiado largo. Revísalo e inténtalo nuevamente." };
    }
  }

  if (!fields.name || !fields.email || !fields.message || body.consent !== true) {
    return { ok: false, message: "Completa los campos obligatorios y acepta el consentimiento." };
  }

  if (!EMAIL_RE.test(fields.email)) {
    return { ok: false, message: "Revisa el email: no parece una dirección válida." };
  }

  for (const key of ["phone", "whatsapp"] as const) {
    const value = fields[key];
    if (value && (!PHONE_RE.test(value) || value.replace(/\D/g, "").length < 6)) {
      return { ok: false, message: "Revisa el teléfono o WhatsApp: usa solo números, espacios y +." };
    }
  }

  const selects: [string, Set<string>][] = [
    [fields.service, ALLOWED_SERVICES],
    [fields.budget, ALLOWED_BUDGETS],
    [fields.urgency, ALLOWED_URGENCIES],
    [fields.briefType, ALLOWED_BRIEF_TYPES],
    [fields.kind, ALLOWED_KINDS],
  ];
  if (selects.some(([value, allowed]) => value && !allowed.has(value))) {
    return { ok: false, message: "Solicitud invalida" };
  }

  const meta = (key: string, max: number) => text(key).slice(0, max);
  const url = (key: string) => {
    const value = text(key);
    return value.length <= 2048 && isValidUrl(value) ? value : "";
  };

  return {
    ok: true,
    payload: {
      ...fields,
      // Mismo criterio que antes: el CRM recibe un solo teléfono.
      phone: fields.whatsapp || fields.phone,
      consent: true,
      pageUrl: url("pageUrl"),
      referrer: url("referrer"),
      utmSource: meta("utmSource", 200),
      utmMedium: meta("utmMedium", 200),
      utmCampaign: meta("utmCampaign", 200),
    },
  };
}

// ---------------------------------------------------------------------------
// Honeypot y tiempo de llenado
// ---------------------------------------------------------------------------

/**
 * Detecta al bot que rellena todos los campos en el navegador. Es el único
 * descarte silencioso: ninguna persona ve ni alcanza el campo trampa. No sirve
 * contra quien postea directo al endpoint (para eso está Turnstile).
 */
export function detectBotTrap(body: Record<string, unknown>): string | null {
  const honeypot = body[HONEYPOT_FIELD];
  if (typeof honeypot === "string" ? honeypot.trim() !== "" : honeypot != null) {
    return "honeypot";
  }
  return null;
}

/**
 * true si el formulario se envió más rápido que `MIN_FILL_MS`. Es solo una
 * señal para los logs, NO un motivo de descarte: un cliente con autocompletado
 * y un mensaje pegado puede enviar en un segundo, y descartarlo en silencio
 * sería perder un lead mostrándole "éxito". Ese envío sigue pasando por
 * validación, rate limit y Turnstile como cualquier otro.
 */
export function isFastSubmit(body: Record<string, unknown>) {
  // Tiempo relativo medido en el cliente (sin desfase de reloj). Si no viene,
  // no se asume nada.
  const elapsed = body.formElapsedMs;
  return typeof elapsed === "number" && Number.isFinite(elapsed) && elapsed >= 0 && elapsed < MIN_FILL_MS;
}

// ---------------------------------------------------------------------------
// Origen de la petición
// ---------------------------------------------------------------------------

/**
 * IP del cliente. En Vercel `x-real-ip` y `x-forwarded-for` los fija la propia
 * plataforma (sobrescribe lo que mande el cliente), así que son confiables
 * ahí. Fuera de Vercel —p. ej. `next start` detrás de otro proxy— serían
 * falsificables: el rate limit por IP solo es tan bueno como ese proxy.
 */
export function getClientIp(request: Request) {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

/**
 * Los navegadores siempre mandan `Origin` en un POST con fetch. Si viene y no
 * coincide con el host que recibe la petición, es otro sitio usando nuestro
 * endpoint. Si no viene (curl, scripts), no decide nada: eso lo cubre Turnstile.
 */
export function isForeignOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

type Rule = { name: string; limit: number; windowSeconds: number };

/**
 * Límites pensados para no tocar a un usuario real: nadie manda más de 5
 * consultas en 10 minutos. Por IP y no por cookie porque el bot no guarda
 * cookies; una oficina que comparte IP tiene margen de sobra.
 */
export const IP_RULES: Rule[] = [
  { name: "ip10m", limit: 5, windowSeconds: 600 },
  { name: "ip1d", limit: 20, windowSeconds: 86_400 },
];

/**
 * Por destinatario del correo de confirmación: impide usar el formulario para
 * mandarle correos de UPZITES a un tercero una y otra vez.
 */
export const EMAIL_RULES: Rule[] = [{ name: "email1d", limit: 3, windowSeconds: 86_400 }];

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

function hashKey(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function getUpstashConfig() {
  // UPSTASH_* si se crea la base en upstash.com; KV_REST_API_* si se instala
  // desde el Marketplace de Vercel (inyecta esos nombres).
  // Se toma el par completo de una misma fuente (nunca URL de una y token de
  // otra). KV_REST_API_READ_ONLY_TOKEN no sirve: INCR necesita escribir.
  const pairs = [
    [process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN],
    [process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN],
  ];
  const pair = pairs.find(([url, token]) => url?.trim() && token?.trim());
  return pair ? { url: pair[0]!.trim().replace(/\/+$/, ""), token: pair[1]!.trim() } : null;
}

export function isPersistentRateLimitConfigured() {
  return getUpstashConfig() !== null;
}

/**
 * Contador de ventana fija en Upstash (REST, sin dependencia). `SET NX EX`
 * crea la clave con su TTL solo la primera vez e `INCR` es atómico, así que
 * peticiones concurrentes en instancias distintas cuentan bien.
 */
async function hitUpstash(keys: { key: string; rule: Rule }[]) {
  const config = getUpstashConfig()!;
  const commands = keys.flatMap(({ key, rule }) => [
    ["SET", key, "0", "EX", String(rule.windowSeconds), "NX"],
    ["INCR", key],
  ]);
  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store",
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error(`upstash_http_${response.status}`);
  const results = (await response.json()) as { result?: unknown; error?: string }[];
  return keys.map((_, index) => {
    const entry = results[index * 2 + 1];
    if (!entry || entry.error || typeof entry.result !== "number") throw new Error("upstash_bad_response");
    return entry.result;
  });
}

// Respaldo por instancia. En serverless cada instancia tiene su propio mapa y
// se reinicia en frío: frena ráfagas contra una instancia caliente, nada más.
// NO es el rate limit real; el real es Upstash.
const memoryCounters = new Map<string, { count: number; resetAt: number }>();
let warnedNoStore = false;

function hitMemory(keys: { key: string; rule: Rule }[]) {
  const now = Date.now();
  if (memoryCounters.size > 5000) {
    for (const [key, entry] of memoryCounters) if (entry.resetAt <= now) memoryCounters.delete(key);
  }
  return keys.map(({ key, rule }) => {
    const entry = memoryCounters.get(key);
    if (!entry || entry.resetAt <= now) {
      memoryCounters.set(key, { count: 1, resetAt: now + rule.windowSeconds * 1000 });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  });
}

/**
 * Consume una unidad en cada regla. Ante un fallo de Upstash se PERMITE la
 * petición (con el respaldo en memoria): un limitador caído no debe tumbar el
 * formulario. Turnstile sigue protegiendo mientras tanto.
 */
export async function consumeRateLimit(scope: string, identity: string, rules: Rule[]): Promise<RateLimitResult> {
  const keys = rules.map((rule) => ({ key: `upz:contact:${rule.name}:${hashKey(`${scope}:${identity}`)}`, rule }));

  let counts: number[];
  if (isPersistentRateLimitConfigured()) {
    try {
      counts = await hitUpstash(keys);
    } catch (error) {
      console.error("contact_rate_limit_store_error", error instanceof Error ? error.message : error);
      counts = hitMemory(keys);
    }
  } else {
    if (!warnedNoStore) {
      warnedNoStore = true;
      console.warn("contact_rate_limit_memory_only: configure UPSTASH_REDIS_REST_URL/TOKEN for a persistent limit");
    }
    counts = hitMemory(keys);
  }

  const exceeded = keys.find((_, index) => counts[index] > keys[index].rule.limit);
  return exceeded ? { allowed: false, retryAfterSeconds: exceeded.rule.windowSeconds } : { allowed: true };
}

// ---------------------------------------------------------------------------
// Cloudflare Turnstile
// ---------------------------------------------------------------------------

export const TURNSTILE_ACTION = "contact";
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Se exige solo cuando hay secret: así no se rompe el formulario sin configurar. */
export function isTurnstileEnabled() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

export type TurnstileResult = { ok: true } | { ok: false; reason: string; unavailable?: boolean };

/**
 * Verifica el token contra Cloudflare. Cada token es de un solo uso y vence a
 * los 300 s: Cloudflare responde `timeout-or-duplicate` si se reutiliza o
 * caduca, así que la reutilización la garantiza siteverify, no nosotros.
 */
export async function verifyTurnstile(token: unknown, remoteIp: string): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true };

  if (typeof token !== "string" || !token || token.length > 2048) {
    return { ok: false, reason: "missing-input-response" };
  }

  const form = new URLSearchParams({ secret, response: token });
  if (remoteIp !== "unknown") form.set("remoteip", remoteIp);

  let data: { success?: boolean; action?: string; "error-codes"?: string[] };
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`siteverify_http_${response.status}`);
    data = await response.json();
  } catch (error) {
    console.error("turnstile_siteverify_error", error instanceof Error ? error.message : error);
    return { ok: false, reason: "siteverify-unavailable", unavailable: true };
  }

  if (!data.success) {
    return { ok: false, reason: data["error-codes"]?.join(",") || "invalid" };
  }

  // Las claves de prueba de Cloudflare (1x…, 2x…, 3x…) no devuelven la acción.
  const isTestSecret = /^[0-9]x0{20,}/.test(secret);
  if (!isTestSecret && data.action && data.action !== TURNSTILE_ACTION) {
    return { ok: false, reason: "action-mismatch" };
  }

  return { ok: true };
}
