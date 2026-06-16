import Link from "next/link";
import { TopNav, Footer, Marquee, Testimonials, ExpressSolutions } from "@/components/Sections";
import { Eyebrow, Reveal, Pill, Sticker } from "@/components/Atoms";
import { SERVICES } from "@/lib/services";

export const metadata = {
  title: "Servicios — UPZITES",
  description:
    "Servicios de marca, web, e-commerce, apps, contenido, ads y automatización para empresas que necesitan crecer con un sistema digital completo.",
};

const FAQ = [
  {
    q: "¿Necesito contratar todos los servicios del ecosistema digital de UPZITES",
    a: "No, nuestros servicios están diseñados para ser modulares y escalables. Si bien siempre recomendamos una estrategia integral (Branding + Web + Marketing) para un crecimiento exponencial, puedes iniciar con el servicio que tu negocio más necesite en este momento, como un rebranding o el desarrollo de una aplicación específica. Te ayudamos a priorizar tu inversión.",
  },
  {
    q: "¿Cuánto tiempo tarda un proyecto de Diseño Web o Branding Estratégico",
    a: "La duración varía según la complejidad y el nivel de detalle estratégico. Como regla general, un proyecto de Branding Estratégico puede tomar entre 4 y 6 semanas, mientras que un Desarrollo Web personalizado (sitio corporativo o E-commerce) suele completarse en 8 a 12 semanas. Nuestra prioridad es la calidad y la estrategia, no la velocidad.",
  },
  {
    q: "¿Qué diferencia a UPZITES de un freelancer o una agencia tradicional",
    a: "Nuestra diferencia clave es la fusión de Estrategia, Diseño y Tecnología. No solo ejecutamos tareas; somos un estudio que desarrolla activos digitales a medida, escalables y con una obsesión por el detalle. A diferencia de las plantillas genéricas, nuestro enfoque garantiza que cada pieza esté orientada a la conversión y al Retorno de Inversión (ROI).",
  },
];

export default function ServiciosPage() {
  const total = `0${SERVICES.length}`;
  return (
    <div id="top">
      <TopNav />

      {/* Page header */}
      <section className="section section--tight" style={{ paddingTop: 140 }} data-screen-label="Servicios · Intro">
        <div className="shell">
          <Eyebrow num="01">Servicios · ¿Qué sabemos hacer</Eyebrow>
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
                cada servicio —desde el branding hasta el marketing— impulse el
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
              <Reveal key={s.slug} delay={i * 60}>
                <Link
                  href={`/servicios/${s.slug}`}
                  className="service-card"
                  style={{ "--svc-accent": s.accent } as React.CSSProperties}
                >
                  <div className="service-media">
                    <img src={s.image} alt={s.title} loading="lazy" />
                    {s.badge && <span className="service-badge">{s.badge}</span>}
                  </div>
                  <div className="service-num">
                    <span>{s.num} / {total}</span>
                    <span>Servicio</span>
                  </div>
                  <h3 className="service-card-title">{s.title}</h3>
                  <p className="service-card-body">{s.card}</p>
                  <div className="service-card-tags">
                    {s.tags.map((t) => <span key={t}>{t}</span>)}
                  </div>
                  <div className="service-card-foot">
                    <span className="service-card-foot-label">Más detalles</span>
                    <span className="service-card-arr">↗</span>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <ExpressSolutions />

      <Marquee
        variant="carbon"
        items={["Branding", "Diseño web", "E-commerce", "Marketing digital", "Contenido", "Ads", "Apps móviles", "Automatización IA"]}
      />

      {/* Social proof */}
      <Testimonials />

      {/* FAQ */}
      <section id="faq" className="section section--ivory" data-screen-label="Servicios · FAQ">
        <div className="shell">
          <Eyebrow num="06">FAQ · Las preguntas que más nos hacen</Eyebrow>
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
              <Link href="/contacto" className="btn btn-lime btn-lg">Hablemos <span className="arr">↗</span></Link>
              <Link href="/#agenda" className="btn btn-light btn-lg">Agendar reunión <span className="arr">↗</span></Link>
              <Link href="/api/brochure/downloadsource=services_page" className="btn btn-light btn-lg">Brochure <span className="arr">↗</span></Link>
            </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </div>
  );
}
