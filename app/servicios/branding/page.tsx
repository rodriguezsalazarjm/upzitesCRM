import type { CSSProperties } from "react";
import Link from "next/link";
import { TopNav, Footer, Marquee } from "@/components/Sections";
import { Eyebrow, Reveal, Sticker } from "@/components/Atoms";
import { BrandingCards } from "@/components/BrandingCards";
import { ServiceNav } from "@/components/ServiceNav";

export const metadata = {
  title: "Branding estratégico — UPZITES",
  description:
    "Construimos la dirección visual, verbal y estratégica de tu marca para que deje de verse improvisada y compita con claridad, personalidad y autoridad.",
};

const ACCENT = "var(--upz-tomato)";

const PROCESS = [
  { num: "01", title: "Diagnóstico", body: "Revisamos tu marca, mercado, competencia, audiencia y puntos débiles de percepción." },
  { num: "02", title: "Estrategia", body: "Definimos posicionamiento, personalidad, tono, dirección visual y criterios de diseño." },
  { num: "03", title: "Identidad", body: "Diseñamos logotipo, paleta, tipografía, sistema gráfico y aplicaciones principales." },
  { num: "04", title: "Sistema", body: "Organizamos todo en una guía clara para que tu marca se use con coherencia." },
];

export default function BrandingPage() {
  return (
    <div id="top" style={{ "--svc-accent": ACCENT } as CSSProperties}>
      <TopNav />
      <ServiceNav current="branding" />

      {/* 1. Hero */}
      <section className="brand-hero" data-screen-label="Branding · Hero">
        <div className="shell">
          <div className="svc-breadcrumb">
            <Link href="/servicios">Servicios</Link>
            <span>↗</span>
            <span>Branding estratégico</span>
          </div>
          <div className="brand-hero-grid">
            <div>
              <Eyebrow num="01">Servicio · Branding</Eyebrow>
              <h1 className="brand-hero-title">
                Branding estratégico para marcas que quieren <span className="mark">verse más fuertes</span>.
              </h1>
              <p className="brand-hero-sub">
                Construimos la dirección visual, verbal y estratégica de tu marca
                para que deje de verse improvisada y empiece a competir con
                claridad, personalidad y autoridad.
              </p>
              <div className="hero-actions">
                <Link href="/#contact" className="btn btn-dark btn-lg">Quiero construir mi marca <span className="arr">↗</span></Link>
                <a href="#incluye" className="btn btn-ivory btn-lg">Ver qué incluye <span className="arr">↗</span></a>
              </div>
            </div>
            <div className="brand-hero-media">
              <img src="/images/branding-cover.jpg" alt="Sistema de marca tropical underground sobre escritorio creativo" />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Problema */}
      <section className="section section--tight" data-screen-label="Branding · Problema">
        <div className="shell brand-problem">
          <Reveal>
            <p className="brand-lead">
              Tu marca puede tener buen producto, buen servicio y buena intención.
              Pero si se ve genérica, débil o desordenada, el mercado no la percibe
              con el valor que merece.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="brand-punch">
              No necesitas <span className="strike">“un logo bonito”</span>.<br />
              Necesitas un <span className="mark">sistema de marca</span> con dirección.
            </h2>
          </Reveal>
        </div>
      </section>

      {/* 3. Promesa */}
      <section className="section section--ivory" data-screen-label="Branding · Promesa">
        <div className="shell">
          <div className="brand-promise">
            <Reveal>
              <div className="brand-promise-media">
                <img src="/images/branding-system.jpg" alt="Sistema de identidad de marca completo: papelería, packaging y web" />
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div>
                <Eyebrow num="02">La promesa</Eyebrow>
                <h2 className="brand-promise-h">
                  Convertimos ideas sueltas en una marca clara, memorable y lista para vender.
                </h2>
                <p className="brand-body">
                  Definimos la estrategia, personalidad, lenguaje visual y sistema
                  gráfico de tu marca para que cada punto de contacto comunique lo
                  mismo: quién eres, qué representas y por qué deberían elegirte.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 4. Qué incluye · cards interactivas */}
      <section id="incluye" className="section" data-screen-label="Branding · Incluye">
        <div className="shell">
          <Eyebrow num="03">¿Qué incluye el Branding Estratégico?</Eyebrow>
          <div className="services-head">
            <Reveal>
              <h2 className="services-h">
                Un sistema completo.<br />
                <span className="b">No piezas sueltas<span style={{ color: ACCENT }}>.</span></span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "var(--fg-2)", maxWidth: 460, margin: 0 }}>
                Pasa el cursor o toca cada tarjeta para ver el detalle de cada
                entregable.
              </p>
            </Reveal>
          </div>
          <BrandingCards />
        </div>
      </section>

      {/* 5. Proceso */}
      <section className="section section--carbon" data-screen-label="Branding · Proceso">
        <div className="shell">
          <Eyebrow num="04">Proceso</Eyebrow>
          <div className="brand-process">
            <div className="brand-process-steps">
              {PROCESS.map((s, i) => (
                <Reveal key={s.num} delay={i * 80}>
                  <div className="brand-step">
                    <span className="brand-step-num">{s.num}</span>
                    <div className="brand-step-body">
                      <h3>{s.title}</h3>
                      <p>{s.body}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal delay={120}>
              <div className="brand-process-media">
                <img src="/images/branding-process.jpg" alt="Muestras de color, tipografías y dirección de arte" />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <Marquee
        variant="carbon"
        items={["Dirección", "Sistema", "Carácter", "Branding tropical underground", "Menos genérico · más marca"]}
      />

      {/* 6. Venta */}
      <section className="section section--ivory" data-screen-label="Branding · Venta">
        <div className="shell brand-sell">
          <Reveal>
            <h2 className="services-h">
              Tu marca no necesita parecer más seria.<br />
              <span className="b">Necesita verse más fuerte<span style={{ color: ACCENT }}>.</span></span>
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="brand-body">
              El branding estratégico te ayuda a construir una identidad que se
              entiende rápido, se recuerda mejor y proyecta más valor. Una marca
              con sistema genera confianza, mejora la percepción y hace que cada
              pieza trabaje con intención.
            </p>
            <Link href="/#agenda" className="btn btn-dark btn-lg">Agendar diagnóstico de marca <span className="arr">↗</span></Link>
          </Reveal>
        </div>
      </section>

      {/* 7. Cierre */}
      <section className="brand-closing" data-screen-label="Branding · Cierre">
        <div className="shell">
          <Sticker tone="lime" angle={-3}>Diseño con sangre, sistema y dirección</Sticker>
          <Reveal>
            <h2 className="brand-closing-h">
              Diseñamos marcas con <span className="mark">dirección, sistema y carácter</span>.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="brand-closing-copy">
              Para negocios que no quieren verse como una opción más. Para marcas
              que quieren entrar al mercado con presencia, claridad y actitud.
            </p>
            <Link href="/#contact" className="btn btn-lime btn-lg">Quiero mi branding estratégico <span className="arr">↗</span></Link>
            <Link href="/#projects" className="btn btn-light btn-lg">Ver proyectos <span className="arr">↗</span></Link>
          </Reveal>
        </div>
      </section>

      <ServiceNav current="branding" />
      <Footer />
    </div>
  );
}
