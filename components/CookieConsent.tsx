"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const KEY = "upz-cookies";

export function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) {
        // small delay so it doesn't fight the preloader / promo
        const t = setTimeout(() => setShow(true), 1200);
        return () => clearTimeout(t);
      }
    } catch {
      /* ignore */
    }
  }, []);

  function decide(value: "accepted" | "rejected") {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="cookie glass" role="dialog" aria-live="polite" aria-label="Aviso de cookies">
      <div className="cookie-head">
        <span className="cookie-iso">
          <img src="/images/logo/isotipo.png" alt="UPZITES" />
        </span>
        <div className="cookie-text">
          <strong>Cookies, pero de las buenas 🍪</strong>
          <span>
            Usamos algunas para que el sitio vuele y entender qué te gusta. Cero
            spam, cero rastreo invasivo — palabra de estudio.{" "}
            <Link href="/cookies" className="cookie-link">Más detalles</Link>.
          </span>
        </div>
      </div>
      <div className="cookie-actions">
        <button type="button" className="btn btn-ivory btn-sm" onClick={() => decide("rejected")}>
          Solo lo esencial
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => decide("accepted")}>
          Aceptar y seguir <span className="arr">↗</span>
        </button>
      </div>
    </div>
  );
}
