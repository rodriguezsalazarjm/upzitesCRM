"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Brand, Eyebrow, Reveal, Pill, Stamp, Sticker, Barcode } from "./Atoms";
import { SERVICES } from "@/lib/services";
import { HeroBackground } from "./HeroBackground";
import { CountUp } from "./CountUp";
import { ProjectsGallery } from "./ProjectsGallery";
import { SocialLinks, UPZITES_SOCIALS } from "./SocialIcons";

// ---------- Top nav -------------------------------------------------
export function TopNav() {
  return (
    <header className="nav-bar" data-screen-label="Top nav">
      <div className="shell nav-inner">
        <Brand />
        <nav className="nav-links">
          <div className="nav-dropdown">
            <Link href="/servicios" className="nav-dropdown-trigger">
              Servicios <span className="nav-caret" aria-hidden="true">▾</span>
            </Link>
            <div className="nav-menu" role="menu">
              {SERVICES.map((s) => (
                <Link key={s.slug} href={`/servicios/${s.slug}`} role="menuitem">
                  {s.title}
                </Link>
              ))}
              <Link href="/servicios" className="nav-menu-all" role="menuitem">
                Ver todos <span className="arr">↗</span>
              </Link>
            </div>
          </div>
          <Link href="/#auditoria">Auditoría</Link>
          <Link href="/nosotros">Nosotros</Link>
          <Link href="/#agenda">Agenda</Link>
          <Link href="/#projects">Proyectos</Link>
          <Link href="/#process">Proceso</Link>
          <Link href="/#contact">Contacto</Link>
        </nav>
        <div className="nav-spacer"></div>
        <span className="nav-meta">SANTIAGO · CHILE</span>
        <SocialLinks links={UPZITES_SOCIALS} className="nav-socials" />
        <Link href="/#contact" className="btn btn-primary btn-sm">
          Hablemos <span className="arr">↗</span>
        </Link>
      </div>
    </header>
  );
}

// ---------- HERO ----------------------------------------------------
export function Hero() {
  return (
    <section className="hero grain" id="top" data-screen-label="01 Hero">
      <HeroBackground />
      <div className="shell" style={{ position: "relative" }}>
        <div className="hero-runner">
          <span>UPZ · 0001 · TROPICAL UNDERGROUND<span className="dot"></span>SANTIAGO DE CHILE</span>
          <span>+56 9 7317 8796 <span className="dot"></span> CONTACTO@UPZITES.COM</span>
        </div>

        <Stamp text="UPZITES · TROPICAL UNDERGROUND · STUDIO · " bg="var(--upz-electric)" color="var(--upz-off-white)" />

        <h1 className="hero-title">
          Acelera<br />
          el <span className="hl">crecimiento</span><br />
          de tu <span className="red">marca</span><span className="dot">.</span>
        </h1>

        <div className="hero-foot">
          <p className="hero-sub">
            Más que una agencia, somos tu equipo digital. Unimos branding
            estratégico y desarrollo web de alto rendimiento para posicionar
            tu negocio. Diseño con sangre, sistema y dirección.
          </p>
          <div className="hero-actions">
            <a href="#contact" className="btn btn-dark btn-lg">Contacto <span className="arr">↗</span></a>
            <a href="#projects" className="btn btn-ivory btn-lg">Ver proyectos <span className="arr">↗</span></a>
          </div>
          <div className="hero-tags">
            <div className="hero-tag-row">
              <Pill dot>Branding</Pill>
              <Pill dot>UX/UI</Pill>
            </div>
            <div className="hero-tag-row">
              <Pill dot>Estrategia</Pill>
              <Pill dot>Web que vende</Pill>
            </div>
            <div className="hero-tag-row">
              <Pill solid>Tropical Underground</Pill>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Top marquee --------------------------------------------
export function Marquee({ items, variant }: { items?: string[], variant?: "carbon" }) {
  const list = items || ["Branding estratégico", "Diseño web de alto rendimiento", "E-commerce", "Marketing digital integral", "Apps móviles", "SEO integrado", "UX/UI Design", "Contenido & Ads"];
  const loop = [...list, ...list];
  return (
    <div className={`marquee${variant === "carbon" ? " marquee--carbon" : ""}`} data-screen-label="Marquee">
      <div className="marquee-track">
        {loop.map((t, i) => (
          <React.Fragment key={i}>
            <span>{t}</span>
            <span className="dot">●</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ---------- 03 SERVICES --------------------------------------------
export function Services() {
  const total = `0${SERVICES.length}`;
  return (
    <section id="services" className="section" data-screen-label="03 Services">
      <div className="shell">
        <Eyebrow num="01">Servicios · Lo que hacemos</Eyebrow>
        <div className="services-head">
          <Reveal>
            <h2 className="services-h">
              Diseño con intención.<br />
              <span className="b">Presencia con actitud<span style={{ color: "var(--upz-tomato)" }}>.</span></span>
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "var(--fg-2)", maxWidth: 460, margin: 0 }}>
              Cinco frentes estratégicos. Un solo sistema. Trabajamos como
              un equipo interno embebido, no como una agencia que entrega
              archivos y desaparece.
            </p>
          </Reveal>
        </div>

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
  );
}

// ---------- 04 PROJECTS --------------------------------------------
export function Projects() {
  return (
    <section id="projects" className="section section--ivory" data-screen-label="04 Projects">
      <div className="shell">
        <Eyebrow num="04">Proyectos · Selected work</Eyebrow>
        <div className="projects-head">
          <Reveal variant="left">
            <h2>
              Marcas que ya<br />
              no se ven<br />
              <span className="em">como antes</span><span style={{ color: "var(--upz-electric)" }}>.</span>
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "var(--fg-2)", maxWidth: 440, margin: 0 }}>
              Branding e identidad, y las webs que hemos construido. Abre cada
              proyecto para ver la galería o una vista previa en vivo del sitio.
            </p>
          </Reveal>
        </div>

        <ProjectsGallery />
      </div>
    </section>
  );
}

// ---------- 05 PROCESS ---------------------------------------------
const STEPS = [
  {
    num: "01", title: "Estrategia",
    body: "Auditamos marca, mercado y oferta. Definimos posicionamiento, audiencia y narrativa. La base no es estética — es comercial.",
    deliverables: ["Brand audit", "Posicionamiento", "Roadmap"],
  },
  {
    num: "02", title: "Identidad",
    body: "Sistema visual completo: logotipo, tipografía, color, voz, fotografía. Manuales que sirven para construir, no para colgar.",
    deliverables: ["Logotipo", "Sistema visual", "Manual"],
  },
  {
    num: "03", title: "Experiencia digital",
    body: "Diseñamos producto, web y e-commerce alineados con la marca. UX/UI premium, copywriting estratégico, conversión real.",
    deliverables: ["UX/UI", "Web", "E-commerce"],
  },
  {
    num: "04", title: "Lanzamiento",
    body: "Acompañamos rollout, campañas y métricas. La marca arranca con peso, dirección y un sistema que escala con el negocio.",
    deliverables: ["Launch kit", "Campañas", "Métricas"],
  },
];

export function Process() {
  return (
    <section id="process" className="section section--carbon" data-screen-label="05 Process">
      <div className="shell">
        <Eyebrow num="06">Proceso · Workflow estratégico</Eyebrow>
        <div className="process-head">
          <Reveal>
            <h2 className="process-h">
              Cuatro fases.<br />
              <span className="b">Un sistema completo<span style={{ color: "var(--upz-tomato)" }}>.</span></span>
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "rgba(250,251,245,.72)", maxWidth: 460, margin: 0 }}>
              No vendemos plantillas. Cada proyecto pasa por las cuatro fases —
              estrategia, identidad, experiencia digital y lanzamiento — con
              entregables claros y métricas reales.
            </p>
          </Reveal>
        </div>

        <div className="process-grid">
          {STEPS.map((s, i) => (
            <Reveal key={s.num} delay={i * 80}>
              <div className="process-row">
                <span className="process-row-num">{s.num}</span>
                <h3 className="process-row-title">{s.title}</h3>
                <p className="process-row-body">{s.body}</p>
                <div className="process-row-deliverables">
                  {s.deliverables.map((d) => <span key={d}>{d}</span>)}
                </div>
                <span className="process-row-arr">↗</span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- Stat band ----------------------------------------------
export function Stats() {
  const stats = [
    { num: "+120", lbl: "Marcas posicionadas", sub: "Desde 2017" },
    { num: <>2.4<span className="em">×</span></>, lbl: "Conversión promedio", sub: "Post-rebrand" },
    { num: <CountUp to={150} prefix="+" />, lbl: "Webs creadas", sub: "En Chile" },
    { num: "48H", lbl: "Tiempo de respuesta", sub: "A cada brief" },
  ];
  return (
    <section data-screen-label="Stats" style={{ background: "var(--bg-1)", padding: "16px 0 48px" }}>
      <div className="shell">
        <div className="stat-band">
          {stats.map((s, i) => (
            <div className="stat" key={i}>
              <span className="stat-num">{s.num}</span>
              <span className="stat-lbl">{s.lbl}</span>
              <span className="stat-sub">{s.sub}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- 06 TESTIMONIALS ----------------------------------------
const TESTIMONIALS = [
  {
    quote: <>"UPZITES no nos hizo un logo. Nos rediseñó la <span className="hl">estrategia entera</span>. Ahora la marca dirige las decisiones del negocio."</>,
    name: "Camila Reyes", role: "Founder · Núa Skincare",
    init: "CR", color: "#FF5CAB",
    featured: true,
  },
  {
    quote: <>"La web que entregaron es la pieza comercial más fuerte que tenemos. <span className="hl">2.4× conversión</span> en el primer trimestre."</>,
    name: "Diego Salas", role: "CEO · Barrio",
    init: "DS", color: "#A6FF00",
  },
  {
    quote: <>"Trabajan como equipo interno, no como agencia. Tienen criterio, ritmo y velocidad. Difícil de encontrar."</>,
    name: "Andrea Pino", role: "Brand Lead · Calor Coffee",
    init: "AP", color: "#FFD100",
  },
  {
    quote: <>"Lo que UPZITES hace es <span className="hl">dirección creativa real</span>. Defienden las ideas que importan y matan las que no."</>,
    name: "Mateo López", role: "Director · Verbo Magazine",
    init: "ML", color: "#0057FF",
  },
  {
    quote: <>"El sistema visual que construyeron sigue vivo tres años después. Escalable, reconocible, premium. Eso vale."</>,
    name: "Sofía Marín", role: "CMO · Sereno Hotels",
    init: "SM", color: "#FF3B30",
  },
  {
    quote: <>"Latinos pensando global. Hablan español, entienden Miami, diseñan para competir afuera. Mi mejor inversión del año."</>,
    name: "Luis Vargas", role: "Founder · Nomada",
    init: "LV", color: "#FFBA00",
  },
];

export function Testimonials() {
  return (
    <section id="testimonios" className="section section--ivory" data-screen-label="06 Testimonials">
      <div className="shell">
        <Eyebrow num="07">Testimonios · Clientes</Eyebrow>
        <div className="testimonials-head">
          <Reveal>
            <h2 className="testimonials-h">
              Marcas que <span className="b">crecieron</span><br />
              con criterio.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <Sticker tone="lime" angle={-3}>5.0 · 47 reviews</Sticker>
              <Sticker tone="yellow" angle={2}>Audit gratis</Sticker>
            </div>
          </Reveal>
        </div>

        <div className="testimonial-grid">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={i} delay={i * 60}>
              <figure className={`testimonial-card${t.featured ? " is-featured" : ""}`}>
                <span className="testimonial-mark">"</span>
                <blockquote className="testimonial-quote">{t.quote}</blockquote>
                <div className="testimonial-foot">
                  <span className="testimonial-avatar" style={{ background: t.color, color: "var(--upz-carbon)" }}>{t.init}</span>
                  <div className="testimonial-meta">
                    <div className="testimonial-name">{t.name}</div>
                    <div className="testimonial-role">{t.role}</div>
                  </div>
                  <span className="testimonial-stars">★★★★★</span>
                </div>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- 07 BIG CTA ---------------------------------------------
export function BigCTA() {
  const [state, setState] = useState({ name: "", email: "", brand: "", scope: "Branding estratégico", brief: "" });
  const [sent, setSent] = useState(false);
  function update(k: string, v: string) { setState((s) => ({ ...s, [k]: v })); }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const subject = encodeURIComponent(`Brief UPZITES — ${state.brand || state.name || "Nuevo proyecto"}`);
    const body = encodeURIComponent(
      `Nombre: ${state.name}\nEmail: ${state.email}\nMarca / proyecto: ${state.brand}\nQué necesita: ${state.scope}\n\n${state.brief}`
    );
    window.location.href = `mailto:contacto@upzites.com?subject=${subject}&body=${body}`;
    setSent(true);
  }

  return (
    <section id="contact" className="bigcta" data-screen-label="07 Big CTA">
      <div className="shell">
        <div className="bigcta-stamp">↗</div>
        <div className="bigcta-eyebrow">
          <span>08 · Hablemos</span>
          <span className="rule"></span>
          <span>UPZ / {new Date().getFullYear()} · contacto@upzites.com</span>
        </div>

        <Reveal>
          <h2 className="bigcta-h">
            Tu marca<br />
            no necesita<br />
            <span className="strike">más ruido</span>.<br />
            necesita<br />
            <span className="hl">dirección</span><span className="em">.</span>
          </h2>
        </Reveal>

        <div className="bigcta-form-wrap">
          <Reveal>
            <div className="bigcta-form-intro">
              <p>
                Cuéntanos qué quieres construir. Auditamos tu marca, definimos la
                dirección y diseñamos el sistema. Respondemos en 48h hábiles —
                sin formularios eternos, sin agencia-speak.
              </p>
              <div className="meta">
                <div className="meta-row"><span className="b">●</span> contacto@upzites.com</div>
                <div className="meta-row"><span className="b">●</span> Santiago de Chile</div>
                <div className="meta-row"><span className="b">●</span> Lun–Vie · 09:00 – 18:00 GMT-4</div>
                <div className="meta-row"><span className="b">●</span> Respuesta en 48h hábiles</div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={120}>
            {sent ? (
              <div className="bigcta-confirm">
                <span className="check">↗</span>
                <div>
                  <strong>Recibido · {state.name || "Tu brief está en camino"}</strong>
                  <p>
                    Acabamos de enviar tu brief a <strong>contacto@upzites.com</strong>.
                    Te respondemos en menos de 48h hábiles con propuesta y próximos pasos.
                  </p>
                </div>
              </div>
            ) : (
              <form className="bigcta-form" onSubmit={submit}>
                <div className="field">
                  <label htmlFor="cta-name">Nombre</label>
                  <input id="cta-name" value={state.name} onChange={(e) => update("name", e.target.value)} placeholder="Tu nombre" required />
                </div>
                <div className="field">
                  <label htmlFor="cta-email">Email</label>
                  <input id="cta-email" type="email" value={state.email} onChange={(e) => update("email", e.target.value)} placeholder="tu@marca.com" required />
                </div>
                <div className="field">
                  <label htmlFor="cta-brand">Marca / proyecto</label>
                  <input id="cta-brand" value={state.brand} onChange={(e) => update("brand", e.target.value)} placeholder="Nombre del proyecto" />
                </div>
                <div className="field">
                  <label htmlFor="cta-scope">Qué necesitas</label>
                  <select id="cta-scope" value={state.scope} onChange={(e) => update("scope", e.target.value)}>
                    <option>Branding estratégico</option>
                    <option>Web de alto rendimiento</option>
                    <option>E-commerce</option>
                    <option>UX / UI</option>
                    <option>Dirección creativa</option>
                    <option>Auditoría de marca</option>
                    <option>Otro · Conversemos</option>
                  </select>
                </div>
                <div className="field field-full">
                  <label htmlFor="cta-brief">Cuéntanos del proyecto</label>
                  <textarea id="cta-brief" value={state.brief} onChange={(e) => update("brief", e.target.value)} rows={3} placeholder="Contexto, objetivos, fechas, presupuesto aproximado…" />
                </div>
                <div className="bigcta-form-submit">
                  <button type="submit" className="btn btn-lime btn-lg">
                    Enviar brief a contacto@upzites.com <span className="arr">↗</span>
                  </button>
                  <small>Al enviar aceptas que respondamos por correo. Cero spam.</small>
                </div>
              </form>
            )}
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ---------- 08 FOOTER ----------------------------------------------
export function Footer() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  function submit(e: React.FormEvent) { e.preventDefault(); if (email) setDone(true); }

  return (
    <footer className="footer" data-screen-label="08 Footer">
      <div className="shell">
        <div className="footer-grid">
          <div className="footer-brand">
            <Brand size="lg" />
            <p className="footer-tagline">
              Diseño estratégico con carácter tropical underground. Branding,
              UX/UI y desarrollo web para marcas ambiciosas.
            </p>
            <Barcode />
          </div>

          <div className="footer-col">
            <h4>Estudio</h4>
            <a href="#">Sobre UPZITES</a>
            <a href="#process">Proceso</a>
            <a href="#projects">Clientes</a>
            <a href="#">Prensa</a>
            <a href="#">Manifiesto</a>
          </div>

          <div className="footer-col">
            <h4>Servicios</h4>
            <Link href="/servicios/branding">Branding</Link>
            <Link href="/servicios/diseno-web">Diseño web</Link>
            <Link href="/servicios/ecommerce">E-commerce</Link>
            <Link href="/servicios/marketing-digital">Marketing digital</Link>
            <Link href="/servicios/apps-moviles">Apps móviles</Link>
          </div>

          <div className="footer-col">
            <h4>Síguenos</h4>
            <SocialLinks links={UPZITES_SOCIALS} className="footer-socials" />
            <a href="mailto:contacto@upzites.com" style={{ marginTop: 14 }}>contacto@upzites.com</a>
          </div>

          <div className="footer-col">
            <h4>Newsletter · Tropical Underground</h4>
            {done ? (
              <p style={{ fontFamily: "var(--font-text)", fontSize: 14, color: "var(--upz-carbon)", margin: 0 }}>
                Recibido. <span style={{ color: "var(--upz-electric)" }}>↗</span> Pronto en tu inbox.
              </p>
            ) : (
              <form className="newsletter" onSubmit={submit}>
                <div className="newsletter-row">
                  <input
                    type="email" placeholder="tu@email.com"
                    value={email} onChange={(e) => setEmail(e.target.value)} required
                  />
                  <button type="submit" aria-label="Suscribirme">↗</button>
                </div>
                <span className="newsletter-note">Una vez al mes · Sin spam · Cancelas cuando quieras</span>
              </form>
            )}
          </div>
        </div>

        <div className="footer-bigword footer-bigword--logo">
          <img src="/images/studio-desing.png" alt="Studio Desing" />
        </div>

        <div className="footer-foot">
          <span className="footer-cities">
            <span className="b">●</span> Santiago de Chile
          </span>
          <span className="footer-meta">UPZ · {new Date().getFullYear()} · 0001 · Diseño estratégico con carácter</span>
          <a href="#top" className="footer-toplink">Volver arriba <span className="arr">↗</span></a>
        </div>
      </div>
    </footer>
  );
}
