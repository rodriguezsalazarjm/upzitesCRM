"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import {
  BRANDING_PROJECTS,
  WEB_PROJECTS,
  type BrandingProject,
  type WebProject,
} from "@/lib/projects";

type Selected =
  | { kind: "branding"; p: BrandingProject }
  | { kind: "web"; p: WebProject }
  | null;

const FILTERS = [
  { key: "all", label: "Todos" },
  { key: "Empresarial", label: "Empresariales" },
  { key: "Foodie", label: "Foodie" },
  { key: "Marca", label: "Marcas" },
  { key: "web", label: "Webs" },
];

const WEB_COLORS = ["var(--upz-electric)", "var(--upz-tomato)", "var(--upz-guava)", "var(--upz-lime)"];

function clean(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function ProjectsGallery() {
  const [filter, setFilter] = useState("all");
  const [sel, setSel] = useState<Selected>(null);

  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSel(null); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [sel]);

  const showBranding = filter === "all" || ["Empresarial", "Foodie", "Marca"].includes(filter);
  const brandingItems = BRANDING_PROJECTS.filter((p) => filter === "all" || p.category === filter);
  const showWebs = filter === "all" || filter === "web";

  return (
    <>
      <div className="pg-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`pg-filter${filter === f.key ? " is-active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="pg-grid">
        {showBranding &&
          brandingItems.map((p) => (
            <button key={p.slug} type="button" className="pg-card" onClick={() => setSel({ kind: "branding", p })}>
              <img src={p.images[0]} alt={p.name} loading="lazy" />
              <span className="pg-card-cap">
                <span className="pg-card-name">{p.name}</span>
                <span className="pg-card-cat">{p.category}</span>
              </span>
              <span className="pg-card-hover"><span>Ver caso</span> <span className="arr">↗</span></span>
            </button>
          ))}

        {showWebs &&
          WEB_PROJECTS.map((p, i) => (
            <button
              key={p.slug}
              type="button"
              className="pg-card pg-card--web"
              onClick={() => setSel({ kind: "web", p })}
              style={{ "--pg-web": WEB_COLORS[i % WEB_COLORS.length] } as CSSProperties}
            >
              <span className="pg-web-cover">
                <span className="pg-web-tag">Sitio web{p.status ? ` · ${p.status}` : ""}</span>
                <span className="pg-web-name">{p.name}</span>
                <span className="pg-web-domain">{clean(p.url)}</span>
              </span>
              <span className="pg-card-hover"><span>Ver sitio</span> <span className="arr">↗</span></span>
            </button>
          ))}
      </div>

      {sel && (
        <div className="pg-modal" onClick={() => setSel(null)} role="dialog" aria-modal="true">
          <div className="pg-modal-panel" onClick={(e) => e.stopPropagation()}>
            <button className="pg-modal-close" type="button" onClick={() => setSel(null)} aria-label="Cerrar">✕</button>

            {sel.kind === "branding" ? (
              <div className="pg-case">
                <div className="pg-case-head">
                  <span className="pg-card-cat">{sel.p.category}</span>
                  <h3 className="pg-case-name">{sel.p.name}</h3>
                  <p className="pg-case-desc">{sel.p.description}</p>
                  <div className="pg-case-meta">
                    <div>
                      <span className="pg-case-label">Puntos fuertes</span>
                      <div className="proj-tags">
                        {sel.p.fuertes.map((f) => <span key={f} className="proj-tag">{f}</span>)}
                      </div>
                    </div>
                    <div>
                      <span className="pg-case-label">Beneficios</span>
                      <ul className="proj-benefits">
                        {sel.p.beneficios.map((b) => (
                          <li key={b}><span className="proj-benefit-arr">↗</span>{b}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="pg-case-gallery">
                  {sel.p.images.map((src, i) => (
                    <img key={i} src={src} alt={`${sel.p.name} — ${i + 1}`} loading="lazy" />
                  ))}
                </div>
              </div>
            ) : (
              <div className="pg-webview">
                <h3 className="pg-case-name">{sel.p.name}</h3>
                <div className="proj-browser">
                  <div className="proj-browser-bar">
                    <span className="proj-dot" /><span className="proj-dot" /><span className="proj-dot" />
                    <span className="proj-url">{clean(sel.p.url)}</span>
                    <a className="proj-open" href={sel.p.url} target="_blank" rel="noopener noreferrer">Abrir sitio ↗</a>
                  </div>
                  <div className="proj-browser-body">
                    <iframe src={sel.p.url} title={`Vista previa de ${sel.p.name}`} loading="lazy" />
                  </div>
                </div>
                <p className="proj-browser-note">Vista previa en vivo del sitio. Si no carga, ábrelo con “Abrir sitio”.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
