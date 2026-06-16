import type { CSSProperties } from "react";
import Link from "next/link";
import { TopNav, Footer, Marquee } from "@/components/Sections";
import { Eyebrow, Reveal, Sticker, Pill } from "@/components/Atoms";
import { FeatureCards, type FeatureCard } from "@/components/FeatureCards";
import { ServiceNav } from "@/components/ServiceNav";

export const metadata = {
  title: "Ads y Performance - UPZITES",
  description:
    "Meta Ads, Google Ads, creatividades, tracking y optimizacion de funnels para convertir atencion en leads y ventas.",
};

const ACCENT = "var(--upz-solar)";

const CARDS: FeatureCard[] = [
  {
    num: "01",
    title: "Ads Setup & Lanzamiento",
    visible: "La cuenta queda lista para medir y vender.",
    detail:
      "Configuramos Business Manager, pixel, conversiones, audiencias, estructura inicial de campanas y primeros anuncios para lanzar con control.",
    micro: "Antes de escalar, hay que medir bien.",
  },
  {
    num: "02",
    title: "Meta Ads Management",
    visible: "Facebook e Instagram con intencion comercial.",
    detail:
      "Gestionamos campanas, segmentacion, retargeting, creatividades, pruebas A/B y optimizacion continua segun leads, mensajes o ventas.",
    micro: "No es publicar anuncios. Es construir aprendizaje.",
  },
  {
    num: "03",
    title: "Google Ads Management",
    visible: "Capturamos demanda cuando ya existe intencion.",
    detail:
      "Estructuramos campanas de busqueda, display o YouTube con keywords, anuncios, extensiones, landing pages y conversiones claras.",
    micro: "El trafico debe llegar a una accion.",
  },
  {
    num: "04",
    title: "Creatividades para pauta",
    visible: "Piezas pensadas para detener el scroll.",
    detail:
      "Creamos graficas, reels, hooks, copies y variantes visuales conectadas a la identidad de marca y al objetivo de la campana.",
    micro: "La creatividad atrae. El sistema convierte.",
  },
  {
    num: "05",
    title: "Tracking y conversiones",
    visible: "Cada lead debe tener origen.",
    detail:
      "Conectamos eventos, UTMs, formularios, WhatsApp, CRM y dashboards para saber que canal genera oportunidades reales.",
    micro: "Sin datos, la pauta es opinion.",
  },
  {
    num: "06",
    title: "Performance Full",
    visible: "Meta + Google + funnel + optimizacion.",
    detail:
      "Unimos pauta, contenido, landing, CRM y seguimiento comercial para mejorar costo por lead, tasa de conversion y calidad de prospectos.",
    micro: "El anuncio es solo una parte del sistema.",
  },
];

const METRICS = [
  "Costo por lead",
  "Costo por conversacion",
  "ROAS",
  "Tasa de conversion",
  "Calidad de prospectos",
  "Reservas generadas",
  "Ventas atribuidas",
  "Retargeting",
];

export default function AdsPerformancePage() {
  return (
    <div id="top" style={{ "--svc-accent": ACCENT } as CSSProperties}>
      <TopNav />
      <ServiceNav current="ads-performance" />

      <section className="brand-hero" data-screen-label="Ads Performance Hero">
        <div className="shell">
          <div className="svc-breadcrumb">
            <Link href="/servicios">Servicios</Link>
            <span>↗</span>
            <span>Ads y Performance</span>
          </div>
          <div className="brand-hero-grid">
            <div>
              <Eyebrow num="05">Servicio - Ads y Performance</Eyebrow>
              <h1 className="brand-hero-title">
                Publicidad digital con <span className="mark">intencion y datos</span>.
              </h1>
              <p className="brand-hero-sub">
                Gestionamos Meta Ads, Google Ads, creatividades y optimizacion
                de funnel para convertir atencion en leads, conversaciones,
                reservas y ventas medibles.
              </p>
              <p className="brand-hero-note">
                La pauta no arregla una mala estrategia. Por eso conectamos
                anuncios, contenido, landing pages, WhatsApp, CRM y seguimiento.
              </p>
              <div className="hero-actions">
                <Link href="/#contact" className="btn btn-dark btn-lg">
                  Activar campanas <span className="arr">↗</span>
                </Link>
                <a href="#incluye" className="btn btn-ivory btn-lg">
                  Ver que incluye <span className="arr">↗</span>
                </a>
              </div>
            </div>
            <div className="brand-hero-media">
              <img src="/images/marketing-cover.webp" alt="Campanas de performance, contenido y medicion digital" />
            </div>
          </div>
        </div>
      </section>

      <section id="incluye" className="section" data-screen-label="Ads Performance Incluye">
        <div className="shell">
          <Eyebrow num="02">Que incluye</Eyebrow>
          <div className="services-head">
            <Reveal>
              <h2 className="services-h">
                Campanas que no viven solas.<br />
                <span className="b">Sistema completo<span style={{ color: ACCENT }}>.</span></span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "var(--fg-2)", maxWidth: 460, margin: 0 }}>
                Pasa el cursor o toca cada tarjeta para ver como trabajamos
                cada parte del sistema de pauta.
              </p>
            </Reveal>
          </div>
          <FeatureCards cards={CARDS} />
        </div>
      </section>

      <section className="section section--carbon" data-screen-label="Ads Performance Metricas">
        <div className="shell">
          <Eyebrow>Metricas que importan</Eyebrow>
          <div className="services-head">
            <Reveal>
              <h2 className="services-h">
                Menos humo.<br />
                <span className="b">Mas trazabilidad<span style={{ color: ACCENT }}>.</span></span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "rgba(250,251,245,.72)", maxWidth: 460, margin: 0 }}>
                Medimos los indicadores que conectan marketing con negocio.
              </p>
            </Reveal>
          </div>
          <div className="intro-tags" style={{ marginTop: 32 }}>
            {METRICS.map((metric) => (
              <Pill key={metric} dot>{metric}</Pill>
            ))}
          </div>
        </div>
      </section>

      <Marquee
        variant="carbon"
        items={[
          "Meta Ads",
          "Google Ads",
          "Creatividades",
          "Landing pages",
          "WhatsApp",
          "CRM",
          "Retargeting",
          "ROAS",
        ]}
      />

      <section className="brand-closing" data-screen-label="Ads Performance Cierre">
        <div className="shell">
          <Sticker tone="lime" angle={-3}>Performance con direccion</Sticker>
          <Reveal>
            <h2 className="brand-closing-h">
              Que cada click tenga <span className="mark">un camino comercial</span>.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="brand-closing-copy">
              Creamos campanas conectadas a contenido, web, CRM y seguimiento
              para que la inversion no se quede solo en alcance.
            </p>
            <Link href="/#contact" className="btn btn-lime btn-lg">
              Quiero pauta con sistema <span className="arr">↗</span>
            </Link>
          </Reveal>
        </div>
      </section>

      <ServiceNav current="ads-performance" />
      <Footer />
    </div>
  );
}
