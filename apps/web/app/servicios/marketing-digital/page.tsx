import type { CSSProperties } from "react";
import Link from "next/link";
import { TopNav, Footer, Marquee } from "@/components/Sections";
import { Eyebrow, Reveal, Sticker, Pill } from "@/components/Atoms";
import { FeatureCards, type FeatureCard } from "@/components/FeatureCards";
import { ServiceNav } from "@/components/ServiceNav";

export const metadata = {
  title: "Marketing digital — UPZITES",
  description:
    "Estrategias, campañas y sistemas digitales para atraer mejores clientes, comunicar con claridad y convertir la atención en ventas reales.",
};

const ACCENT = "var(--upz-guava)";

const CARDS: FeatureCard[] = [
  { num: "01", title: "Estrategia digital", visible: "Definimos el camino antes de mover presupuesto.", detail: "Analizamos tu marca, oferta, audiencia, competencia, canales y objetivos para construir una estrategia digital con dirección. Definimos qué decir, dónde decirlo, a quién hablarle y qué acción queremos provocar.", micro: "Primero estrategia. Después ejecución." },
  { num: "02", title: "Auditoría de presencia digital", visible: "Detectamos qué está frenando tu crecimiento.", detail: "Revisamos redes, sitio web, anuncios, mensajes, contenido, experiencia de usuario, posicionamiento y puntos de conversión para encontrar oportunidades claras de mejora.", micro: "No se optimiza lo que no se entiende." },
  { num: "03", title: "Campañas publicitarias", visible: "Diseñamos campañas con intención comercial.", detail: "Creamos campañas para Meta Ads, Google Ads, TikTok Ads u otros canales según el objetivo de la marca. Definimos audiencias, mensajes, formatos, presupuesto, objetivos y estructura de prueba.", micro: "La pauta no es magia. Es sistema." },
  { num: "04", title: "Contenido estratégico", visible: "Contenido que construye marca y mueve decisiones.", detail: "Planificamos contenido para atraer, educar, generar confianza y activar conversiones. No diseñamos piezas sueltas: creamos contenido conectado a objetivos de negocio.", micro: "Publicar menos al azar. Comunicar mejor." },
  { num: "05", title: "Embudos de conversión", visible: "Diseñamos el recorrido del usuario hasta la acción.", detail: "Creamos estructuras para llevar a una persona desde el primer contacto hasta una conversación, lead, compra, reserva o cotización. Integramos anuncios, contenido, landing pages, formularios, WhatsApp o ecommerce según el caso.", micro: "La atención debe tener camino." },
  { num: "06", title: "Copywriting comercial", visible: "Mensajes claros para vender sin sonar genéricos.", detail: "Escribimos titulares, anuncios, textos para landing pages, mensajes de campaña, guiones, llamados a la acción y argumentos comerciales alineados con la voz de la marca.", micro: "La claridad vende. La personalidad se recuerda." },
  { num: "07", title: "Creatividad para anuncios", visible: "Piezas visuales diseñadas para detener el scroll.", detail: "Diseñamos conceptos, gráficas, videos cortos, hooks y formatos publicitarios pensados para captar atención, explicar valor y generar acción sin perder identidad visual.", micro: "Diseño que atrae. Mensaje que convierte." },
  { num: "08", title: "Landing pages y puntos de conversión", visible: "Creamos destinos digitales que convierten mejor.", detail: "Diseñamos o mejoramos landing pages, formularios, botones, mensajes, secciones y recorridos para que el tráfico no se pierda después del clic.", micro: "El clic no sirve si la página no convence." },
  { num: "09", title: "WhatsApp y seguimiento", visible: "Convertimos conversaciones en oportunidades reales.", detail: "Estructuramos flujos de atención, mensajes de bienvenida, preguntas de calificación, respuestas a objeciones y seguimientos para mejorar la conversión desde WhatsApp o canales de contacto directo.", micro: "Responder rápido no basta. Hay que guiar." },
  { num: "10", title: "Analítica y optimización", visible: "Medimos, aprendemos y ajustamos.", detail: "Revisamos métricas clave como alcance, clics, costo por lead, tasa de conversión, mensajes, ventas, rendimiento por campaña y comportamiento del usuario para optimizar decisiones.", micro: "Lo que no se mide, se improvisa." },
];

const PROCESS = [
  { num: "01", title: "Diagnóstico", body: "Analizamos tu marca, presencia digital, competencia, oferta, canales y puntos actuales de conversión." },
  { num: "02", title: "Estrategia", body: "Definimos objetivos, audiencias, mensajes, canales, embudo, contenido, campañas y prioridades." },
  { num: "03", title: "Concepto creativo", body: "Creamos la línea visual y verbal de la campaña: hooks, copies, ideas, piezas, formatos y narrativa." },
  { num: "04", title: "Implementación", body: "Activamos contenido, anuncios, landing pages, formularios, WhatsApp o puntos de conversión según el plan." },
  { num: "05", title: "Medición", body: "Revisamos métricas reales para entender qué está funcionando y qué debe ajustarse." },
  { num: "06", title: "Optimización", body: "Mejoramos campañas, piezas, mensajes, públicos, presupuesto y recorridos para aumentar rendimiento." },
];

const INCLUYE = [
  { title: "Estrategia mensual o por campaña", body: "Plan de acción con objetivos, canales, mensajes y prioridades." },
  { title: "Gestión de pauta digital", body: "Estructura, configuración, seguimiento y optimización de campañas." },
  { title: "Diseño de piezas publicitarias", body: "Creatividades para anuncios, redes, campañas, lanzamientos o promociones." },
  { title: "Calendario de contenido", body: "Ideas, formatos, frecuencia, pilares de comunicación y objetivos por publicación." },
  { title: "Copywriting para campañas", body: "Textos para anuncios, landing pages, emails, mensajes y llamados a la acción." },
  { title: "Landing page o ajustes web", body: "Optimización del destino del tráfico para mejorar conversión." },
  { title: "Automatización o flujo comercial", body: "Mensajes, formularios, WhatsApp, respuestas y seguimiento." },
  { title: "Reporte de resultados", body: "Lectura clara de métricas, aprendizajes y próximas acciones." },
];

const PARA_QUIEN = [
  "Marcas que publican, pero no convierten.",
  "Negocios que invierten en pauta sin una estrategia clara.",
  "Empresas que quieren ordenar su comunicación digital.",
  "Marcas que necesitan más leads, reservas, ventas o conversaciones calificadas.",
  "Proyectos que quieren crecer sin perder identidad visual.",
  "Negocios que necesitan conectar diseño, contenido, anuncios y conversión.",
];

const METRICAS = [
  "Leads generados", "Costo por lead", "Costo por conversación", "Tasa de conversión",
  "Rendimiento de campañas", "Tráfico al sitio web", "Consultas por WhatsApp",
  "Ventas o reservas", "Calidad de prospectos", "Retorno sobre inversión (ROAS)",
];

const FRASES = [
  "No publicamos por publicar",
  "Cada campaña necesita una intención",
  "La atención sin conversión se pierde",
  "Más pauta no arregla una mala estrategia",
  "Tu contenido debe construir confianza, no solo llenar el feed",
  "El diseño atrae · la estrategia convierte",
];

export default function MarketingDigitalPage() {
  return (
    <div id="top" style={{ "--svc-accent": ACCENT } as CSSProperties}>
      <TopNav />
      <ServiceNav current="marketing-digital" />

      {/* 1. Hero */}
      <section className="brand-hero" data-screen-label="Marketing · Hero">
        <div className="shell">
          <div className="svc-breadcrumb">
            <Link href="/servicios">Servicios</Link>
            <span>↗</span>
            <span>Marketing digital</span>
          </div>
          <div className="brand-hero-grid">
            <div>
              <Eyebrow num="01">Servicio · Marketing digital</Eyebrow>
              <h1 className="brand-hero-title">
                Marketing digital para marcas que quieren crecer <span className="mark">con intención</span>.
              </h1>
              <p className="brand-hero-sub">
                Creamos estrategias, campañas y sistemas digitales para atraer
                mejores clientes, comunicar con claridad y convertir la atención
                en oportunidades reales de venta.
              </p>
              <p className="brand-hero-note">
                No se trata de publicar por publicar. Se trata de construir
                presencia, mover el tráfico correcto y convertir interés en acción.
              </p>
              <div className="hero-actions">
                <Link href="/#contact" className="btn btn-dark btn-lg">Quiero crecer mi marca <span className="arr">↗</span></Link>
                <a href="#incluye" className="btn btn-ivory btn-lg">Ver qué incluye <span className="arr">↗</span></a>
              </div>
            </div>
            <div className="brand-hero-media">
              <img src="/images/marketing-cover.webp" alt="Creación de contenido y marketing digital: grabación, redes y analítica" />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Problema */}
      <section className="section section--tight" data-screen-label="Marketing · Problema">
        <div className="shell brand-problem">
          <Reveal>
            <h2 className="brand-promise-h" style={{ marginTop: 0 }}>
              Tu marca puede estar activa, pero no necesariamente estar creciendo.
            </h2>
          </Reveal>
          <Reveal delay={80}>
            <p className="brand-lead">
              Muchas marcas publican, pautan y producen contenido sin una dirección
              clara. Tienen redes, anuncios, diseños y campañas, pero todo funciona
              como piezas sueltas. El resultado: mucho movimiento, poca conversión.
            </p>
          </Reveal>
          <Reveal delay={140}>
            <h2 className="brand-punch">
              Más contenido no siempre significa <span className="strike">más crecimiento</span>.<br />
              Necesitas <span className="mark">estrategia, sistema y ejecución</span>.
            </h2>
          </Reveal>
        </div>
      </section>

      {/* 3. Promesa */}
      <section className="section section--ivory" data-screen-label="Marketing · Promesa">
        <div className="shell">
          <div className="brand-promise">
            <Reveal>
              <div className="brand-promise-media">
                <img src="/images/marketing-promise.webp" alt="Presencia digital como sistema: contenido y campañas en varios dispositivos" />
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div>
                <Eyebrow num="02">La promesa</Eyebrow>
                <h2 className="brand-promise-h">
                  Convertimos tu presencia digital en un sistema de atracción, confianza y venta.
                </h2>
                <p className="brand-body">
                  Diseñamos estrategias de marketing digital que conectan contenido,
                  pauta, mensajes, embudos, landing pages, analítica y optimización
                  para que tu marca no solo se vea activa, sino mejor posicionada,
                  más clara y más preparada para vender.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 4. Qué incluye · cards interactivas */}
      <section id="incluye" className="section" data-screen-label="Marketing · Incluye">
        <div className="shell">
          <Eyebrow num="03">¿Qué incluye Marketing Digital?</Eyebrow>
          <div className="services-head">
            <Reveal>
              <h2 className="services-h">
                Diez frentes.<br />
                <span className="b">Una sola estrategia<span style={{ color: ACCENT }}>.</span></span>
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

      {/* 5. Nuestro enfoque */}
      <section className="section section--carbon" data-screen-label="Marketing · Enfoque">
        <div className="shell brand-sell" style={{ maxWidth: 900 }}>
          <Eyebrow>Nuestro enfoque</Eyebrow>
          <Reveal>
            <h2 className="brand-closing-h" style={{ fontSize: "clamp(28px,3.4vw,52px)" }}>
              Marketing digital con estrategia, diseño y <span className="mark">performance</span>.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="brand-closing-copy" style={{ maxWidth: 720 }}>
              En UPZITES unimos pensamiento estratégico, criterio visual y ejecución
              digital para construir campañas que no dependan solo de verse bonitas
              o tener presupuesto. Cada acción debe tener una intención: atraer,
              posicionar, educar, convertir o fidelizar.
            </p>
          </Reveal>
        </div>
      </section>

      {/* 6. Proceso */}
      <section className="section" data-screen-label="Marketing · Proceso">
        <div className="shell">
          <Eyebrow num="04">Proceso</Eyebrow>
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
                <img src="/images/marketing-process.webp" alt="Espacio de trabajo con analítica, contenido y campañas" />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 7. Qué puede incluir el servicio */}
      <section className="section section--ivory" data-screen-label="Marketing · Incluye servicio">
        <div className="shell">
          <Eyebrow num="05">Qué puede incluir el servicio</Eyebrow>
          <div className="services-head">
            <Reveal>
              <h2 className="services-h">
                A tu medida.<br />
                <span className="b">Por campaña o por mes<span style={{ color: ACCENT }}>.</span></span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "var(--fg-2)", maxWidth: 460, margin: 0 }}>
                Armamos el alcance según tu objetivo, etapa y presupuesto.
              </p>
            </Reveal>
          </div>
          <div className="svc-includes">
            {INCLUYE.map((it, i) => (
              <Reveal key={it.title} delay={i * 50}>
                <div className="svc-include">
                  <span className="svc-include-num">{String(i + 1).padStart(2, "0")}</span>
                  <h3>{it.title}</h3>
                  <p>{it.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 8. Para quién es */}
      <section className="section" data-screen-label="Marketing · Para quién">
        <div className="shell">
          <Eyebrow num="06">Para quién es este servicio</Eyebrow>
          <div className="services-head">
            <Reveal>
              <h2 className="services-h">
                Para marcas que necesitan<br />
                <span className="b">dejar de improvisar<span style={{ color: ACCENT }}>.</span></span>
              </h2>
            </Reveal>
          </div>
          <div className="mkt-points">
            {PARA_QUIEN.map((p, i) => (
              <Reveal key={i} delay={i * 50}>
                <div className="mkt-point">
                  <span className="mkt-point-arr">↗</span>
                  <span>{p}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 9. Resultados / métricas */}
      <section className="section section--carbon" data-screen-label="Marketing · Resultados">
        <div className="shell">
          <Eyebrow>Resultados que buscamos</Eyebrow>
          <div className="services-head">
            <Reveal>
              <h2 className="services-h">
                No prometemos humo.<br />
                <span className="b">Diseñamos sistemas<span style={{ color: ACCENT }}>.</span></span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "rgba(250,251,245,.72)", maxWidth: 460, margin: 0 }}>
                El marketing digital no se trata solo de likes o seguidores. Nos
                enfocamos en métricas que conectan con el negocio.
              </p>
            </Reveal>
          </div>
          <div className="intro-tags" style={{ marginTop: 32 }}>
            {METRICAS.map((m) => <Pill key={m} dot>{m}</Pill>)}
          </div>
        </div>
      </section>

      <Marquee variant="carbon" items={FRASES} />

      {/* 10. Venta */}
      <section className="section section--ivory" data-screen-label="Marketing · Venta">
        <div className="shell brand-sell">
          <Reveal>
            <h2 className="services-h">
              Tu marca no necesita más ruido.<br />
              <span className="b">Necesita dirección digital<span style={{ color: ACCENT }}>.</span></span>
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="brand-body">
              Creamos estrategias y campañas para que cada publicación, anuncio,
              página y mensaje trabaje con una intención clara. Más que estar
              presente, tu marca necesita ser entendida, recordada y elegida.
            </p>
            <Link href="/#contact" className="btn btn-dark btn-lg">Diseñar mi estrategia digital <span className="arr">↗</span></Link>
          </Reveal>
        </div>
      </section>

      {/* 11. Cierre */}
      <section className="brand-closing" data-screen-label="Marketing · Cierre">
        <div className="shell">
          <Sticker tone="lime" angle={-3}>Crecimiento con dirección</Sticker>
          <Reveal>
            <h2 className="brand-closing-h">
              Marketing con sistema. Creatividad con intención. <span className="mark">Crecimiento con dirección</span>.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="brand-closing-copy">
              Para marcas que quieren dejar de lanzar contenido al vacío. Para
              negocios que quieren atraer mejor, comunicar más claro y convertir
              con más estrategia.
            </p>
            <Link href="/#contact" className="btn btn-lime btn-lg">Quiero activar mi marketing digital <span className="arr">↗</span></Link>
            <Link href="/#projects" className="btn btn-light btn-lg">Ver proyectos <span className="arr">↗</span></Link>
          </Reveal>
        </div>
      </section>

      <ServiceNav current="marketing-digital" />
      <Footer />
    </div>
  );
}
