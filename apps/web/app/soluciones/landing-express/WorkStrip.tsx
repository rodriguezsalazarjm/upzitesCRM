"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { WorkItem } from "./content";

/**
 * Tira de portafolio: mismo panel que la galeria del hero, pero scrollable y
 * con flechas, porque son mas proyectos de los que caben repartidos en la fila.
 *
 * Las flechas se deshabilitan en los extremos en vez de ocultarse: si aparecen
 * y desaparecen, la fila salta de ancho.
 */
export function WorkStrip({ items }: { items: WorkItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener("resize", sync, { passive: true });
    return () => window.removeEventListener("resize", sync);
  }, [sync]);

  /**
   * Se asigna `scrollLeft` directo y el suavizado lo hace el CSS
   * (`scroll-behavior: smooth` sobre la tira). La opcion
   * `scrollBy({ behavior: "smooth" })` no movia este contenedor, y animarlo a
   * mano por frames competia con el propio scroll del navegador.
   */
  const scrollByPage = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    // Avanza algo menos de una pantalla, para que quede un panel de referencia.
    const delta = dir * Math.round(el.clientWidth * 0.8);
    el.scrollLeft = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, el.scrollLeft + delta));
    sync();
  };

  return (
    <div className="lx-strip-wrap">
      <div className="lx-gallery lx-gallery--strip" ref={ref} onScroll={sync}>
        {items.map((w) => (
          <a
            className="lx-gallery-item"
            key={`${w.kind}-${w.slug}`}
            href={w.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              src={w.image}
              alt={`${w.name} — ${w.kind} por UPZITES`}
              fill
              sizes="(max-width: 899px) 66vw, 420px"
            />
            <span className="lx-gallery-cap">
              <span className="lx-gallery-kind">{w.kind}</span>
              <span className="lx-gallery-brand">{w.name}</span>
            </span>
          </a>
        ))}
      </div>

      <div className="lx-strip-nav">
        <button type="button" onClick={() => scrollByPage(-1)} disabled={atStart} aria-label="Ver proyectos anteriores">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" />
          </svg>
        </button>
        <button type="button" onClick={() => scrollByPage(1)} disabled={atEnd} aria-label="Ver más proyectos">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" />
          </svg>
        </button>
      </div>
    </div>
  );
}
