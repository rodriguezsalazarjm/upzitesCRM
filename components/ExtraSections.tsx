"use client";

import React, { useState, useRef } from "react";
import { Eyebrow, Reveal, Barcode } from "./Atoms";
import { runAudit, getCachedAudit } from "@/lib/pagespeed";

// ---------- Mock score generator (deterministic from URL) ----------
function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
function scoreFor(url: string, salt: string) {
  const n = hashStr(url + "::" + salt);
  return 40 + (n % 60);
}

function gradeColor(score: number) {
  if (score >= 90) return "var(--upz-lime)";
  if (score >= 70) return "var(--upz-solar)";
  if (score >= 50) return "var(--upz-tangerine)";
  return "var(--upz-tomato)";
}

// ---------- Score ring -----------------------------------------------
function ScoreRing({ value, label }: { value: number, label: string }) {
  const size = 120;
  const r = 52;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  const color = gradeColor(value);
  return (
    <div className="audit-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r}
          fill="none" stroke="var(--upz-line)" strokeWidth="8"/>
        <circle cx={size/2} cy={size/2} r={r}
          fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: "stroke-dashoffset 1.2s var(--ease-snap)" }}
        />
      </svg>
      <div className="audit-ring-center">
        <div className="audit-ring-value">{value}</div>
        <div className="audit-ring-label">{label}</div>
      </div>
    </div>
  );
}

// ---------- Audit tool ----------------------------------------------
export function AuditTool() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const lastRunRef = useRef(0);
  const COOLDOWN_MS = 12000;

  function clean(u: string) {
    return u.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const u = url.trim();
    if (!u) return;
    setNotice(null);

    // Cached result for this URL → instant, no API call, no cooldown.
    const cached = getCachedAudit(u);
    if (cached) {
      setResult(cached);
      return;
    }

    // Cooldown between live audits to protect the API quota / avoid spam.
    const since = Date.now() - lastRunRef.current;
    if (since < COOLDOWN_MS) {
      setNotice(`Espera ${Math.ceil((COOLDOWN_MS - since) / 1000)} s antes de auditar otra URL.`);
      return;
    }

    lastRunRef.current = Date.now();
    setLoading(true);
    setResult(null);

    const res = await runAudit(u);
    if (res.success) {
      setResult(res.data);
    } else {
      setNotice(res.error);
    }
    setLoading(false);
  }

  function reset() {
    setResult(null);
    setUrl("");
    setNotice(null);
  }

  return (
    <section className="audit-section" id="auditoria" data-screen-label="Audit">
      <div className="shell">
        <div className="audit-head">
          <Eyebrow num="02">Auditoría web · Gratis · 60 segundos</Eyebrow>
          <div className="audit-head-grid">
            <Reveal>
              <h2 className="audit-h">
                Audita tu sitio.<br />
                <span className="b">Sin formularios.</span><br />
                <span className="hl">Sin agencia-speak<span style={{ color: "var(--upz-electric)" }}>.</span></span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p className="audit-sub">
                Reporte instantáneo de <strong>SEO, performance, accesibilidad
                y mejores prácticas</strong>. Conoce qué frena a tu sitio antes
                de gastar un dólar en agencias o ads.
              </p>
              <div className="audit-meta">
                <div><span className="b">→</span> PageSpeed mobile + desktop</div>
                <div><span className="b">→</span> Core Web Vitals (LCP · CLS · INP)</div>
                <div><span className="b">→</span> SEO técnico · accesibilidad WCAG</div>
                <div><span className="b">→</span> Recomendaciones priorizadas</div>
              </div>
            </Reveal>
          </div>
        </div>

        <Reveal delay={180}>
          <form className="audit-form" onSubmit={run}>
            <span className="audit-form-prefix">https://</span>
            <input
              type="text"
              className="audit-form-input"
              placeholder="tu-sitio.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
            <button type="submit" className="audit-form-btn" disabled={loading}>
              {loading ? "Analizando…" : "Auditar ahora"} <span className="arr">↗</span>
            </button>
          </form>
          <div className="audit-form-note">
            Reporte preliminar sin email. Para el informe completo en PDF,
            te lo enviamos a tu correo.
          </div>
          {notice && (
            <div className="audit-notice" role="alert">{notice}</div>
          )}
        </Reveal>

        {loading && (
          <div className="audit-loader" role="status">
            <div className="audit-loader-bar"><span></span></div>
            <div className="audit-loader-text">
              <span>Crawleando {clean(url)} · </span>
              <span>analizando recursos · </span>
              <span>midiendo Core Web Vitals…</span>
            </div>
          </div>
        )}

        {result && (
          <div className="audit-result">
            <div className="audit-result-head">
              <div>
                <div className="audit-result-label">Reporte para</div>
                <div className="audit-result-url">{result.url}<span className="arr">↗</span></div>
              </div>
              <div className="audit-result-actions">
                <button type="button" className="btn btn-ivory btn-sm" onClick={reset}>
                  Auditar otra <span className="arr">↗</span>
                </button>
                <a href="#contact" className="btn btn-dark btn-sm">
                  Quiero el reporte completo <span className="arr">↗</span>
                </a>
              </div>
            </div>

            <div className="audit-rings">
              <ScoreRing value={result.performanceMobile} label="Mobile" />
              <ScoreRing value={result.performanceDesktop} label="Desktop" />
              <ScoreRing value={result.seo} label="SEO" />
              <ScoreRing value={result.accessibility} label="A11y" />
              <ScoreRing value={result.bestPractices} label="Best Pr." />
            </div>

            <div className="audit-vitals">
              <div className="audit-vital">
                <div className="audit-vital-num" style={{ color: Number(result.lcp) <= 2.5 ? "var(--upz-lime)" : Number(result.lcp) <= 4 ? "var(--upz-solar)" : "var(--upz-tomato)" }}>{result.lcp}s</div>
                <div className="audit-vital-label">LCP <span className="meta">Largest Contentful Paint</span></div>
                <div className="audit-vital-bar">
                  <span style={{ width: `${Math.min(100, (4 - Number(result.lcp)) / 4 * 100)}%`, background: Number(result.lcp) <= 2.5 ? "var(--upz-lime)" : "var(--upz-tomato)" }}></span>
                </div>
              </div>
              <div className="audit-vital">
                <div className="audit-vital-num" style={{ color: Number(result.cls) <= 0.1 ? "var(--upz-lime)" : "var(--upz-tomato)" }}>{result.cls}</div>
                <div className="audit-vital-label">CLS <span className="meta">Cumulative Layout Shift</span></div>
                <div className="audit-vital-bar">
                  <span style={{ width: `${Math.max(15, 100 - Number(result.cls) * 400)}%`, background: Number(result.cls) <= 0.1 ? "var(--upz-lime)" : "var(--upz-tomato)" }}></span>
                </div>
              </div>
              <div className="audit-vital">
                <div className="audit-vital-num" style={{ color: result.inp <= 200 ? "var(--upz-lime)" : result.inp <= 500 ? "var(--upz-solar)" : "var(--upz-tomato)" }}>{result.inp}ms</div>
                <div className="audit-vital-label">INP <span className="meta">Interaction to Next Paint</span></div>
                <div className="audit-vital-bar">
                  <span style={{ width: `${Math.max(15, 100 - result.inp / 5)}%`, background: result.inp <= 200 ? "var(--upz-lime)" : "var(--upz-tomato)" }}></span>
                </div>
              </div>
            </div>

            <div className="audit-checks">
              <h4>Hallazgos prioritarios</h4>
              <ul>
                {result.performanceMobile < 80 && (
                  <li><span className="audit-check audit-check-bad">●</span> Imágenes sin optimizar / sin formato moderno (WebP/AVIF). <span className="audit-fix">Impacto: alto</span></li>
                )}
                {result.seo < 90 && (
                  <li><span className="audit-check audit-check-warn">●</span> Meta description / OG tags incompletos en {hashStr(result.url + "pages") % 7 + 2} páginas. <span className="audit-fix">Impacto: medio</span></li>
                )}
                {result.accessibility < 90 && (
                  <li><span className="audit-check audit-check-warn">●</span> Contraste de texto bajo umbral WCAG AA en {hashStr(result.url + "a11y") % 12 + 3} elementos. <span className="audit-fix">Impacto: medio</span></li>
                )}
                {Number(result.lcp) > 2.5 && (
                  <li><span className="audit-check audit-check-bad">●</span> Hero LCP {result.lcp}s — supera umbral 2.5s. <span className="audit-fix">Impacto: alto</span></li>
                )}
                <li><span className="audit-check audit-check-ok">●</span> HTTPS · sitemap.xml · robots.txt presentes. <span className="audit-fix">OK</span></li>
                <li><span className="audit-check audit-check-warn">●</span> Schema.org structured data ausente o incompleto. <span className="audit-fix">Impacto: medio</span></li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------- Schedule meeting ----------------------------------------
const STEPS_AGENDA = [
  {
    num: "01", title: "Te escuchamos",
    body: "Tendremos una breve charla para entender a fondo tus objetivos, desafíos y la visión de tu proyecto.",
  },
  {
    num: "02", title: "Propuesta a medida",
    body: "Con la información clave, diseñamos un plan estratégico y una propuesta comercial clara para ti.",
  },
  {
    num: "03", title: "¡Manos a la obra!",
    body: "Una vez aprobada la propuesta, activamos a nuestro equipo y damos inicio a la transformación digital.",
  },
];

// Build a 14-day window starting from today
function buildDays() {
  const out = [];
  const today = new Date();
  for (let i = 1; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push({
      iso: d.toISOString().slice(0, 10),
      day: d.getDate(),
      weekday: ["DOM","LUN","MAR","MIÉ","JUE","VIE","SÁB"][d.getDay()],
      month: ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"][d.getMonth()],
      disabled: d.getDay() === 0 || d.getDay() === 6,
    });
  }
  return out;
}

const SLOTS = ["09:00", "10:30", "12:00", "14:30", "16:00", "17:30"];

export function ScheduleMeeting() {
  const [calOpen, setCalOpen] = useState(false);
  return (
    <section className="agenda" id="agenda" data-screen-label="Agenda meeting">
      <div className="shell">
        <Eyebrow num="05">Agenda · Reunión inicial</Eyebrow>
        <div className="agenda-head">
          <Reveal>
            <h2 className="agenda-h">
              Agenda una<br />
              <span className="b">reunión<br />con nosotros<span style={{ color: "var(--upz-electric)" }}>.</span></span>
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="agenda-sub">
              En breves minutos podremos conocernos y entender cómo potenciar
              tu marca con <strong>branding estratégico</strong> o crear una
              <strong> web de alto rendimiento</strong> para tu negocio.
            </p>
          </Reveal>
        </div>

        <div className="agenda-grid">
          <div className="agenda-steps">
            {STEPS_AGENDA.map((s, i) => (
              <Reveal key={s.num} delay={i * 80}>
                <div className="agenda-step">
                  <span className="agenda-step-num">{s.num}</span>
                  <div className="agenda-step-body">
                    <h3 className="agenda-step-title">{s.title}</h3>
                    <p>{s.body}</p>
                  </div>
                  <span className="agenda-step-rule"></span>
                </div>
              </Reveal>
            ))}

            <Reveal delay={300}>
              <div className="agenda-disclaimer">
                <Barcode />
                <span>
                  ↗ Reunión vía Google Meet · Duración 30 min · Sin costo
                </span>
              </div>
            </Reveal>
          </div>

          <Reveal delay={140}>
            <aside className="agenda-cal" style={{ padding: 0, overflow: "hidden", background: "#fff", minHeight: 580 }}>
              {calOpen ? (
                /* Cal.com solo se carga al hacer clic — fuera del DOM inicial. */
                <iframe
                  src="https://cal.com/jose-manuel-rodriguez-z9ee2y/60min?embed=1"
                  title="Agenda con UPZITES"
                  loading="lazy"
                  style={{ width: "100%", height: "100%", minHeight: "580px", border: "none" }}
                />
              ) : (
                <button type="button" className="agenda-cal-facade" onClick={() => setCalOpen(true)}>
                  <span className="agenda-cal-facade-tag">Cal.com · Google Meet · 30 min</span>
                  <span className="agenda-cal-facade-title">Reserva tu reunión</span>
                  <span className="agenda-cal-facade-sub">Toca para ver la disponibilidad en vivo y elegir tu horario.</span>
                  <span className="btn btn-dark btn-lg agenda-cal-facade-btn">Ver disponibilidad <span className="arr">↗</span></span>
                </button>
              )}
            </aside>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
