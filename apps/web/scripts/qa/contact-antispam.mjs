// QA de /api/contact contra el dev server local (sin RESEND_API_KEY, para no mandar correos).
// Uso: node apps/web/scripts/qa/contact-antispam.mjs <base|turnstile|turnstile-fail|turnstile-spent|upstash|upstash-down>
// Las fases turnstile* y upstash* requieren las claves de prueba de Cloudflare / el mock en .env.local
// (ver docs/seguridad-formulario-contacto-2026-10-11.md).
const BASE = "http://localhost:3000/api/contact";
// Respuesta del descarte silencioso (honeypot). Ningún envío legítimo debe recibirla en local.
const SILENT_MSG = "Solicitud recibida con exito.";
const phase = process.argv[2];
let ipSeq = Math.floor(Math.random() * 200);
const freshIp = () => `10.${Math.floor(Math.random() * 250)}.${ipSeq++ % 250}.${Math.floor(Math.random() * 250)}`;
const uniq = () => Math.random().toString(36).slice(2, 8);
const valid = (extra = {}) => ({
  name: "María José Peña", email: `qa.${uniq()}@empresa.cl`, phone: "", whatsapp: "+56 9 1234 5678",
  company: "Café Ñandú SpA", industry: "Gastronomía", service: "Branding y Dirección Visual",
  budget: "$500.000 - $1.500.000 CLP", urgency: "Este mes", message: "Hola, quiero rediseñar mi marca.",
  consent: true, website: "", formElapsedMs: 25000, pageUrl: "http://localhost:3000/contacto", referrer: "", ...extra,
});
async function post(body, { ip = freshIp(), headers = {}, raw } = {}) {
  const h = { "content-type": "application/json", "x-real-ip": ip, origin: "http://localhost:3000", ...headers };
  for (const k of Object.keys(h)) if (h[k] === "") delete h[k];
  const r = await fetch(BASE, { method: "POST", headers: h, body: raw ?? JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, body: text.slice(0, 160), retry: r.headers.get("retry-after") };
}
const results = [];
async function t(name, expectStatus, p, check) {
  const r = await p;
  const pass = r.status === expectStatus && (!check || check(r));
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name} -> ${r.status} ${r.body}${r.retry ? " retry-after=" + r.retry : ""}`);
}
const tally = (arr) => arr.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});

if (phase === "base") {
  await t("válido", 200, post(valid()));
  await t("solo obligatorios (opcionales vacíos)", 200, post({ name: "Ana", email: `a.${uniq()}@x.io`, message: "Hola", consent: true, service: "E-commerce" }));
  await t("internacional (CJK, apóstrofo, local con acentos)", 200, post(valid({ name: "Zoë O'Brien 李小龍", company: "Müller & Söhne GmbH", email: `jösé.${uniq()}@empresa.com.br`, industry: "Ingeniería" })));
  await t("CTA home (scope propio)", 200, post({ name: "Leo", email: `l.${uniq()}@x.cl`, company: "", service: "UX / UI", message: "Solicitud de UX / UI desde la home.", consent: true, formElapsedMs: 9000 }));
  await t("brief (kind/briefType/budget brief)", 200, post(valid({ kind: "brief", briefType: "Brief de marca personal", service: "Branding personal", budget: "Más de $3.000.000 CLP", audience: "x" })));
  await t("HTML/script como texto se acepta (se escapa en el correo)", 200, post(valid({ name: "<b>x</b>", message: "<script>alert(1)</script><img src=x onerror=alert(1)>" })));
  await t("payload del spam observado (pasa validación: lo frena Turnstile/honeypot)", 200, post(valid({ name: "jFUBQNYqCsnVBnMLNXTQ", company: "Upgtfzksj LLC", industry: "8268726086", message: "FaVjsCJJFscaGCSKfiy", email: `bot.${uniq()}@example.com` })));
  await t("honeypot lleno -> éxito simulado", 200, post(valid({ website: "http://spam.example" })), (r) => r.body.includes(SILENT_MSG));
  // Envío legítimo rápido (autocompletado + mensaje pegado): NO se descarta,
  // recorre el flujo completo. El descarte silencioso devolvería SILENT_MSG;
  // el flujo completo en local (CRM en localhost caído) devuelve otro mensaje.
  await t("legítimo rápido (300 ms, autocompletado) -> flujo completo, no descartado", 200, post(valid({ formElapsedMs: 300 })), (r) => !r.body.includes(SILENT_MSG));
  await t("legítimo instantáneo (0 ms) -> flujo completo", 200, post(valid({ formElapsedMs: 0 })), (r) => !r.body.includes(SILENT_MSG));
  await t("rápido + honeypot -> sigue descartado en silencio", 200, post(valid({ formElapsedMs: 300, website: "x" })), (r) => r.body.includes(SILENT_MSG));
  await t("rápido + inválido -> 400 (la validación sigue aplicando)", 400, post(valid({ formElapsedMs: 300, service: "x" })));
  await t("sin consentimiento", 400, post(valid({ consent: false })));
  await t("consent como string 'true' no vale", 400, post(valid({ consent: "true" })));
  await t("falta nombre", 400, post(valid({ name: "   " })));
  await t("email inválido", 400, post(valid({ email: "no-es-email" })));
  await t("teléfono inválido", 400, post(valid({ whatsapp: "llámame<script>" })));
  await t("select inválido (servicio)", 400, post(valid({ service: "Hackeo" })));
  await t("select inválido (presupuesto)", 400, post(valid({ budget: "$1" })));
  await t("tipo incorrecto (objeto en nombre)", 400, post(valid({ name: { $gt: "" } })));
  await t("nombre de 121 chars", 400, post(valid({ name: "a".repeat(121) })));
  await t("mensaje de 20.001 chars", 400, post(valid({ message: "a".repeat(20001) })));
  await t("body > 64KB", 413, post(null, { raw: JSON.stringify(valid({ junk: "x".repeat(70000) })) }));
  await t("JSON malformado", 400, post(null, { raw: "{name:" }));
  await t("array como body", 400, post(null, { raw: "[1,2]" }));
  await t("content-type no JSON", 415, post(null, { raw: "name=a", headers: { "content-type": "application/x-www-form-urlencoded" } }));
  await t("origin ajeno", 403, post(valid(), { headers: { origin: "https://evil.example" } }));
  await t("directo sin Origin (curl) pasa si todo es válido", 200, post(valid(), { headers: { origin: "" } }));
  await t("respuesta no filtra internals", 200, post(valid()), (r) => !/crm|resend|reason|confirmation/i.test(r.body));

  // Rate limit por IP: 8 concurrentes desde la misma IP -> 5 pasan.
  const ip = freshIp();
  const burst = await Promise.all(Array.from({ length: 8 }, () => post(valid(), { ip })));
  const c = tally(burst);
  const okBurst = c[200] === 5 && c[429] === 3;
  results.push(okBurst);
  console.log(`${okBurst ? "PASS" : "FAIL"}  ráfaga concurrente 8x misma IP -> ${JSON.stringify(c)}`);

  // Rate limit por email: 4 envíos del mismo email desde IPs distintas -> el 4º 429.
  const email = `same.${uniq()}@empresa.cl`;
  const seq = [];
  for (let i = 0; i < 4; i++) seq.push(await post(valid({ email }), { ip: freshIp() }));
  const okEmail = seq.slice(0, 3).every((r) => r.status === 200) && seq[3].status === 429;
  results.push(okEmail);
  console.log(`${okEmail ? "PASS" : "FAIL"}  mismo email 4 veces -> ${seq.map((r) => r.status).join(",")}`);
}

if (phase === "turnstile") {
  await t("Turnstile: sin token", 403, post(valid()));
  await t("Turnstile: token de 3000 chars", 403, post(valid({ turnstileToken: "x".repeat(3000) })));
  await t("Turnstile: token dummy con secret de prueba 'siempre pasa'", 200, post(valid({ turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" })));
  await t("Turnstile: honeypot se evalúa antes", 200, post(valid({ website: "x" })));
  await t("Turnstile: envío rápido sin token -> 403 (lo rápido no salta Turnstile)", 403, post(valid({ formElapsedMs: 300 })));
  await t("Turnstile: envío rápido con token válido -> 200 flujo completo", 200, post(valid({ formElapsedMs: 300, turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" })), (r) => !r.body.includes(SILENT_MSG));
  await t("Turnstile: payload inválido no llega a siteverify", 400, post(valid({ service: "x", turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" })));
}
if (phase === "turnstile-fail") {
  await t("Turnstile: secret 'siempre falla' -> token inválido", 403, post(valid({ turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" })));
}
if (phase === "turnstile-spent") {
  await t("Turnstile: token ya usado/caducado (timeout-or-duplicate)", 403, post(valid({ turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" })));
}
if (phase === "upstash") {
  const ip = freshIp();
  const burst = await Promise.all(Array.from({ length: 10 }, () => post(valid({ turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" }), { ip })));
  const c = tally(burst);
  const ok = c[200] === 5 && c[429] === 5;
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  Upstash: ráfaga concurrente 10x misma IP -> ${JSON.stringify(c)}`);
  const stats = await (await fetch("http://localhost:8799/__stats")).json();
  const hashed = stats.keys.length > 0 && stats.keys.every((k) => /^upz:contact:(ip10m|ip1d|email1d):[0-9a-f]{32}$/.test(k));
  results.push(stats.calls > 0 && hashed);
  console.log(`${stats.calls > 0 && hashed ? "PASS" : "FAIL"}  Upstash: ${stats.calls} pipelines, ${stats.keys.length} claves, todas hasheadas`);
}
if (phase === "upstash-down") {
  await t("Upstash caído -> fail-open, el envío pasa", 200, post(valid({ turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" })));
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} OK`);
process.exit(failed ? 1 : 0);
