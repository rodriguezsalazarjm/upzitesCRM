"use client";

import { useEffect, useState } from "react";

const KEY = "upz-cyberweek-seen";
const WA_NUMBER = "56973178796";
const WA_MSG = encodeURIComponent(
  "Hola UPZITES 👋, vengo por la promo de CyberWeek. Quiero más info."
);

export function PromoPopup() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY)) return;
    } catch {
      return;
    }
    const t = setTimeout(() => setShow(true), 3200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [show]);

  function close() {
    try { sessionStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="promo" role="dialog" aria-modal="true" aria-label="Promoción CyberWeek" onClick={close}>
      <div className="promo-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="promo-close" onClick={close} aria-label="Cerrar">✕</button>
        <span className="promo-flash">CYBER WEEK · UPZITES</span>
        <h2 className="promo-h">
          Hasta <span className="promo-big">30%</span> OFF
        </h2>
        <p className="promo-sub">
          En branding y desarrollo web. Solo esta semana, para marcas que quieren
          arrancar con todo. <strong>Cupos limitados.</strong>
        </p>
        <div className="promo-actions">
          <a
            className="btn btn-lime btn-lg"
            href={`https://wa.me/${WA_NUMBER}?text=${WA_MSG}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
          >
            Quiero mi descuento <span className="arr">↗</span>
          </a>
          <button type="button" className="promo-skip" onClick={close}>
            Ahora no, gracias
          </button>
        </div>
        <span className="promo-fine">* Aplica a proyectos nuevos contratados durante CyberWeek.</span>
      </div>
    </div>
  );
}
