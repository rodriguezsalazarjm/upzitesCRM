import type { CSSProperties } from "react";
import Link from "next/link";
import { TopNav, Footer, Marquee } from "@/components/Sections";
import { Eyebrow, Reveal, Sticker, Pill } from "@/components/Atoms";
import { FeatureCards, type FeatureCard } from "@/components/FeatureCards";
import { ServiceNav } from "@/components/ServiceNav";

export const metadata = {
  title: "Automatización con IA — UPZITES",
  description:
    "Conectamos tus herramientas y automatizamos procesos con IA (n8n, Make, chatbots). Menos tareas manuales, atención 24/7 y más tiempo para crecer — sin perder tu identidad.",
};

const ACCENT = "var(--upz-tangerine)";

const CARDS: FeatureCard[] = [
  { num: "01", title: "Chatbots e IA conversacional", visible: "Tu marca responde sola, 24/7.", detail: "Un asistente entrenado con tu información que responde dudas, califica leads y agenda reuniones con el tono de tu marca — integrado a tu web o WhatsApp.", micro: "Atención automática, sin perder tu voz." },
  { num: "02", title: "Automatización de flujos", visible: "Conectamos tus herramientas.", detail: "Con n8n y Make enlazamos formularios, CRM, email, WhatsApp, planillas y más para que la información viaje sola entre tus plataformas.", micro: "La info se mueve sin que la muevas." },
  { num: "03", title: "Captación y seguimiento", visible: "Leads que se gestionan solos.", detail: "Los contactos entran, se clasifican y reciben seguimiento automático en el momento justo, sin trabajo manual.", micro: "Cero leads que se enfrían." },
  { num: "04", title: "Integraciones a medida", visible: "Tus plataformas, conectadas.", detail: "Conexión entre web, tienda, agenda, pagos y herramientas internas mediante APIs e integraciones inteligentes.", micro: "Todo conversa entre sí." },
  { num: "05", title: "Reportes automáticos", visible: "Métricas que llegan solas.", detail: "Resúmenes y reportes que aparecen en tu correo o panel, listos para decidir — sin armar planillas a mano.", micro: "Decide con datos al día." },
  { num: "06", title: "IA con criterio", visible: "Tecnología con dirección.", detail: "Integramos IA donde realmente suma, no por moda. Una capa estratégica sobre tu marca, manteniendo intacta tu identidad.", micro: "IA como capa premium, no como disfraz." },
];

const TOOLS = ["n8n", "Make", "Zapier", "OpenAI", "WhatsApp API", "Google Sheets", "Notion", "HubSpot", "Calendly"];

const USES = [
  "Chatbot que responde y califica leads 24/7",
  "Reservas y citas agendadas automáticamente",
  "Respuestas y correos con tu tono de marca",
  "Sincronización entre web, CRM y planillas",
  "Reportes de ventas y métricas automáticos",
  "Recordatorios y seguimiento post-venta",
];

const PROCESS = [
  { num: "01", t: "Diagnóstico", d: "Mapeamos tus procesos, herramientas y los cuellos de botella que te quitan tiempo." },
  { num: "02", t: "Diseño del flujo", d: "Definimos qué automatizar, con qué lógica y dónde la IA aporta valor real." },
  { num: "03", t: "Integración", d: "Conectamos tus plataformas y entrenamos la IA con la información de tu marca." },
  { num: "04", t: "Pruebas y ajuste", d: "Validamos, medimos y afinamos hasta que el sistema funcione solo y con criterio." },
];

export default function AutomatizacionIaPage() {
  return (
    <div id="top" style={{ "--svc-accent": ACCENT } as CSSProperties}>
      <TopNav />
      <ServiceNav current="automatizacion-ia" />

      {/* 1. Hero */}
      <section className="brand-hero" data-screen-label="IA · Hero">
        <div className="shell">
          <div className="svc-breadcrumb">
            <Link href="/servicios">Servicios</Link>
            <span>↗</span>
            <span>Automatización con IA</span>
          </div>
          <div className="brand-hero-grid">
            <div>
              <Eyebrow num="06">Servicio · Automatización con IA</Eyebrow>
              <h1 className="brand-hero-title">
                Tu negocio funcionando <span className="mark">solo, 24/7</span>.
              </h1>
              <p className="brand-hero-sub">
                Conectamos tus herramientas y automatizamos procesos con IA. Menos
                tareas manuales, atención al cliente sin pausa y más tiempo para
                crecer — como una capa estratégica sobre tu marca, no un cambio de
                identidad.
              </p>
              <div className="hero-actions">
                <Link href="/#contact" className="btn btn-dark btn-lg">Automatizar mi negocio <span className="arr">↗</span></Link>
                <a href="#incluye" className="btn btn-ivory btn-lg">Ver qué incluye <span className="arr">↗</span></a>
              </div>
            </div>
            <div className="brand-hero-media">
              <img src="/images/automatizacion-ia-cover.webp" alt="Automatización de procesos con IA: flujos conectados entre herramientas" />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Problema */}
      <section className="section section--tight" data-screen-label="IA · Problema">
        <div className="shell brand-problem">
          <Reveal>
            <h2 className="brand-promise-h" style={{ marginTop: 0 }}>El trabajo repetitivo te frena.</h2>
          </Reveal>
          <Reveal delay={80}>
            <p className="brand-lead">
              Responder los mismos mensajes, copiar datos de un lado a otro, perseguir
              leads, armar reportes a mano. Tareas que consumen horas, generan errores
              y no dejan crecer al negocio.
            </p>
          </Reveal>
          <Reveal delay={140}>
            <h2 className="brand-punch">
              La IA no reemplaza tu marca.<br />
              <span className="mark">La hace funcionar mejor</span>.
            </h2>
          </Reveal>
        </div>
      </section>

      {/* 3. Promesa + herramientas */}
      <section className="section section--ivory" data-screen-label="IA · Promesa">
        <div className="shell brand-problem">
          <Eyebrow num="02">La promesa</Eyebrow>
          <Reveal>
            <h2 className="brand-promise-h" style={{ marginTop: 8 }}>
              Sistemas digitales que trabajan por ti.
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="brand-lead" style={{ marginTop: 18 }}>
              Diseñamos automatizaciones e integraciones con IA sobre las herramientas
              que ya usas. Captación, atención, seguimiento y reportes que funcionan
              solos — con criterio, sin convertir tu marca en una empresa fría de
              software.
            </p>
          </Reveal>
          <Reveal delay={140}>
            <div className="intro-tags" style={{ marginTop: 22 }}>
              {TOOLS.map((t) => <Pill key={t} dot>{t}</Pill>)}
            </div>
          </Reveal>
        </div>
      </section>

      {/* 4. Qué incluye */}
      <section id="incluye" className="section" data-screen-label="IA · Incluye">
        <div className="shell">
          <Eyebrow num="03">¿Qué incluye la Automatización con IA?</Eyebrow>
          <div className="services-head">
            <Reveal>
              <h2 className="services-h">
                Integraciones inteligentes.<br />
                <span className="b">No bots genéricos<span style={{ color: ACCENT }}>.</span></span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "var(--fg-2)", maxWidth: 460, margin: 0 }}>
                Pasa el cursor o toca cada tarjeta para ver el detalle de cada
                integración.
              </p>
            </Reveal>
          </div>
          <FeatureCards cards={CARDS} />
        </div>
      </section>

      {/* 5. Casos de uso */}
      <section className="section section--carbon" data-screen-label="IA · Casos de uso">
        <div className="shell">
          <Eyebrow num="04">Casos de uso reales</Eyebrow>
          <div className="services-head">
            <Reveal>
              <h2 className="services-h" style={{ color: "var(--upz-off-white)" }}>
                Lo que tu negocio<br />
                <span className="b">puede automatizar<span style={{ color: ACCENT }}>.</span></span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "rgba(250,251,245,.72)", maxWidth: 460, margin: 0 }}>
                Empieza por lo que más tiempo te quita y escala por módulos.
              </p>
            </Reveal>
          </div>
          <div className="mkt-points">
            {USES.map((u, i) => (
              <Reveal key={i} delay={i * 50}>
                <div className="mkt-point"><span className="mkt-point-arr">↗</span><span>{u}</span></div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Proceso */}
      <section className="section section--ivory" data-screen-label="IA · Proceso">
        <div className="shell">
          <Eyebrow num="05">Proceso</Eyebrow>
          <Reveal>
            <h2 className="services-h" style={{ marginBottom: 36 }}>
              Simple de empezar,<br />
              <span className="b">listo para escalar<span style={{ color: ACCENT }}>.</span></span>
            </h2>
          </Reveal>
          <div className="nos-steps">
            {PROCESS.map((s, i) => (
              <Reveal key={s.num} delay={i * 70}>
                <div className="nos-step">
                  <span className="nos-step-num">{s.num}</span>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Marquee
        variant="carbon"
        items={["Atención 24/7", "Menos fricción", "n8n · Make", "Chatbots IA", "Más conversión", "Procesos que se mueven solos"]}
      />

      {/* 7. Cierre */}
      <section className="brand-closing" data-screen-label="IA · Cierre">
        <div className="shell">
          <Sticker tone="lime" angle={-3}>IA con dirección, no por moda</Sticker>
          <Reveal>
            <h2 className="brand-closing-h">
              Automatiza procesos. <span className="mark">Sin perder identidad</span>.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="brand-closing-copy">
              Para marcas que quieren funcionar mejor: atención que no duerme,
              procesos que fluyen y un equipo libre para crecer.
            </p>
            <Link href="/#contact" className="btn btn-lime btn-lg">Quiero automatizar <span className="arr">↗</span></Link>
            <Link href="/#ia" className="btn btn-light btn-lg">Ver la capa IA <span className="arr">↗</span></Link>
          </Reveal>
        </div>
      </section>

      <ServiceNav current="automatizacion-ia" />
      <Footer />
    </div>
  );
}
