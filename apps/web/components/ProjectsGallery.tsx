"use client";

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

type Card =
  | { kind: "branding"; p: BrandingProject }
  | { kind: "web"; p: WebProject };

const FILTERS = [
  { key: "all", label: "Todos" },
  { key: "Empresarial", label: "Empresariales" },
  { key: "Foodie", label: "Foodie" },
  { key: "Ropa", label: "Ropa" },
  { key: "web", label: "Webs" },
];

// Carril de una sola fila: branding + webs, filtrable.
function cardsFor(filter: string): Card[] {
  const branding: Card[] =
    filter === "web"
      ? []
      : BRANDING_PROJECTS
          .filter((p) => filter === "all" || p.category === filter)
          .map((p) => ({ kind: "branding", p }));
  const webs: Card[] =
    filter === "all" || filter === "web"
      ? WEB_PROJECTS.map((p) => ({ kind: "web", p }))
      : [];
  return [...branding, ...webs];
}

function clean(url: string) {
  return url.replace(/^https:\/\//, "").replace(/\/$/, "");
}

function CardFace({ c, onOpen }: { c: Card; onOpen: () => void }) {
  if (c.kind === "branding") {
    return (
      <button type="button" className="pg-card" onClick={onOpen}>
        <img src={c.p.images[0]} alt={c.p.name} loading="lazy" />
        <span className="pg-card-cap">
          <span className="pg-card-name">{c.p.name}</span>
          <span className="pg-card-cat">{c.p.category}</span>
        </span>
        <span className="pg-card-hover"><span>Ver caso</span> <span className="arr">&#8599;</span></span>
      </button>
    );
  }
  return (
    <button type="button" className="pg-card" onClick={onOpen}>
      <img src={c.p.cover} alt={c.p.name} loading="lazy" />
      <span className="pg-card-cap">
        <span className="pg-card-name">{c.p.name}</span>
        <span className="pg-card-cat">Sitio web{c.p.status ? ` · ${c.p.status}` : ""}</span>
      </span>
      <span className="pg-card-hover"><span>Ver sitio</span> <span className="arr">&#8599;</span></span>
    </button>
  );
}

export function ProjectsGallery() {
  const [filter, setFilter] = useState("all");
  const [sel, setSel] = useState<Selected>(null);
  const cards = cardsFor(filter);

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

  const open = (c: Card) => () =>
    setSel(c.kind === "branding" ? { kind: "branding", p: c.p } : { kind: "web", p: c.p });

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

      <div className="pg-marquee" aria-label="Proyectos seleccionados">
        {/* Carril duplicado x2 para loop sin costuras. La 2ª copia es decorativa.
            key incluye el filtro para reiniciar la animación al cambiar. */}
        <div className="pg-marquee-track" key={filter}>
          {cards.map((c, i) => (
            <CardFace key={`a-${c.p.slug}-${i}`} c={c} onOpen={open(c)} />
          ))}
          {cards.map((c, i) => (
            <div key={`b-${c.p.slug}-${i}`} aria-hidden="true" className="pg-marquee-clone">
              <CardFace c={c} onOpen={open(c)} />
            </div>
          ))}
        </div>
      </div>

      {sel && (
        <div className="pg-modal" onClick={() => setSel(null)} role="dialog" aria-modal="true">
          <div className="pg-modal-panel" onClick={(e) => e.stopPropagation()}>
            <button className="pg-modal-close" type="button" onClick={() => setSel(null)} aria-label="Cerrar">×</button>

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
                          <li key={b}><span className="proj-benefit-arr">&#8599;</span>{b}</li>
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
                <span className="pg-card-cat">{sel.p.category}{sel.p.status ? ` · ${sel.p.status}` : ""}</span>
                <h3 className="pg-case-name">{sel.p.name}</h3>
                <div className="proj-browser">
                  <div className="proj-browser-bar">
                    <span className="proj-dot" /><span className="proj-dot" /><span className="proj-dot" />
                    <span className="proj-url">{clean(sel.p.url)}</span>
                    <a className="proj-open" href={sel.p.url} target="_blank" rel="noopener noreferrer">Abrir sitio &#8599;</a>
                  </div>
                  <img className="pg-shot-img" src={sel.p.shot} alt={`Captura de ${sel.p.name}`} loading="lazy" />
                </div>
                <p className="proj-browser-note">Captura del sitio. Ábrelo en vivo con “Abrir sitio”.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
