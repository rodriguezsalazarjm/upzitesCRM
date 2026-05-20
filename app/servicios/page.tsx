import Link from "next/link";
import { TopNav, Footer, Marquee, Testimonials } from "@/components/Sections";
import { Eyebrow, Reveal, Pill, Sticker } from "@/components/Atoms";

export const metadata = {
  title: "Servicios — UPZITES",
  description:
    "Servicios de diseño web que convierten y estrategias de marketing digital para empresas: branding, e-commerce, UX/UI, SEO, apps y video.",
};

const SERVICES = [
  {
    num: "01",
    title: "Branding estratégico",
    body: "Creamos identidades visuales memorables. Convertimos tu visión en un sistema visual coherente, profesional y poderoso.",
    tags: ["Identidad", "Sistema visual", "Manual"],
  },
  {
    num: "02",
    title: "Diseño web",
    body: "Sitios web de alto rendimiento, rápidos y modernos. Plataformas optimizadas para la conversión de visitantes en clientes.",
    tags: ["Alto rendimiento", "Conversión", "Responsive"],
  },
  {
    num: "03",
    title: "E-commerce",
    body: "Tiendas online funcionales que venden. Maximizamos la experiencia de compra y las pasarelas de pago para incrementar tus ingresos.",
    tags: ["Shopify", "WooCommerce", "Pasarelas"],
  },
  {
    num: "04",
    title: "UX / UI design",
    body: "Interfaces intuitivas y centradas en el usuario. Diseñamos para garantizar una navegación lógica y aumentar la satisfacción del cliente.",
    tags: ["Research", "Flujos", "Prototipo"],
  },
  {
    num: "05",
    title: "SEO",
    body: "Optimización de motores de búsqueda para resultados a largo plazo. Te posicionamos en Google para atraer tráfico orgánico de calidad.",
    tags: ["SEO técnico", "Contenido", "Orgánico"],
  },
  {
    num: "06",
    title: "Marketing digital",
    body: "Campañas efectivas orientadas a resultados. Implementamos embudos de venta, Meta Ads y Google Ads para escalar tus ingresos.",
    tags: ["Meta Ads", "Google Ads", "Funnels"],
  },
  {
    num: "07",
    title: "Desarrollo de apps",
    body: "Creamos aplicaciones nativas y multiplataforma. Diseñamos experiencias de usuario robustas y escalables para iOS y Android.",
    tags: ["iOS", "Android", "Multiplataforma"],
  },
  {
    num: "08",
    title: "Edición de video",
    body: "Producción audiovisual de impacto. Edición dinámica, motion graphics y animaciones profesionales para tus redes y publicidad.",
    tags: ["Motion", "Reels", "Anuncios"],
  },
];

const FAQ = [
  {
    q: "¿Necesito contratar todos los servicios del ecosistema digital de UPZITES?",
    a: "No, nuestros servicios están diseñados para ser modulares y escalables. Si bien siempre recomendamos una estrategia integral (Branding + Web + Marketing) para un crecimiento exponencial, puedes iniciar con el servicio que tu negocio más necesite en este momento, como un rebranding o el desarrollo de una aplicación específica. Te ayudamos a priorizar tu inversión.",
  },
  {
    q: "¿Cuánto tiempo tarda un proyecto de Diseño Web o Branding Estratégico?",
    a: "La duración varía según la complejidad y el nivel de detalle estratégico. Como regla general, un proyecto de Branding Estratégico puede tomar entre 4 y 6 semanas, mientras que un Desarrollo Web personalizado (sitio corporativo o E-commerce) suele completarse en 8 a 12 semanas. Nuestra prioridad es la calidad y la estrategia, no la velocidad.",
  },
  {
    q: "¿Qué diferencia a UPZITES de un freelancer o una agencia tradicional?",
    a: "Nuestra diferencia clave es la fusión de Estrategia, Diseño y Tecnología. No solo ejecutamos tareas; somos un estudio que desarrolla activos digitales a medida, escalables y con una obsesión por el detalle. A diferencia de las plantillas genéricas, nuestro enfoque garantiza que cada pieza esté orientada a la conversión y al Retorno de Inversión (ROI).",
  },
];

export default function ServiciosPage() {
  return (
    <div id="top">
      <TopNav />

      {/* Page header */}
      <section className="section section--tight" style={{ paddingTop: 140 }} data-screen-label="Servicios · Intro">
        <div className="shell">
          <Eyebrow num="01">Servicios · ¿Qué sabemos hacer?</Eyebrow>
          <div className="services-head">
            <Reveal>
              <h2 className="services-h">
                Diseño web que convierte.<br />
                <span className="b">Marketing que escala<span style={{ color: "var(--upz-tomato)" }}>.</span></span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "var(--fg-2)", maxWidth: 480, margin: 0 }}>
                En UPZITES no solo ejecutamos tareas; creamos un ecosistema
                digital completo. Fusionamos creatividad de vanguardia,
                tecnología robusta y estrategia orientada a resultados para que
                cada servicio —desde el branding hasta el SEO— impulse el
                crecimiento medible de tu negocio.
              </p>
              <div className="intro-tags" style={{ marginTop: 24 }}>
                <Pill dot>Estrategia 360°</Pill>
                <Pill dot>Modular y escalable</Pill>
                <Pill dot>Orientado al ROI</Pill>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Services grid */}
      <section id="services" className="section" style={{ paddingTop: 0 }} data-screen-label="Servicios · Detalle">
        <div className="shell">
          <div className="services-grid">
            {SERVICES.map((s, i) => (
              <Reveal key={s.num} delay={i * 60}>
                <article className="service-card">
                  <div className="service-num">
                    <span>{s.num} / 08</span>
                    <span>Servicio</span>
                  </div>
                  <h3 className="service-card-title">{s.title}</h3>
                  <p className="service-card-body">{s.body}</p>
                  <div className="service-card-tags">
                    {s.tags.map((t) => <span key={t}>{t}</span>)}
                  </div>
                  <div className="service-card-foot">
                    <span className="service-card-foot-label">Más detalles</span>
                    <span className="service-card-arr">↗</span>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Marquee
        variant="carbon"
        items={["Branding", "Diseño web", "E-commerce", "UX/UI", "SEO · SEM", "Marketing digital", "Apps", "Video"]}
      />

      {/* Social proof */}
      <Testimonials />

      {/* FAQ */}
      <section id="faq" className="section section--ivory" data-screen-label="Servicios · FAQ">
        <div className="shell">
          <Eyebrow num="07">FAQ · Las preguntas que más nos hacen</Eyebrow>
          <div className="services-head">
            <Reveal>
              <h2 className="services-h">
                Aclara tus<br />
                <span className="b">dudas clave<span style={{ color: "var(--upz-electric)" }}>.</span></span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "var(--fg-2)", maxWidth: 460, margin: 0 }}>
                Y si necesitas una respuesta personalizada sobre tu proyecto,
                nuestro equipo estratégico está listo para conversar.
              </p>
            </Reveal>
          </div>

          <div className="faq-list">
            {FAQ.map((f, i) => (
              <Reveal key={i} delay={i * 60}>
                <details className="faq-item">
                  <summary className="faq-q">
                    <span>{f.q}</span>
                    <span className="faq-icon">↗</span>
                  </summary>
                  <p className="faq-a">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section section--carbon" data-screen-label="Servicios · CTA">
        <div className="shell" style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
          <Sticker tone="lime" angle={-3}>Te respondemos en 24h</Sticker>
          <Reveal>
            <h2 className="services-h" style={{ maxWidth: 760 }}>
              Tu crecimiento digital empieza con una <span className="hl">conversación clara</span>.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <div className="hero-actions" style={{ justifyContent: "center" }}>
              <Link href="/#contact" className="btn btn-lime btn-lg">Hablemos <span className="arr">↗</span></Link>
              <Link href="/#agenda" className="btn btn-light btn-lg">Agendar reunión <span className="arr">↗</span></Link>
            </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </div>
  );
}
