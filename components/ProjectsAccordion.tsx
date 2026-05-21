"use client";

import { useState } from "react";
import { BRANDING_PROJECTS, BRANDING_CATEGORIES, WEB_PROJECTS } from "@/lib/projects";
import { GalleryMarquee } from "./GalleryMarquee";

function clean(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function ProjectsAccordion() {
  const [openB, setOpenB] = useState<string | null>(BRANDING_PROJECTS[0]?.slug ?? null);
  const [openW, setOpenW] = useState<string | null>(null);

  return (
    <div className="proj-blocks">
      {/* Branding & Identidad */}
      <div className="proj-block">
        <h3 className="proj-block-title">
          Branding &amp; Identidad <span>{String(BRANDING_PROJECTS.length).padStart(2, "0")}</span>
        </h3>

        {BRANDING_CATEGORIES.map((cat) => {
          const items = BRANDING_PROJECTS.filter((p) => p.category === cat.key);
          if (!items.length) return null;
          return (
            <div className="proj-cat-group" key={cat.key}>
              <div className="proj-cat-label">
                {cat.label} <span>{String(items.length).padStart(2, "0")}</span>
              </div>
              <div className="proj-acc">
                {items.map((p, i) => {
                  const open = openB === p.slug;
                  return (
                    <div className={`proj-row${open ? " is-open" : ""}`} key={p.slug}>
                      <button
                        type="button"
                        className="proj-head"
                        aria-expanded={open}
                        onClick={() => setOpenB(open ? null : p.slug)}
                      >
                        <span className="proj-num">{String(i + 1).padStart(2, "0")}</span>
                        <span className="proj-name">{p.name}</span>
                        <span className="proj-cat">{p.images.length} piezas</span>
                        <span className="proj-toggle" aria-hidden="true">+</span>
                      </button>
                      <div className="proj-panel">
                        <div className="proj-panel-inner">
                          <div className="proj-case">
                            <p className="proj-desc">{p.description}</p>
                            <div className="proj-case-meta">
                              <div className="proj-meta-col">
                                <span className="proj-meta-label">Puntos fuertes</span>
                                <div className="proj-tags">
                                  {p.fuertes.map((f) => <span key={f} className="proj-tag">{f}</span>)}
                                </div>
                              </div>
                              <div className="proj-meta-col">
                                <span className="proj-meta-label">Beneficios</span>
                                <ul className="proj-benefits">
                                  {p.beneficios.map((b) => (
                                    <li key={b}><span className="proj-benefit-arr">↗</span>{b}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                          {open && <GalleryMarquee images={p.images} name={p.name} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Webs & Desarrollo */}
      <div className="proj-block">
        <h3 className="proj-block-title">
          Webs &amp; Desarrollo <span>{String(WEB_PROJECTS.length).padStart(2, "0")}</span>
        </h3>
        <div className="proj-acc">
          {WEB_PROJECTS.map((p, i) => {
            const open = openW === p.slug;
            return (
              <div className={`proj-row${open ? " is-open" : ""}`} key={p.slug}>
                <button
                  type="button"
                  className="proj-head"
                  aria-expanded={open}
                  onClick={() => setOpenW(open ? null : p.slug)}
                >
                  <span className="proj-num">{String(i + 1).padStart(2, "0")}</span>
                  <span className="proj-name">
                    {p.name}
                    {p.status && <em className="proj-status">{p.status}</em>}
                  </span>
                  <span className="proj-cat">{clean(p.url)}</span>
                  <span className="proj-toggle" aria-hidden="true">+</span>
                </button>
                <div className="proj-panel">
                  <div className="proj-panel-inner">
                    <div className="proj-browser">
                      <div className="proj-browser-bar">
                        <span className="proj-dot" /><span className="proj-dot" /><span className="proj-dot" />
                        <span className="proj-url">{clean(p.url)}</span>
                        <a className="proj-open" href={p.url} target="_blank" rel="noopener noreferrer">
                          Abrir sitio ↗
                        </a>
                      </div>
                      <div className="proj-browser-body">
                        {open ? (
                          <iframe src={p.url} title={`Vista previa de ${p.name}`} loading="lazy" />
                        ) : (
                          <div className="proj-browser-poster">Vista previa</div>
                        )}
                      </div>
                    </div>
                    <p className="proj-browser-note">
                      Vista previa en vivo del sitio. Si no carga, ábrelo en una pestaña nueva con
                      “Abrir sitio”.
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
