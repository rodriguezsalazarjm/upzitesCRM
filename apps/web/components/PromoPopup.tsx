"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const KEY = "upz-cyberweek-seen";
const WA_NUMBER = "56973178796";
const WA_MSG = encodeURIComponent(
  "Hola UPZITES 👋, vengo por la promo de CyberWeek. Quiero más info."
);
const WA_IA_MSG = encodeURIComponent(
  "Hola UPZITES 👋, quiero saber más sobre Automatización con IA. Cuéntame los detalles."
);

const IA_FEATURES = [
  "Chatbots & IA conversacional 24/7",
  "Automatización de flujos inteligentes",
  "Captación y seguimiento automático",
];

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
    <div className="promo" role="dialog" aria-modal="true" aria-label="Promoción CyberWeek & IA Layer" onClick={close}>
      <div className="promo-card promo-card--full" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="promo-close" onClick={close} aria-label="Cerrar">✕</button>

        {/* ── Bloque 1: Cyber Week ── */}
        <div className="promo-block promo-block--cyber">
          <span className="promo-flash">CYBER WEEK · UPZITES</span>
          <h2 className="promo-h">
            Hasta <span className="promo-big">30%</span> OFF
          </h2>
          <p className="promo-sub">
            En branding y desarrollo web. Solo esta semana. <strong>Cupos limitados.</strong>
          </p>
          <a
            className="btn btn-lime btn-lg promo-btn-full"
            href={`https://wa.me/${WA_NUMBER}?text=${WA_MSG}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
          >
            Quiero mi descuento <span className="arr">↗</span>
          </a>
        </div>

        {/* ── Separador ── */}
        <div className="promo-divider">
          <span className="promo-divider-label">+ nuevo</span>
        </div>

        {/* ── Bloque 2: IA Layer ── */}
        <div className="promo-block promo-block--ia">
          <div className="promo-ia-head">
            <span className="promo-ia-badge">IA LAYER</span>
            <p className="promo-ia-title">Tu negocio funciona solo, <strong>24/7</strong></p>
          </div>
          <div className="promo-features">
            {IA_FEATURES.map((f) => (
              <div key={f} className="promo-feature">
                <span className="promo-feature-dot">✦</span>
                <span>{f}</span>
              </div>
            ))}
          </div>
          <div className="promo-ia-actions">
            <a
              className="btn btn-dark btn-sm promo-btn-full"
              href={`https://wa.me/${WA_NUMBER}?text=${WA_IA_MSG}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={close}
            >
              Saber más <span className="arr">↗</span>
            </a>
            <Link href="/servicios/automatizacion-ia" className="promo-ia-link" onClick={close}>
              Ver servicio →
            </Link>
          </div>
        </div>

        <button type="button" className="promo-skip" onClick={close} style={{ marginTop: 16 }}>
          Ahora no, gracias
        </button>
        <span className="promo-fine">* Descuento aplica a proyectos nuevos contratados durante CyberWeek.</span>
      </div>
    </div>
  );
}
