// Client-side PageSpeed Insights audit.
// The API key is restricted by HTTP referrer (www.upzites.com), so the call
// must run from the browser — a server request has no referrer and is blocked.
// Key is exposed via NEXT_PUBLIC_PAGESPEED_KEY (safe for referrer-restricted keys).

const API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];

export type AuditData = {
  url: string;
  performanceMobile: number;
  performanceDesktop: number;
  seo: number;
  accessibility: number;
  bestPractices: number;
  lcp: string;
  cls: string;
  inp: number;
};

export type AuditResult =
  | { success: true; data: AuditData }
  | { success: false; error: string };

async function fetchPSI(url: string, strategy: "mobile" | "desktop") {
  const key = process.env.NEXT_PUBLIC_PAGESPEED_KEY;
  const params = new URLSearchParams({ url, strategy });
  CATEGORIES.forEach((c) => params.append("category", c));
  if (key) params.set("key", key);

  const res = await fetch(`${API}?${params.toString()}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new Error(json?.error?.message || res.statusText || "Error de la API de PageSpeed");
  }
  return json;
}

const pct = (score: number | undefined) => Math.round((score || 0) * 100);

// ---- normalization + per-session cache (saves PageSpeed quota) -----
const CACHE_PREFIX = "upz-audit:";

export function normalizeUrl(targetUrl: string): string {
  let url = targetUrl.trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  return url;
}

export function getCachedAudit(targetUrl: string): AuditData | null {
  const url = normalizeUrl(targetUrl);
  if (!url) return null;
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + url.toLowerCase());
    return raw ? (JSON.parse(raw) as AuditData) : null;
  } catch {
    return null;
  }
}

// Turn raw Google/API errors into friendly Spanish messages for visitors.
function friendlyError(msg: string): string {
  if (/quota|queries per day|rate.?limit|429/i.test(msg)) {
    return "La auditoría está recibiendo mucha demanda en este momento. Vuelve a intentarlo en unos minutos.";
  }
  if (/referer|blocked|forbidden|403/i.test(msg)) {
    return "No pudimos ejecutar la auditoría desde este dominio. Inténtalo más tarde.";
  }
  if (/lighthouse|no se pudo|unable|invalid|400/i.test(msg)) {
    return "No pudimos analizar esa URL. Revisa que sea correcta y que el sitio sea público.";
  }
  return "No pudimos completar la auditoría. Inténtalo de nuevo en un momento.";
}

export async function runAudit(targetUrl: string): Promise<AuditResult> {
  const url = normalizeUrl(targetUrl);
  if (!url) return { success: false, error: "Ingresa una URL." };

  // Serve from per-session cache when possible — no API call, no quota.
  const cached = getCachedAudit(url);
  if (cached) return { success: true, data: { ...cached, url: targetUrl } };

  try {
    const [mobile, desktop] = await Promise.all([
      fetchPSI(url, "mobile"),
      fetchPSI(url, "desktop"),
    ]);

    const lh = mobile.lighthouseResult;
    if (!lh) throw new Error("No se pudo obtener el reporte de Lighthouse.");

    const cat = lh.categories;
    const audits = lh.audits;
    const lcp = (audits["largest-contentful-paint"]?.numericValue || 0) / 1000;
    const cls = audits["cumulative-layout-shift"]?.numericValue || 0;
    const inp =
      audits["interaction-to-next-paint"]?.numericValue ||
      audits["total-blocking-time"]?.numericValue ||
      0;

    const data: AuditData = {
      url: targetUrl,
      performanceMobile: pct(cat.performance?.score),
      performanceDesktop: pct(desktop?.lighthouseResult?.categories?.performance?.score),
      seo: pct(cat.seo?.score),
      accessibility: pct(cat.accessibility?.score),
      bestPractices: pct(cat["best-practices"]?.score),
      lcp: lcp.toFixed(1),
      cls: cls.toFixed(2),
      inp: Math.round(inp),
    };

    try {
      sessionStorage.setItem(CACHE_PREFIX + url.toLowerCase(), JSON.stringify(data));
    } catch {
      /* ignore storage errors (private mode, quota) */
    }

    return { success: true, data };
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Error al analizar la URL";
    return { success: false, error: friendlyError(raw) };
  }
}
