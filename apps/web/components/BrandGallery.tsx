"use client";

import { useMemo, useRef } from "react";
import Image from "next/image";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import styles from "./BrandGallery.module.css";

/**
 * Galeria 3D que se despliega con el scroll, con las marcas y los sitios que
 * hemos publicado.
 *
 * Adaptada de un componente de 21st.dev. Diferencias con el original, todas
 * deliberadas:
 *  · `motion/react`, no `framer-motion`: es la misma libreria renombrada y ya
 *    esta en el proyecto. Instalar framer-motion duplicaria el runtime.
 *  · Sin contenedor de scroll propio. El original traia un `h-screen
 *    overflow-y-auto` que habria roto el scroll de la pagina, el header sticky
 *    y la barra de progreso.
 *  · 220vh en vez de 600vh: seis pantallas de scroll antes del contenido es una
 *    maquina de rebote en trafico de Instagram y Meta Ads.
 *  · Assets locales via next/image en vez de 14 remotas de Unsplash.
 *  · Fallback estatico bajo `prefers-reduced-motion`, como el resto del sitio.
 */

type Item = { src: string; alt: string; kind: "shot" | "logo" };

/** Capturas de sitios publicados. */
const SHOTS: Item[] = [
  { src: "/images/websites/grafiks-cover.webp", alt: "Sitio web de Grafiks", kind: "shot" },
  { src: "/images/websites/ironmallas-cover.webp", alt: "Sitio web de Iron Mallas", kind: "shot" },
  { src: "/images/websites/profileempresarial-cover.webp", alt: "Sitio web de Profile Empresarial", kind: "shot" },
  { src: "/images/websites/kyrontecnology-cover.webp", alt: "Sitio web de Kyron Technology", kind: "shot" },
];

/** Marcas creadas. Cada archivo ya trae su propia placa de color. */
const LOGOS: Item[] = [
  { src: "/work-brands/gloobitos.png", alt: "Marca Gloobitos", kind: "logo" },
  { src: "/work-brands/urban-wild.png", alt: "Marca Urban Wild", kind: "logo" },
  { src: "/work-brands/dirty-pizza.png", alt: "Marca Dirty Pizza", kind: "logo" },
  { src: "/work-brands/valle-smash.png", alt: "Marca Valle Smash", kind: "logo" },
  { src: "/work-brands/reyes-protec.png", alt: "Marca Reyes Protec", kind: "logo" },
  { src: "/work-brands/vr-automotriz.png", alt: "Marca VR Automotriz", kind: "logo" },
  { src: "/work-brands/avacos.png", alt: "Marca Avacos", kind: "logo" },
  { src: "/work-brands/iron-mallas.png", alt: "Marca Iron Mallas", kind: "logo" },
];

function Card({ item }: { item: Item }) {
  const isShot = item.kind === "shot";
  return (
    <div className={`${styles.card} ${isShot ? styles.cardShot : styles.cardLogo}`}>
      <Image
        src={item.src}
        alt={item.alt}
        fill
        sizes="(max-width: 700px) 34vw, 23vw"
        /* Sin lazy: dentro del contenedor con transform 3D el
           IntersectionObserver de next/image no dispara y las tarjetas quedan
           vacias. Por eso tambien el set de imagenes es corto. */
        loading="eager"
      />
    </div>
  );
}

export function BrandGallery() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  // Columnas alternas: capturas / logos / capturas / logos. Cada una se repite
  // para que la columna sea mas alta que el viewport y el parallax tenga margen.
  const columns = useMemo(() => {
    const shotsA = [SHOTS[0], SHOTS[2]];
    const shotsB = [SHOTS[1], SHOTS[3]];
    const logosA = LOGOS.filter((_, i) => i % 2 === 0);
    const logosB = LOGOS.filter((_, i) => i % 2 === 1);
    // 16 tarjetas en total. Cada duplicado extra es una imagen mas que cargar
    // antes de que el usuario llegue a la oferta.
    return [
      [...shotsA, ...shotsA],
      logosA,
      [...shotsB, ...shotsB],
      logosB,
    ];
  }, []);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });
  const p = useSpring(scrollYProgress, { stiffness: 110, damping: 22, mass: 0.4 });

  // Desplegado del bloque.
  const width = useTransform(p, [0, 0.18], ["92vw", "100vw"]);
  const height = useTransform(p, [0, 0.18], ["82vh", "100vh"]);
  const radius = useTransform(p, [0, 0.18], ["20px", "0px"]);
  const borderWidth = useTransform(p, [0, 0.18], ["1.5px", "0px"]);
  const labelOpacity = useTransform(p, [0, 0.12], [1, 0]);

  // Matriz 3D.
  const rotateX = useTransform(p, [0.18, 1], [22, 3]);
  const rotateY = useTransform(p, [0.18, 1], [-38, -6]);
  const rotateZ = useTransform(p, [0.18, 1], [12, 1.5]);
  const z = useTransform(p, [0.18, 1], [-700, 0]);

  // Parallax por columna.
  const y1 = useTransform(p, [0.18, 1], ["0%", "-38%"]);
  const y2 = useTransform(p, [0.18, 1], ["-38%", "8%"]);
  const y3 = useTransform(p, [0.18, 1], ["0%", "-34%"]);
  const y4 = useTransform(p, [0.18, 1], ["-28%", "16%"]);
  const ys = [y1, y2, y3, y4];

  // Sin animacion: grilla plana con una muestra de cada tipo. Nada de sticky ni
  // de 220vh, que sin movimiento solo serian scroll vacio.
  if (reduced) {
    return (
      <section ref={sectionRef} className={styles.static} aria-label="Marcas y sitios publicados por UPZITES">
        <div className={styles.staticShell}>
          <div className={styles.label}>
            <p className={styles.labelEyebrow}>Nuestro trabajo</p>
            <h2 className={styles.labelTitle}>Marcas y sitios que ya existen</h2>
          </div>
          <div className={styles.staticGrid}>
            {[...SHOTS, ...LOGOS.slice(0, 4)].map((item) => (
              <Card key={item.src} item={item} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      className={styles.section}
      aria-label="Marcas y sitios publicados por UPZITES"
    >
      <div className={styles.stage}>
        <motion.div className={styles.banner} style={{ width, height, borderRadius: radius, borderWidth }}>
          <motion.div className={styles.label} style={{ opacity: labelOpacity }}>
            <p className={styles.labelEyebrow}>Nuestro trabajo</p>
            <h2 className={styles.labelTitle}>Marcas y sitios que ya existen</h2>
          </motion.div>

          <div className={styles.perspective}>
            <div className={styles.vignette} />
            <motion.div
              className={styles.matrix}
              style={{ rotateX, rotateY, rotateZ, z, transformStyle: "preserve-3d" }}
            >
              {columns.map((col, ci) => (
                <motion.div className={styles.col} style={{ y: ys[ci] }} key={ci}>
                  {col.map((item, ii) => (
                    <Card key={`${ci}-${ii}-${item.src}`} item={item} />
                  ))}
                </motion.div>
              ))}
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
