import Link from "next/link";
import { Eyebrow, Reveal, Pill } from "./Atoms";
import { FounderCarousel } from "./FounderCarousel";

const TRUST = [
  "Estrategia 360°",
  "Diseño con dirección",
  "SEO integrado",
  "Obsesión por el detalle",
  "Propiedad total del proyecto",
  "Respuesta en 24h",
];

export function QuienesSomos() {
  return (
    <section id="nosotros" className="section qs" data-screen-label="03 Quiénes somos">
      <div className="shell">
        <Eyebrow num="03">Quiénes somos · El estudio</Eyebrow>
        <div className="qs-founder">
          <Reveal>
            <FounderCarousel />
          </Reveal>
          <Reveal delay={120}>
            <div className="qs-bio">
              <h2 className="services-h" style={{ fontSize: "clamp(28px, 3.4vw, 52px)", margin: "0 0 18px" }}>
                No hacemos marcas bonitas.<br />
                <span className="b">Marcas con dirección<span style={{ color: "var(--upz-tomato)" }}>.</span></span>
              </h2>
              <p style={{ fontFamily: "var(--font-text)", fontSize: 17, lineHeight: 1.6, color: "var(--fg-2)", margin: 0 }}>
                UPZITES es un <strong>estudio de diseño fundado en Santiago de Chile</strong>,
                especializado en estrategia digital, branding y UX/UI. Ayudamos a marcas,
                emprendedores y empresas a verse más fuertes, claras y competitivas:
                unimos estrategia, diseño bold y una cultura visual tropical underground
                para construir identidades y webs con carácter. Con raíces caraqueñas y la
                mira en Latinoamérica, Estados Unidos y Europa.
              </p>
              <div className="intro-tags" style={{ marginTop: 20 }}>
                <Pill dot>Estrategia</Pill>
                <Pill dot>Sistema</Pill>
                <Pill dot>Carácter</Pill>
              </div>
              <div className="qs-team">
                <div className="qs-team-member">
                  <img src="/images/founder-1.jpg" alt="José Rodríguez" loading="lazy" />
                  <div><strong>José Rodríguez</strong><span>Diseño &amp; Desarrollo · Founder</span></div>
                </div>
                <div className="qs-team-member">
                  <img src="/images/jilly-1.jpg" alt="Jilly Moreno" loading="lazy" />
                  <div><strong>Jilly Moreno</strong><span>Administración &amp; Social Media</span></div>
                </div>
              </div>
              <div className="hero-actions" style={{ marginTop: 22 }}>
                <Link href="/nosotros" className="btn btn-dark btn-lg">Saber más <span className="arr">↗</span></Link>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={80}>
          <div className="qs-trust glass" aria-label="Lo que nos diferencia">
            {TRUST.map((t) => (
              <span className="qs-trust-item" key={t}><span className="qs-trust-dot">●</span>{t}</span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
