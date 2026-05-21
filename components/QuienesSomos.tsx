import Link from "next/link";
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

const BLOCKS = [
  {
    kicker: "El estudio",
    name: "Quién es UPZITES",
    role: "",
    img: "/images/nosotros/santiago.jpg",
    text: "Estudio de diseño fundado en Santiago de Chile, especializado en estrategia digital, branding y UX/UI. No diseñamos para decorar: diseñamos para posicionar. Mezclamos estrategia, diseño bold y cultura visual tropical underground —con raíces caraqueñas y la mira en LATAM, EE.UU. y Europa.",
    socials: UPZITES_SOCIALS,
  },
  {
    kicker: "Founder",
    name: "José Rodríguez",
    role: "Diseño & Desarrollo Web",
    img: "/images/founder-1.jpg",
    text: "Diseñador y desarrollador de UPZITES. Une diseño gráfico, desarrollo web y pensamiento técnico —con base en ingeniería civil— para crear marcas, interfaces y sitios con estructura, rendimiento y carácter.",
    socials: JOSE_SOCIALS,
  },
  {
    kicker: "Equipo",
    name: "Jilly Moreno",
    role: "Administración & Social Media",
    img: "/images/jilly-1.jpg",
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
                  <img src={b.img} alt={b.name} loading="lazy" />
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
