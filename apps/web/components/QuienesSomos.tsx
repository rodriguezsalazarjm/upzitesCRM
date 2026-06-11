"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Eyebrow, Reveal } from "./Atoms";
import { SocialLinks, UPZITES_SOCIALS, JOSE_SOCIALS, JILLY_SOCIALS } from "./SocialIcons";

const TRUST = [
  "Estrategia 360°",
  "Diseño con dirección",
  "SEO integrado",
  "Obsesión por el detalle",
  "Propiedad total del proyecto",
  "Respuesta en 24h",
];

const SLIDES: Record<string, string[]> = {
  "José Rodríguez": ["/images/founder-1.webp", "/images/founder-2.webp", "/images/founder-3.webp", "/images/founder-4.webp"],
  "Jilly Moreno": ["/images/jilly-1.webp", "/images/jilly-2.webp", "/images/jilly-3.webp", "/images/jilly-4.webp"],
};

function Slideshow({ images, alt }: { images: string[]; alt: string }) {
  const [i, setI] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted || images.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((p) => (p + 1) % images.length), 4000);
    return () => clearInterval(t);
  }, [mounted, images.length]);

  useEffect(() => {
    if (!mounted || !imgRef.current) return;
    const img = imgRef.current;
    import("animejs").then(({ animate, cubicBezier }) => {
      animate(img, {
        opacity: [0, 1],
        scale: [1.08, 1],
        duration: 600,
        ease: cubicBezier(0.2, 0.8, 0.2, 1),
      });
    });
  }, [i, mounted]);

  if (!mounted || images.length < 2) {
    return <img src={images[0]} alt={alt} loading="lazy" />;
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <img
        key={i}
        ref={imgRef}
        src={images[i]}
        alt={alt}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0 }}
      />
    </div>
  );
}

const BLOCKS = [
  {
    kicker: "El estudio",
    name: "Quién es UPZITES",
    role: "",
    img: "/images/nosotros/santiago.webp",
    text: "Estudio de diseño fundado en Santiago de Chile, especializado en estrategia digital, branding y UX/UI. No diseñamos para decorar: diseñamos para posicionar. Mezclamos estrategia, diseño bold y cultura visual tropical underground —con raíces caraqueñas y la mira en LATAM, EE.UU. y Europa.",
    socials: UPZITES_SOCIALS,
  },
  {
    kicker: "Founder",
    name: "José Rodríguez",
    role: "Diseño & Desarrollo Web",
    img: "",
    images: SLIDES["José Rodríguez"],
    text: "Diseñador y desarrollador de UPZITES. Une diseño gráfico, desarrollo web y pensamiento técnico —con base en ingeniería civil— para crear marcas, interfaces y sitios con estructura, rendimiento y carácter.",
    socials: JOSE_SOCIALS,
  },
  {
    kicker: "Equipo",
    name: "Jilly Moreno",
    role: "Administración & Social Media",
    img: "",
    images: SLIDES["Jilly Moreno"],
    text: "Licenciada en Administración con +7 años en gestión, RR.HH. y operaciones. Mantiene el ritmo de UPZITES: organiza procesos, cuida los detalles y conecta la marca con los trends de Instagram y TikTok.",
    socials: JILLY_SOCIALS,
  },
];

export function QuienesSomos() {
  return (
    <section id="nosotros" className="section qs" data-screen-label="03 Quiénes somos">
      <div className="shell">
        <Eyebrow num="03">Quiénes somos · El estudio</Eyebrow>
        <div className="services-head">
          <Reveal>
            <h2 className="services-h">
              No hacemos marcas bonitas.<br />
              <span className="b">Marcas con dirección<span style={{ color: "var(--upz-tomato)" }}>.</span></span>
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "var(--fg-2)", maxWidth: 460, margin: 0 }}>
              Un estudio pequeño y una presencia grande: estrategia, diseño y
              desarrollo en un solo equipo.
            </p>
          </Reveal>
        </div>

        <div className="qs-cards">
          {BLOCKS.map((b, i) => (
            <Reveal key={b.name} delay={i * 80} variant="scale">
              <article className="qs-card">
                <div className="qs-card-img">
                  {b.images ? (
                    <Slideshow images={b.images} alt={b.name} />
                  ) : (
                    <img src={b.img} alt={b.name} loading="lazy" />
                  )}
                </div>
                <div className="qs-card-body">
                  <span className="qs-card-kicker">{b.kicker}</span>
                  <h3>{b.name}</h3>
                  {b.role && <p className="qs-card-role">{b.role}</p>}
                  <p>{b.text}</p>
                  <SocialLinks links={b.socials} className="qs-card-socials" />
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={80}>
          <div className="qs-trust glass" aria-label="Lo que nos diferencia">
            {TRUST.map((t) => (
              <span className="qs-trust-item" key={t}><span className="qs-trust-dot">●</span>{t}</span>
            ))}
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="hero-actions" style={{ justifyContent: "center", marginTop: 28 }}>
            <a href="#projects" className="btn btn-dark btn-lg">Ver proyectos <span className="arr">↗</span></a>
            <Link href="/nosotros" className="btn btn-ivory btn-lg">Saber más sobre nosotros <span className="arr">↗</span></Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
