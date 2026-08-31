"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import styles from "./LandingIntro.module.css";

/**
 * Pantalla de carga de la landing de Branding Express: una matriz 3D de
 * capturas que se despliega y luego descubre la pagina.
 *
 * Adaptada del componente 3D de 21st.dev, pero convertida de scroll-driven a
 * pantalla de carga:
 *  · La animacion es CSS pura y va por tiempo, no por scroll. Ademas de ser mas
 *    barata que el runtime de Motion, significa que si el JS falla la capa
 *    igual desaparece y nunca deja la pagina bloqueada.
 *  · Pocas tarjetas y grandes (6 en escritorio, 4 en movil) en vez de las 28
 *    del original.
 *  · Assets locales optimizados a WebP (~60KB cada uno) via next/image.
 *  · Bajo `prefers-reduced-motion` se descarta casi de inmediato.
 *
 * OJO: estas capturas son de sitios de terceros y estan aqui solo como fondo
 * decorativo. La pantalla NO dice ni sugiere que sean trabajo de UPZITES, y no
 * debe hacerlo: seria atribuirse webs ajenas.
 */

const SHOTS = [
  { src: "/intro/craft-wild.webp", alt: "" },
  { src: "/intro/wispr-flow.webp", alt: "" },
  { src: "/intro/optimizely.webp", alt: "" },
  { src: "/intro/adomate.webp", alt: "" },
  { src: "/intro/jack-mcdade.webp", alt: "" },
  { src: "/intro/squarespace.webp", alt: "" },
];

/** Tres columnas de dos tarjetas. La tercera se oculta en movil por CSS. */
const COLUMNS = [SHOTS.slice(0, 2), SHOTS.slice(2, 4), SHOTS.slice(4, 6)];

/** Debe cuadrar con el final de `introOut` en el CSS (1.78s + 0.66s). */
const DURATION_MS = 2500;
const DURATION_REDUCED_MS = 600;

export function LandingIntro() {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setGone(true), reduced ? DURATION_REDUCED_MS : DURATION_MS);
    return () => clearTimeout(t);
  }, []);

  // Bloquea el scroll mientras la capa esta arriba, para que el visitante no
  // termine a media pagina cuando se descubre la landing.
  //
  // Al soltar se BORRA la propiedad, no se restaura un valor guardado: el
  // Preloader global del layout tambien bloquea el scroll y termina antes, asi
  // que al montar ya leeriamos "hidden" y al soltar lo volveriamos a aplicar,
  // dejando la pagina sin scroll para siempre.
  useEffect(() => {
    if (gone) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.removeProperty("overflow");
    };
  }, [gone]);

  if (gone) return null;

  return (
    <div className={styles.intro} aria-hidden="true">
      <div className={styles.vignette} />

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
                  loading="eager"
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className={styles.brand}>
        <p className={styles.wordmark}>UPZITES</p>
        <div className={styles.bar}>
          <span />
        </div>
      </div>
    </div>
  );
}
