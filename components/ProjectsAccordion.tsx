"use client";

import { useState } from "react";
import { BRANDING_PROJECTS, WEB_PROJECTS } from "@/lib/projects";

function clean(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function ProjectsAccordion() {
  const [openB, setOpenB] = useState<number | null>(0);
  const [openW, setOpenW] = useState<number | null>(null);

  return (
    <div className="proj-blocks">
      {/* Branding & Identidad */}
      <div className="proj-block">
        <h3 className="proj-block-title">
          Branding &amp; Identidad <span>{String(BRANDING_PROJECTS.length).padStart(2, "0")}</span>
        </h3>
        <div className="proj-acc">
          {BRANDING_PROJECTS.map((p, i) => {
            const open = openB === i;
            return (
              <div className={`proj-row${open ? " is-open" : ""}`} key={p.slug}>
                <button
                  type="button"
                  className="proj-head"
                  aria-expanded={open}
                  onClick={() => setOpenB(open ? null : i)}
                >
                  <span className="proj-num">{String(i + 1).padStart(2, "0")}</span>
                  <span className="proj-name">{p.name}</span>
                  <span className="proj-cat">{p.category}</span>
                  <span className="proj-toggle" aria-hidden="true">+</span>
                </button>
                <div className="proj-panel">
                  <div className="proj-panel-inner">
                    <p className="proj-blurb">{p.blurb}</p>
                    <div className="proj-gallery">
                      {p.images.map((src, j) => (
                        <img key={j} src={src} alt={`${p.name} — ${j + 1}`} loading="lazy" />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Webs & Desarrollo */}
      <div className="proj-block">
        <h3 className="proj-block-title">
          Webs &amp; Desarrollo <span>{String(WEB_PROJECTS.length).padStart(2, "0")}</span>
        </h3>
        <div className="proj-acc">
          {WEB_PROJECTS.map((p, i) => {
            const open = openW === i;
            return (
              <div className={`proj-row${open ? " is-open" : ""}`} key={p.slug}>
                <button
                  type="button"
                  className="proj-head"
                  aria-expanded={open}
                  onClick={() => setOpenW(open ? null : i)}
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
