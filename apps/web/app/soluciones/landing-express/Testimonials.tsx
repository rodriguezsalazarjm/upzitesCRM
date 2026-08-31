"use client";

import { useState } from "react";
import Image from "next/image";
import type { Testimonial } from "./content";

/**
 * Carrusel de testimonios: la foto activa al frente y las siguientes asomando
 * detras, rotadas. Se avanza con las flechas o clickeando una foto.
 *
 * Se escribio a mano porque el MCP de 21st.dev no conecta (API key caida). Si
 * mas adelante quieres el bloque original de alli, esto se reemplaza sin tocar
 * nada mas: la seccion solo depende del array TESTIMONIALS.
 *
 * El avatar es opcional: sin foto se dibuja una placa con la inicial, para no
 * bloquear la publicacion por no tener retratos.
 */
export function Testimonials({ items }: { items: Testimonial[] }) {
  const [active, setActive] = useState(0);
  const current = items[active];
  if (!current) return null;

  const go = (delta: number) => setActive((i) => (i + delta + items.length) % items.length);

  return (
    <div className="lx-tst">
      <div className="lx-tst-stack">
        {items.map((t, i) => {
          // Posicion relativa a la activa: 0 al frente, el resto detras.
          const offset = (i - active + items.length) % items.length;
          return (
            <button
              type="button"
              key={`${t.brand}-${t.name}`}
              className="lx-tst-photo"
              style={{
                zIndex: items.length - offset,
                transform: `translate(${offset * 16}px, ${offset * -14}px) rotate(${offset * 4}deg)`,
                opacity: offset === 0 ? 1 : 0.42,
              }}
              onClick={() => setActive(i)}
              aria-label={`Ver testimonio de ${t.name}`}
              aria-pressed={offset === 0}
            >
              {t.avatar ? (
                <Image src={t.avatar} alt="" fill sizes="(max-width: 899px) 60vw, 320px" />
              ) : (
                <span className="lx-tst-initial" aria-hidden="true">{t.name.charAt(0)}</span>
              )}
            </button>
          );
        })}
      </div>

      <figure className="lx-tst-body">
        <blockquote>{current.quote}</blockquote>
        <figcaption>
          <span className="lx-tst-name">{current.name}</span>
          <span className="lx-tst-role">{current.role} · {current.brand}</span>
        </figcaption>

        {items.length > 1 && (
          <div className="lx-tst-nav">
            <button type="button" onClick={() => go(-1)} aria-label="Testimonio anterior">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M15 5 8 12l7 7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" />
              </svg>
            </button>
            <span className="lx-tst-count">
              {String(active + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
            </span>
            <button type="button" onClick={() => go(1)} aria-label="Testimonio siguiente">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" />
              </svg>
            </button>
          </div>
        )}
      </figure>
    </div>
  );
}
