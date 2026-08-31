"use client";

import { useState } from "react";
import Image from "next/image";
import type { Testimonial } from "./content";

/**
 * Testimonios: pila de fotos rotadas a la izquierda y, a la derecha, nombre,
 * rol, cita y las dos flechas.
 *
 * Se escribio a mano porque el MCP de 21st.dev no conecta (API key caida). Si
 * mas adelante quieres el bloque original de alli, esto se reemplaza sin tocar
 * nada mas: la seccion solo depende del array TESTIMONIALS.
 *
 * El avatar es opcional: sin foto se dibuja una placa con la inicial. Es
 * deliberado que los de relleno no lleven retrato, para no hacer pasar por
 * clientes a personas que no lo son.
 */
export function Testimonials({ items }: { items: Testimonial[] }) {
  const [active, setActive] = useState(0);
  const current = items[active];
  if (!current) return null;

  const go = (delta: number) => setActive((i) => (i + delta + items.length) % items.length);

  // Solo se pintan la activa y dos detras: apilar diez tarjetas no aporta nada
  // y multiplica el trabajo de composicion.
  const visible = items
    .map((t, i) => ({ t, i, offset: (i - active + items.length) % items.length }))
    .filter((x) => x.offset < 3)
    .sort((a, b) => b.offset - a.offset);

  return (
    <div className="lx-tst">
      <div className="lx-tst-stack">
        {visible.map(({ t, i, offset }) => (
          <button
            type="button"
            key={`${t.brand}-${t.name}`}
            className="lx-tst-photo"
            style={{
              zIndex: 3 - offset,
              transform: `translateX(${offset * 22}px) rotate(${offset * 5}deg)`,
              opacity: offset === 0 ? 1 : 0.5,
              // Solo pinta la placa cuando no hay foto.
              background: t.avatar ? undefined : (t.accent ?? "var(--upz-ivory)"),
            }}
            onClick={() => setActive(i)}
            aria-label={`Ver testimonio de ${t.name}`}
            aria-pressed={offset === 0}
            tabIndex={offset === 0 ? -1 : 0}
          >
            {t.avatar ? (
              <Image src={t.avatar} alt={`${t.name}, ${t.role} de ${t.brand}`} fill sizes="(max-width: 899px) 70vw, 340px" />
            ) : (
              <span className="lx-tst-initial" aria-hidden="true">{t.name.charAt(0)}</span>
            )}
          </button>
        ))}
      </div>

      <figure className="lx-tst-body">
        <figcaption>
          <span className="lx-tst-name">{current.name}</span>
          <span className="lx-tst-role">{current.role} · {current.brand}</span>
        </figcaption>

        <blockquote>{current.quote}</blockquote>

        {items.length > 1 && (
          <div className="lx-tst-nav">
            <button type="button" onClick={() => go(-1)} aria-label="Testimonio anterior">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" />
              </svg>
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Testimonio siguiente">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" />
              </svg>
            </button>
            <span className="lx-tst-count">
              {String(active + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
            </span>
          </div>
        )}
      </figure>
    </div>
  );
}
