// Convierte los diseños .dc.html (Claude Design) al stack Next.js del proyecto.
// Resuelve el template del runtime propio ({{ }}, <sc-for>, estado inicial) a
// HTML estatico, y genera un componente cliente que reusa un pequeño runtime
// (DcRuntime) para la interactividad (reveal, hover, nav-scroll, FAQ).
//
// Uso: node scripts/convert-landing.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import vm from "node:vm";

const ROOT = process.cwd();
const SRC = join(ROOT, "Soluciones");
const OUT = join(ROOT, "apps", "web", "app", "soluciones");
const PUB = join(ROOT, "apps", "web", "public", "soluciones");

const TARGETS = [
  { dir: "01invita", file: "Invitaciones Digitales.dc.html", route: "invitaciones", scope: "dc-invita", comp: "InvitacionesPage", title: "Invitaciones Digitales Personalizadas | UPZITES", desc: "Invitaciones web elegantes, interactivas y fáciles de compartir para bodas, cumpleaños, baby showers y eventos especiales. Diseñadas por UPZITES.", content: "Invitaciones Digitales" },
  { dir: "02reels24h", file: "Reel Express 24H.dc.html", route: "reels", scope: "dc-reels", comp: "ReelsPage", title: "Reel Express 24H · Contenido para redes en 24 horas | UPZITES", desc: "Grabamos, editamos y entregamos reels, videos UGC y contenido comercial vertical listo para publicar en 24 horas.", content: "Reel Express 24H" },
  { dir: "03CRM", file: "CRM UPZITES Landing.dc.html", route: "crm", scope: "dc-crm", comp: "CrmLandingPage", title: "CRM UPZITES · Captura y convierte tus leads | UPZITES", desc: "Un CRM que captura tus leads desde web, formularios y WhatsApp, los ordena y te ayuda a cerrar más ventas.", content: "CRM UPZITES" },
  { dir: "04QR Restaurant landing", file: "Carta QR Interactiva.dc.html", route: "carta-qr", scope: "dc-qr", comp: "CartaQrPage", title: "Carta QR Interactiva para Restaurantes | UPZITES", desc: "Mucho más que una carta QR: tus clientes piden, llaman al mesero y piden la cuenta desde la mesa; tu equipo recibe todo en tiempo real.", content: "Carta QR Interactiva" },
];

// ---- helpers ---------------------------------------------------------------
function sliceBetween(s, startTag, endTag) {
  const i = s.indexOf(startTag);
  const j = s.indexOf(endTag, i + startTag.length);
  if (i < 0 || j < 0) return "";
  return s.slice(i + startTag.length, j);
}

// Extrae el cuerpo de un metodo "name() { ... }" balanceando llaves.
function extractMethodBody(src, name) {
  const sig = src.indexOf(name + "() {");
  if (sig < 0) return null;
  let i = src.indexOf("{", sig);
  let depth = 0, start = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(start + 1, i);
}

// Extrae un objeto literal `{...}` que sigue a `marker`, balanceando llaves.
function extractObjectAfter(src, marker) {
  const m = src.indexOf(marker);
  if (m < 0) return null;
  let i = src.indexOf("{", m);
  if (i < 0) return null;
  const start = i;
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

// Evalua renderVals() en un sandbox para obtener los valores de binding.
function evalRenderVals(scriptSrc, override = {}) {
  // estado inicial real (class field `state = {...}` o `this.state = {...}`)
  let parsed = {};
  const objLit = extractObjectAfter(scriptSrc, "this.state =") || extractObjectAfter(scriptSrc, "\n    state =") || extractObjectAfter(scriptSrc, " state =");
  if (objLit) {
    try { parsed = vm.runInNewContext("(" + objLit + ")", { Array, Date }); } catch { parsed = {}; }
  }
  const stateDefaults = {
    scrolled: false, faq: [], order: [], requests: [], cart: [],
    filter: "all", menuCat: "all", modalItem: null, openFaq: -1, faqOpen: -1, open: -1,
  };
  const stateBase = { ...stateDefaults, ...parsed, ...override };
  const stateProxy = new Proxy(stateBase, {
    get(t, k) {
      if (k in t) return t[k];
      const ks = String(k);
      if (/faq|order|requests|cart|list|items|s$/i.test(ks)) return [];
      return "";
    },
  });
  const propsProxy = new Proxy(
    {},
    {
      get(_t, k) {
        const ks = String(k);
        if (/whatsapp|phone|number/i.test(ks)) return "56973178796";
        if (/^(show|enable|is|has|highlight)/i.test(ks)) return true;
        return "";
      },
    },
  );
  const ReactStub = {
    createElement: (_tag, props) => {
      const html = props && props.dangerouslySetInnerHTML ? props.dangerouslySetInnerHTML.__html : "";
      return { __dcHtml: `<span style="display:flex">${html}</span>` };
    },
  };
  const base = {
    state: stateProxy,
    props: propsProxy,
    toggleFaq: () => {}, setState: () => {}, setFilter: () => {},
    setMenuCat: () => {}, addToOrder: () => {}, toggle: () => {},
  };
  // Valor tolerante para accesos desconocidos: usable como array Y como función.
  const flex = Object.assign(() => "", { map: () => [], forEach: () => {}, filter: () => [], slice: () => [], join: () => "" });
  const self = new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k];
      return flex;
    },
  });
  const body = extractMethodBody(scriptSrc, "renderVals");
  if (!body) { console.warn("  ! renderVals body not found"); return {}; }
  try {
    const ctx = vm.createContext({ React: ReactStub, window: {}, document: {}, Math, Array, Object, JSON, Date, encodeURIComponent });
    const wrapped = vm.runInContext("(function(React){ return (function(){" + body + "}); })", ctx);
    return wrapped(ReactStub).call(self) || {};
  } catch (e) {
    console.warn("  ! renderVals eval failed:", e.message);
    return {};
  }
}

function stringifyVal(v) {
  if (v == null) return "";
  if (typeof v === "object") {
    if (v.__dcHtml) return v.__dcHtml;
    return "";
  }
  return String(v);
}

// Expande recursivamente los controles del runtime: <sc-for> (loops) y
// <sc-if> (condicionales), soportando anidamiento mixto y dependencia del
// item externo. Procesa el control que aparezca primero y continúa.
function expandControls(html, scope) {
  const fFor = html.indexOf("<sc-for");
  const fIf = html.indexOf("<sc-if");
  if (fFor < 0 && fIf < 0) return html;
  const isFor = fFor >= 0 && (fIf < 0 || fFor < fIf);
  const tagName = isFor ? "sc-for" : "sc-if";
  const open = isFor ? fFor : fIf;
  const tagEnd = html.indexOf(">", open);
  const tag = html.slice(open, tagEnd + 1);
  // cierre balanceado contando el mismo tag
  let i = tagEnd + 1, depth = 1;
  const openTok = "<" + tagName, closeTok = "</" + tagName + ">";
  while (i < html.length && depth > 0) {
    const no = html.indexOf(openTok, i);
    const nc = html.indexOf(closeTok, i);
    if (nc < 0) break;
    if (no >= 0 && no < nc) { depth++; i = no + openTok.length; }
    else { depth--; i = nc + closeTok.length; }
  }
  const inner = html.slice(tagEnd + 1, i - closeTok.length);
  const before = html.slice(0, open);
  const after = html.slice(i);

  let out = "";
  if (isFor) {
    const listExpr = (tag.match(/list="\{\{\s*([\w.]+)\s*\}\}"/) || [])[1] || "";
    const asName = (tag.match(/as="(\w+)"/) || [])[1] || "item";
    let list = resolvePath(scope, listExpr);
    if (!Array.isArray(list)) list = [];
    out = list
      .map((item) => {
        const cs = { ...scope, [asName]: item };
        let chunk = expandControls(inner, cs);
        chunk = chunk.replace(new RegExp("\\{\\{\\s*" + asName + "\\.([\\w.]+)\\s*\\}\\}", "g"), (_x, k) =>
          stringifyVal(resolvePath(item, k)),
        );
        chunk = chunk.replace(new RegExp("\\{\\{\\s*" + asName + "\\s*\\}\\}", "g"), () => stringifyVal(item));
        return chunk;
      })
      .join("\n");
  } else {
    let cond = (tag.match(/value="\{\{\s*([\w.!]+)\s*\}\}"/) || [])[1] || "";
    let neg = false;
    if (cond.startsWith("!")) { neg = true; cond = cond.slice(1); }
    let val = resolvePath(scope, cond);
    if (val === undefined) val = /open$|modal|menu|active/i.test(cond) ? false : true;
    val = neg ? !val : !!val;
    out = val ? expandControls(inner, scope) : "";
  }
  return before + out + expandControls(after, scope);
}

function resolvePath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}

// Transforma interactividad a data-attrs que entiende DcRuntime.
function wireInteractivity(html, navBg, navShadow) {
  // nav scroll (guarda los valores "scrolled" para que el runtime los aplique)
  const navAttrs = `data-dc-nav data-dc-nav-bg=${JSON.stringify(navBg || "rgba(255,255,255,0.92)")} data-dc-nav-shadow=${JSON.stringify(navShadow || "0 1px 0 rgba(0,0,0,0.08)")}`;
  html = html.replace(/<nav\s+style=/, `<nav ${navAttrs} style=`);
  // faq: onclick -> data-dc-faq ; max-height binding -> marker ; icon
  html = html.replace(/onclick="\{\{\s*toggleFaq(\d+)\s*\}\}"/g, 'data-dc-faq="$1"');
  html = html.replace(/onclick="\{\{\s*toggle(\d+)\s*\}\}"/g, 'data-dc-faq="$1"');
  html = html.replace(/max-height:\s*\{\{\s*faqMax(\d+)\s*\}\}/g, "max-height:0px;--dc-faq-$1:1");
  html = html.replace(/\{\{\s*faqIcon(\d+)\s*\}\}/g, '<span data-dc-faqicon="$1">+</span>');
  return html;
}

// Limpia bindings de estado dinamico que quedan, dejando valores iniciales.
function resolveScalars(html, vals) {
  // nav bg/shadow -> transparente inicial
  html = html.replace(/\{\{\s*navBg\s*\}\}/g, "rgba(0,0,0,0)");
  html = html.replace(/\{\{\s*navShadow\s*\}\}/g, "0 0 0 rgba(0,0,0,0)");
  // resto de escalares conocidos
  html = html.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_m, name) => {
    if (name in vals) return stringifyVal(vals[name]);
    return "";
  });
  // cualquier binding restante (handlers, expresiones) -> vacio
  html = html.replace(/\{\{[\s\S]*?\}\}/g, "");
  return html;
}

// Reescribe src="assets/..." a la ruta publica.
function rewriteAssets(html, route) {
  return html.replace(/src="assets\//g, `src="/soluciones/${route}/assets/`);
}

// Prepara el CSS del diseño para inyectarlo dentro de un Shadow DOM.
// En shadow, body/html no aplican → se mapean a :host. El resto (incluido *,
// ::selection y @keyframes) queda aislado del sitio de forma nativa.
function prepareShadowCss(css) {
  return css
    .replace(/:root\b/g, ":host") // las custom props deben vivir en :host dentro del shadow
    .replace(/(^|\})\s*html\s*\{/g, "$1 :host {")
    .replace(/(^|\})\s*body\s*\{/g, "$1 :host {");
}

function copyAssets(srcDir, route) {
  const aIn = join(srcDir, "assets");
  if (!existsSync(aIn)) return;
  const aOut = join(PUB, route, "assets");
  mkdirSync(aOut, { recursive: true });
  for (const f of readdirSync(aIn)) copyFileSync(join(aIn, f), join(aOut, f));
}

function build(t) {
  console.log("→", t.route);
  const raw = readFileSync(join(SRC, t.dir, t.file), "utf8");
  const css = sliceBetween(raw, "<style>", "</style>");
  // El script del componente es <script type="text/x-dc" data-dc-script> ... </script>
  const compTagIdx = raw.indexOf("data-dc-script");
  const compOpen = raw.lastIndexOf("<script", compTagIdx);
  const compContentStart = raw.indexOf(">", compTagIdx) + 1;
  const compEnd = raw.indexOf("</script>", compContentStart);
  const scriptSrc = raw.slice(compContentStart, compEnd);
  let body = raw.slice(raw.indexOf("</helmet>") + "</helmet>".length, compOpen);
  // quita el </x-dc> de cierre si quedó
  body = body.replace(/<\/x-dc>\s*$/i, "").trim();

  const vals = evalRenderVals(scriptSrc);
  const valsScrolled = evalRenderVals(scriptSrc, { scrolled: true });
  body = expandControls(body, vals);
  body = wireInteractivity(body, valsScrolled.navBg, valsScrolled.navShadow);
  body = resolveScalars(body, vals);
  body = rewriteAssets(body, t.route);

  // fuentes: hrefs de los <link rel="stylesheet"> del diseño (se cargan en el
  // documento principal para que estén disponibles dentro del Shadow DOM).
  const fontHrefs = (raw.match(/<link[^>]+rel="stylesheet"[^>]*>/g) || [])
    .map((l) => (l.match(/href="([^"]+)"/) || [])[1])
    .filter(Boolean);
  const fontLinks = fontHrefs
    .map((href) => `<link rel="stylesheet" href=${JSON.stringify(href)} />`)
    .join("\n      ");

  const designCss = prepareShadowCss(css);
  copyAssets(join(SRC, t.dir), t.route);

  const outDir = join(OUT, t.route);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "design.data.ts"),
    "export const css = " + JSON.stringify(designCss) + ";\n\nexport const html = " + JSON.stringify(body) + ";\n");

  const page = `import type { Metadata } from "next";
import { ViewContentOnLoad } from "@/components/MetaPixelEvents";
import { DcRuntime } from "@/components/DcRuntime";
import { css, html } from "./design.data";

export const metadata: Metadata = {
  title: ${JSON.stringify(t.title)},
  description: ${JSON.stringify(t.desc)},
  openGraph: { title: ${JSON.stringify(t.title)}, description: ${JSON.stringify(t.desc)}, type: "website" },
};

export default function ${t.comp}() {
  return (
    <>
      ${fontLinks}
      <ViewContentOnLoad contentName=${JSON.stringify(t.content)} contentCategory="solucion" contentId=${JSON.stringify("landing:" + t.route)} />
      <DcRuntime className=${JSON.stringify(t.scope)} css={css} html={html} />
    </>
  );
}
`;
  writeFileSync(join(outDir, "page.tsx"), page);
  console.log("  ✓", join("apps/web/app/soluciones", t.route));
}

for (const t of TARGETS) build(t);
console.log("listo.");
