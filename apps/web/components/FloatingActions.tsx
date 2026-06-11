"use client";

import { useEffect, useState } from "react";

const WA_NUMBER = "56973178796";
const WA_MSG = encodeURIComponent("Hola UPZITES 👋, quiero información sobre sus servicios.");

export function FloatingActions() {
  const [tip, setTip] = useState(false);
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const show = setTimeout(() => setTip(true), 6000);
    const hide = setTimeout(() => setTip(false), 18000);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, []);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <div className="fab" aria-label="Contacto rápido">
      {tip && (
        <div className="fab-tip" role="status">
          <button
            type="button"
            className="fab-tip-close"
            onClick={() => setTip(false)}
            aria-label="Cerrar mensaje"
          >
            ✕
          </button>
          <strong>¿Tienes alguna duda?</strong>
          <span>Estoy aquí para ayudarte. Escríbenos por WhatsApp 👋</span>
        </div>
      )}
      <button
        type="button"
        className={`fab-btn fab-top${showTop ? " is-visible" : ""}`}
        onClick={scrollTop}
        aria-label="Volver arriba"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
        <span className="fab-label">Volver arriba</span>
      </button>
      <a
        className="fab-btn fab-mail"
        href="mailto:contacto@upzites.com"
        aria-label="Escríbenos por correo"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m2 7 10 6 10-6" />
        </svg>
        <span className="fab-label">Escríbenos</span>
      </a>
      <a
        className="fab-btn fab-wa"
        href={`https://wa.me/${WA_NUMBER}?text=${WA_MSG}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Escríbenos por WhatsApp"
        onClick={() => setTip(false)}
      >
        <svg viewBox="0 0 32 32" width="26" height="26" fill="currentColor" aria-hidden="true">
          <path d="M16.04 3C9.4 3 4 8.4 4 15.04c0 2.12.56 4.18 1.6 6L4 29l8.16-1.54a12 12 0 0 0 3.88.64h.01C22.7 28.1 28.1 22.7 28.1 16.06 28.1 8.4 22.7 3 16.04 3Zm0 22.1h-.01a9.9 9.9 0 0 1-3.6-.66l-.26-.1-3.84.72.72-3.74-.17-.27a9.96 9.96 0 0 1-1.52-5.27c0-5.5 4.48-9.98 9.99-9.98 2.67 0 5.18 1.04 7.06 2.93a9.94 9.94 0 0 1 2.92 7.06c0 5.5-4.48 9.99-9.98 9.99Zm5.48-7.47c-.3-.15-1.77-.87-2.05-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35Z" />
        </svg>
        <span className="fab-label">WhatsApp</span>
      </a>
    </div>
  );
}
