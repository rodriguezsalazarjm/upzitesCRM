"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import styles from "./LandingIntro.module.css";

/**
 * Pantalla de entrada de la landing de Branding Express: una matriz 3D de
 * capturas que ocupa el viewport y se despliega mientras bajas, hasta
 * desaparecer y dejarte dentro de la pagina.
 *
 * Adaptada del componente 3D de 21st.dev, con estas diferencias:
 *  · No monta su propio contenedor de scroll (el original traia un
 *    `h-screen overflow-y-auto` que rompia el scroll de la pagina). Usa el
 *    scroll real del documento sobre un espaciador.
 *  · El progreso se escribe como la custom property `--p` desde un rAF, sin
 *    re-render de React por frame: las interpolaciones las hace el CSS.
 *  · Pocas tarjetas y grandes en vez de las 28 del original.
 *  · Bajo `prefers-reduced-motion` no se renderiza nada: sin animacion esto
 *    seria solo un espaciador vacio antes del contenido.
 *
 * OJO con las capturas de terceros: estan como fondo decorativo. La pantalla no
 * dice ni sugiere que sean trabajo de UPZITES, y no debe hacerlo.
 */

const SHOTS = [
  { src: "/images/websites/grafiks-full.webp" },
  { src: "/intro/craft-wild.webp" },
  { src: "/images/websites/ironmallas-full.webp" },
  { src: "/intro/wispr-flow.webp" },
  { src: "/intro/adomate.webp" },
  { src: "/intro/jack-mcdade.webp" },
];

/** Tres columnas de dos tarjetas. La tercera se oculta en movil por CSS. */
const COLUMNS = [SHOTS.slice(0, 2), SHOTS.slice(2, 4), SHOTS.slice(4, 6)];

/** Cuantos viewports de scroll dura el desplegado antes de desaparecer. */
const SCROLL_RANGE = 1.15;

export function LandingIntro() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const range = window.innerHeight * SCROLL_RANGE;
      const p = range > 0 ? Math.min(1, Math.max(0, window.scrollY / range)) : 1;
      root.style.setProperty("--p", String(p));
      // Ya invisible: se saca del compositor en vez de dejar una capa a pantalla
      // completa repintandose en cada scroll.
      root.style.visibility = p >= 1 ? "hidden" : "visible";
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <>
      {/* Espaciador: le da al documento el recorrido de scroll que consume la
          capa fija. Sin esto no habria nada que scrollear para descubrirla. */}
      <div className={styles.spacer} aria-hidden="true" />

      <div ref={rootRef} className={styles.intro} aria-hidden="true">
        <div className={styles.matrix}>
          {COLUMNS.map((col, ci) => (
            <div className={styles.col} key={ci}>
              {col.map((shot) => (
                <div className={styles.card} key={shot.src}>
                  <Image
                    src={shot.src}
                    alt=""
                    fill
                    sizes="(max-width: 720px) 62vw, 36vw"
                    /* Sin lazy: dentro del contenedor con transform 3D el
                       IntersectionObserver de next/image no dispara y las
                       tarjetas quedan vacias. */
                    loading="eager"
                  />
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className={styles.vignette} />

        <p className={styles.hint}>
          <span>Desliza</span>
          <svg width="15" height="24" viewBox="0 0 16 26" fill="none" aria-hidden="true">
            <path d="M8 2v20M2 16l6 6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
          </svg>
        </p>
      </div>
    </>
  );
}
