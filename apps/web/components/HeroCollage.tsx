import Image from "next/image";
import Link from "next/link";
import { Sticker } from "./Atoms";

// Collage de proyectos reales a la derecha del título del hero. Las tarjetas
// flotan con CSS (sin JS); con reduced-motion quedan quietas y el collage se
// sigue viendo completo, que es lo que importa.
const CARDS = [
  {
    key: "web",
    src: "/images/websites/ironmallas-cover.webp",
    w: 900, h: 648,
    alt: "Sitio web de Iron Mallas diseñado por UPZITES",
    tag: "Iron Mallas · Web",
    browser: true,
  },
  {
    key: "smash",
    src: "/images/proyectos/valle-smash/01.webp",
    w: 1448, h: 1086,
    alt: "Guía de marca de Valle Smash",
    tag: "Valle Smash",
  },
  {
    key: "pizza",
    src: "/images/proyectos/dirtypizza/01.webp",
    w: 1122, h: 1402,
    alt: "Identidad de marca de Dirty Pizza",
    tag: "Dirty Pizza",
  },
];

export function HeroCollage() {
  return (
    <Link href="#projects" className="hero-collage" aria-label="Ver proyectos de UPZITES">
      {CARDS.map((c) => (
        <figure key={c.key} className={`hc-card hc-card--${c.key}`}>
          <span className="hc-tape" aria-hidden="true" />
          {c.browser && (
            <span className="hc-bar" aria-hidden="true">
              <i /><i /><i />
            </span>
          )}
          <Image
            src={c.src}
            alt={c.alt}
            width={c.w}
            height={c.h}
            sizes="(max-width: 1100px) 45vw, 320px"
            loading="eager"
          />
          <figcaption className="hc-tag">{c.tag}</figcaption>
        </figure>
      ))}
      <Sticker tone="lime" angle={-6} style={{ position: "absolute" }}>
        <span className="hc-sticker-text">Hecho en UPZITES ✦</span>
      </Sticker>
    </Link>
  );
}
