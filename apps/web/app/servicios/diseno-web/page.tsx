import type { CSSProperties } from "react";
import Link from "next/link";
import { TopNav, Footer, Marquee } from "@/components/Sections";
import { Eyebrow, Reveal, Sticker } from "@/components/Atoms";
import { FeatureCards, type FeatureCard } from "@/components/FeatureCards";
import { ServiceNav } from "@/components/ServiceNav";

export const metadata = {
  title: "Diseño web — UPZITES",
  description:
    "Diseñamos plataformas rápidas, modernas y escalables con SEO técnico, UX/UI cuidado y estructura de conversión desde el primer wireframe.",
};

const ACCENT = "var(--upz-electric)";

const CARDS: FeatureCard[] = [
  { num: "01", title: "Arquitectura web estratégica", visible: "Organizamos tu sitio antes de diseñarlo.", detail: "Definimos páginas, secciones, jerarquía de información, recorrido de usuario y estructura comercial para que cada bloque tenga un propósito.", micro: "Primero estructura. Luego diseño." },
  { num: "02", title: "Wireframes UX", visible: "Diseñamos el camino antes de vestir la web.", detail: "Creamos wireframes para ordenar contenido, CTAs, navegación, secciones clave y flujo de conversión antes de pasar al diseño visual.", micro: "Una buena web empieza en blanco y negro." },
  { num: "03", title: "Diseño UI premium", visible: "Interfaz moderna, clara y con personalidad.", detail: "Diseñamos pantallas con estética actual, tipografía fuerte, módulos claros, botones contundentes, componentes visuales y coherencia con tu identidad de marca.", micro: "Diseño que se ve bien y se entiende rápido." },
  { num: "04", title: "SEO técnico desde el inicio", visible: "No lo añadimos al final. Lo construimos desde la base.", detail: "Trabajamos estructura semántica, jerarquía de títulos, URLs limpias, metadata, performance, indexabilidad y buenas prácticas técnicas para que tu sitio nazca preparado para posicionar.", micro: "SEO desde el wireframe." },
  { num: "05", title: "Copy y jerarquía de contenido", visible: "Textos pensados para explicar, guiar y convertir.", detail: "Organizamos mensajes, titulares, argumentos, beneficios, objeciones y llamados a la acción para que la web no solo informe: convenza.", micro: "La claridad también vende." },
  { num: "06", title: "Diseño responsive", visible: "Tu web debe verse fuerte en cualquier pantalla.", detail: "Adaptamos la experiencia para desktop, tablet y móvil, cuidando legibilidad, navegación, velocidad y conversión en cada formato.", micro: "Mobile no es versión secundaria." },
  { num: "07", title: "Performance y velocidad", visible: "Una web lenta pierde clientes.", detail: "Optimizamos estructura, imágenes, componentes y carga para construir una experiencia rápida, limpia y profesional.", micro: "Rápida, clara, lista para convertir." },
  { num: "08", title: "Sistema escalable", visible: "Diseñamos una web que pueda crecer contigo.", detail: "Creamos componentes, secciones reutilizables y estructura flexible para sumar nuevas páginas, servicios, casos, artículos o campañas sin romper el sistema.", micro: "Tu web no debe quedarse pequeña." },
  { num: "09", title: "Chatbot con IA · opcional", visible: "Tu web responde a tus clientes por ti, 24/7.", detail: "Complemento opcional (con costo adicional): un chatbot con IA entrenado con tu información que responde dudas, califica leads y guía a la compra con el tono de tu marca. Se integra al sitio sin cambiar su diseño.", micro: "Atención automática, sin perder tu voz." },
];

const PROCESS = [
  { num: "01", title: "Diagnóstico digital", body: "Analizamos tu marca, objetivo, audiencia, oferta, competencia y necesidades reales del sitio." },
  { num: "02", title: "Arquitectura + SEO", body: "Definimos sitemap, jerarquía de contenido, estructura SEO, recorrido de usuario y objetivos de conversión." },
  { num: "03", title: "Wireframes UX", body: "Organizamos cada página con foco en claridad, lectura, navegación y acción." },
  { num: "04", title: "Diseño UI", body: "Convertimos la estructura en una experiencia visual moderna, funcional y alineada con tu marca." },
  { num: "05", title: "Desarrollo / implementación", body: "Construimos el sitio cuidando velocidad, responsive, estructura técnica y buenas prácticas." },
  { num: "06", title: "Revisión y lanzamiento", body: "Probamos, ajustamos, optimizamos y dejamos la web lista para salir al mercado." },
];

export default function DisenoWebPage() {
  return (
    <div id="top" style={{ "--svc-accent": ACCENT } as CSSProperties}>
      <TopNav />
      <ServiceNav current="diseno-web" />

      {/* 1. Hero */}
      <section className="brand-hero" data-screen-label="Web · Hero">
        <div className="shell">
          <div className="svc-breadcrumb">
            <Link href="/servicios">Servicios</Link>
            <span>↗</span>
            <span>Diseño web</span>
          </div>
          <div className="brand-hero-grid">
            <div>
              <Eyebrow num="01">Servicio · Diseño web</Eyebrow>
              <h1 className="brand-hero-title">
                Tu sitio web es tu <span className="mark">vendedor 24/7</span>.
              </h1>
              <p className="brand-hero-sub">
                Diseñamos plataformas rápidas, modernas y escalables con SEO
                técnico, UX/UI cuidado y estructura de conversión desde el primer
                wireframe.
              </p>
              <div className="hero-actions">
                <Link href="/#contact" className="btn btn-dark btn-lg">Quiero una web que venda <span className="arr">↗</span></Link>
                <a href="#incluye" className="btn btn-ivory btn-lg">Ver qué incluye <span className="arr">↗</span></a>
              </div>
            </div>
            <div className="brand-hero-media">
              <img src="/images/diseno-web-cover.webp" alt="Sitio web responsive de alto rendimiento en desktop, tablet y móvil" />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Problema */}
      <section className="section section--tight" data-screen-label="Web · Problema">
        <div className="shell brand-problem">
          <Reveal>
            <h2 className="brand-promise-h" style={{ marginTop: 0 }}>Una web bonita no siempre vende.</h2>
          </Reveal>
          <Reveal delay={80}>
            <p className="brand-lead">
              Muchas marcas tienen sitios que se ven bien, pero no explican, no
              guían, no cargan rápido y no convierten. El problema no es solo
              visual. Es de estructura, recorrido, contenido, SEO y experiencia.
            </p>
          </Reveal>
          <Reveal delay={140}>
            <h2 className="brand-punch">
              Tu web no debe parecer una <span className="strike">tarjeta de presentación</span>.<br />
              Debe <span className="mark">trabajar por tu marca</span>.
            </h2>
          </Reveal>
        </div>
      </section>

      {/* 3. Promesa */}
      <section className="section section--ivory" data-screen-label="Web · Promesa">
        <div className="shell">
          <div className="brand-promise">
            <Reveal>
              <div className="brand-promise-media">
                <img src="/images/diseno-web-promise.webp" alt="Web trabajando 24/7: leads, ventas y engagement" />
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div>
                <Eyebrow num="02">La promesa</Eyebrow>
                <h2 className="brand-promise-h">
                  Diseñamos sitios con estructura, intención y carácter.
                </h2>
                <p className="brand-body">
                  Cada web nace con arquitectura clara, jerarquía semántica,
                  recorrido de usuario, diseño UX/UI y base SEO técnica. No lo
                  tratamos como un extra. Lo integramos desde el inicio porque una
                  web debe verse bien, funcionar bien y vender mejor.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 4. Qué incluye · cards interactivas */}
      <section id="incluye" className="section" data-screen-label="Web · Incluye">
        <div className="shell">
          <Eyebrow num="03">¿Qué incluye el Diseño Web?</Eyebrow>
          <div className="services-head">
            <Reveal>
              <h2 className="services-h">
                Una web completa.<br />
                <span className="b">No solo una plantilla<span style={{ color: ACCENT }}>.</span></span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "var(--fg-2)", maxWidth: 460, margin: 0 }}>
                Pasa el cursor o toca cada tarjeta para ver el detalle de cada
                entregable.
              </p>
            </Reveal>
          </div>
          <FeatureCards cards={CARDS} />
        </div>
      </section>

      {/* 5. De diseño a conversión · infografía */}
      <section className="section section--carbon" data-screen-label="Web · Conversión">
        <div className="shell">
          <Eyebrow num="04">De diseño a conversión</Eyebrow>
          <div className="svc-figure-head">
            <Reveal>
              <h2 className="brand-promise-h" style={{ color: "var(--upz-off-white)" }}>
                Cada decisión de diseño empuja al usuario por el embudo.
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "rgba(250,251,245,.72)", maxWidth: 460, margin: 0 }}>
                Del descubrimiento a la conversión: estructura, contenido y
                experiencia trabajando juntos para generar resultados reales.
              </p>
            </Reveal>
          </div>
          <Reveal delay={160}>
            <figure className="svc-figure">
              <img src="/images/diseno-web-conversion.webp" alt="Infografía: estrategia de diseño y conversión, del descubrimiento a la conversión" />
            </figure>
          </Reveal>
        </div>
      </section>

      {/* 6. Proceso */}
      <section className="section section--ivory" data-screen-label="Web · Proceso">
        <div className="shell">
          <Eyebrow num="05">Proceso</Eyebrow>
          <div className="brand-process brand-process--light">
            <div className="brand-process-steps">
              {PROCESS.map((s, i) => (
                <Reveal key={s.num} delay={i * 70}>
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
                <img src="/images/diseno-web-process.webp" alt="Wireframes, arquitectura de información, SEO y flujo de conversión" />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <Marquee
        variant="carbon"
        items={["Estructura", "SEO técnico", "UX/UI", "Conversión", "Web que vende", "Responsive · veloz"]}
      />

      {/* 7. Venta */}
      <section className="section" data-screen-label="Web · Venta">
        <div className="shell brand-sell">
          <Reveal>
            <h2 className="services-h">
              Una web bien diseñada no solo informa.<br />
              <span className="b">Convence<span style={{ color: ACCENT }}>.</span></span>
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="brand-body">
              Tu sitio debe explicar tu valor, guiar al usuario y convertir visitas
              en oportunidades reales. Por eso diseñamos webs con estrategia, SEO,
              UX/UI y dirección visual desde el inicio.
            </p>
            <Link href="/#contact" className="btn btn-dark btn-lg">Diseñar mi sitio web <span className="arr">↗</span></Link>
          </Reveal>
        </div>
      </section>

      {/* 8. Cierre */}
      <section className="brand-closing" data-screen-label="Web · Cierre">
        <div className="shell">
          <Sticker tone="lime" angle={-3}>Web que vende, no que decora</Sticker>
          <Reveal>
            <h2 className="brand-closing-h">
              Webs con intención. Diseño con carácter. <span className="mark">Estructura que vende</span>.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="brand-closing-copy">
              Para marcas que no quieren una página más. Quieren una plataforma
              digital clara, rápida y lista para competir.
            </p>
            <Link href="/#contact" className="btn btn-lime btn-lg">Quiero una web 24/7 <span className="arr">↗</span></Link>
            <Link href="/#projects" className="btn btn-light btn-lg">Ver proyectos <span className="arr">↗</span></Link>
          </Reveal>
        </div>
      </section>

      <ServiceNav current="diseno-web" />
      <Footer />
    </div>
  );
}
