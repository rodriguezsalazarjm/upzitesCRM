/* =====================================================================
   UPZITES — Page sections
   ===================================================================== */

// ---------- Top nav -------------------------------------------------
function TopNav() {
  return (
    <header className="nav-bar" data-screen-label="Top nav">
      <div className="shell nav-inner">
        <Brand />
        <nav className="nav-links">
          <a href="#auditoria">Auditoría</a>
          <a href="#services">Servicios</a>
          <a href="#agenda">Agenda</a>
          <a href="#projects">Proyectos</a>
          <a href="#process">Proceso</a>
          <a href="#contact">Contacto</a>
        </nav>
        <div className="nav-spacer"></div>
        <span className="nav-meta">MIA · LA · CCS</span>
        <a href="#contact" className="btn btn-primary btn-sm">
          Hablemos <span className="arr">↗</span>
        </a>
      </div>
    </header>
  );
}

// ---------- HERO ----------------------------------------------------
function Hero() {
  return (
    <section className="hero grain" id="top" data-screen-label="01 Hero">
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
            <a href="#projects" className="btn btn-ivory btn-lg">Ver Portfolio <span className="arr">↗</span></a>
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
function Marquee({ items, variant }) {
  const list = items || ["Branding estratégico", "Diseño web de alto rendimiento", "E-commerce", "UX/UI Design", "Marketing digital", "SEO · SEM · GEO", "Desarrollo de apps", "Edición de video"];
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

// ---------- 02 INTRO / POSITIONING ---------------------------------
function Intro() {
  return (
    <section className="section section--tight" data-screen-label="02 Intro">
      <div className="shell">
        <Eyebrow num="02">Quiénes somos · Posicionamiento</Eyebrow>
        <div className="intro-grid">
          <Reveal>
            <h2 className="intro-h">
              Conectamos<br />
              <span className="hl">con la marca</span><br />
              a través de la<br />
              <span className="em">creatividad</span>.
            </h2>
          </Reveal>

          <Reveal delay={120}>
            <div className="intro-body">
              <p>
                UPZITES es un estudio creativo digital especializado en
                <strong> branding, diseño web y desarrollo</strong>. Transformamos
                ideas en marcas sólidas, sitios funcionales y contenido visual
                con impacto real.
              </p>
              <p>
                Trabajamos con emprendedores, empresas y creadores que buscan
                una identidad profesional y una presencia digital moderna.
                Estrategia, diseño y optimización SEO para que tu marca no
                solo se vea bien, sino que también venda.
              </p>
              <div className="intro-tags">
                <Pill dot>Estrategia 360°</Pill>
                <Pill dot>Obsesión por el ROI</Pill>
                <Pill dot>Alto rendimiento</Pill>
                <Pill dot>SEO sostenible</Pill>
                <Pill dot>Especialización profunda</Pill>
                <Pill dot>Propiedad total</Pill>
              </div>

              <div className="intro-meta">
                <div>
                  <div className="intro-meta-num">+100</div>
                  <div className="intro-meta-lbl">Clientes felices en LATAM</div>
                </div>
                <div>
                  <div className="intro-meta-num">+50</div>
                  <div className="intro-meta-lbl">Proyectos terminados</div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ---------- 03 SERVICES --------------------------------------------
const SERVICES = [
  {
    num: "01", total: "08",
    title: "Branding estratégico",
    body: "Construimos marcas sólidas con narrativa, sistema y dirección. Logotipo, paleta, tipografía y manual. Identidad que vende.",
    tags: ["Logotipo", "Sistema visual", "Manual"],
  },
  {
    num: "02", total: "08",
    title: "Diseño web",
    body: "Sitios modernos, rápidos y funcionales. Diseño de alto rendimiento, copy estratégico y CMS que tu equipo puede usar.",
    tags: ["Marketing site", "Landing", "CMS"],
  },
  {
    num: "03", total: "08",
    title: "E-commerce",
    body: "Tiendas online diseñadas para convertir tráfico en ventas reales. WooCommerce, Shopify, pasarelas y logística configurada.",
    tags: ["Shopify", "WooCommerce", "Conversión"],
  },
  {
    num: "04", total: "08",
    title: "UX / UI design",
    body: "Investigación, arquitectura, flujos e interfaz. Productos digitales claros, premium y orientados a métricas reales.",
    tags: ["Research", "Flujos", "Interfaz"],
  },
  {
    num: "05", total: "08",
    title: "Marketing digital",
    body: "Estrategia de contenido, social ads y embudos. Convertimos seguidores en clientes con criterio editorial y data.",
    tags: ["Ads", "Contenido", "Funnels"],
  },
  {
    num: "06", total: "08",
    title: "SEO · SEM · GEO",
    body: "Posicionamiento sostenible a largo plazo. Auditorías técnicas, contenido optimizado y campañas en buscadores con ROI.",
    tags: ["SEO", "Google Ads", "GEO"],
  },
  {
    num: "07", total: "08",
    title: "Desarrollo de apps",
    body: "Aplicaciones móviles y plataformas a medida. iOS, Android y web. Producto, diseño e ingeniería en un solo equipo.",
    tags: ["iOS", "Android", "Web app"],
  },
  {
    num: "08", total: "08",
    title: "Edición de video",
    body: "Contenido audiovisual con criterio de marca. Reels, anuncios, motion y vídeo corporativo listos para tus canales.",
    tags: ["Reels", "Motion", "Anuncios"],
  },
];

function Services() {
  return (
    <section id="services" className="section" data-screen-label="03 Services">
      <div className="shell">
        <Eyebrow num="03">Servicios · Lo que hacemos</Eyebrow>
        <div className="services-head">
          <Reveal>
            <h2 className="services-h">
              Diseño con intención.<br />
              <span className="b">Presencia con actitud<span style={{ color: "var(--upz-tomato)" }}>.</span></span>
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "var(--fg-2)", maxWidth: 460, margin: 0 }}>
              Seis frentes estratégicos. Un solo sistema. Trabajamos como
              un equipo interno embebido, no como una agencia que entrega
              archivos y desaparece.
            </p>
          </Reveal>
        </div>

        <div className="services-grid">
          {SERVICES.map((s, i) => (
            <Reveal key={s.num} delay={i * 60}>
              <article className="service-card">
                <div className="service-num">
                  <span>{s.num} / {s.total}</span>
                  <span>Servicio</span>
                </div>
                <h3 className="service-card-title">{s.title}</h3>
                <p className="service-card-body">{s.body}</p>
                <div className="service-card-tags">
                  {s.tags.map((t) => <span key={t}>{t}</span>)}
                </div>
                <div className="service-card-foot">
                  <span className="service-card-foot-label">Ver detalle</span>
                  <span className="service-card-arr">↗</span>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- 04 PROJECTS --------------------------------------------
const PROJECTS = [
  {
    name: "Valle Smash",
    cat: "Identidad retro · Pop art",
    year: "2025",
    bg: "#FF3B30", fg: "#FAFBF5",
    layout: "span-7 wide",
    filter: "Branding",
    blurb: "Identidad inspirada en los diners americanos y el pop art",
  },
  {
    name: "Gloobitos",
    cat: "Identidad emocional",
    year: "2025",
    bg: "#FF5CAB", fg: "#111111",
    layout: "span-5 wide",
    filter: "Branding",
    blurb: "Marca tierna y emocional, diseñada para el afecto",
  },
  {
    name: "Reyes Protec",
    cat: "Protección automotriz",
    year: "2025",
    bg: "#FFD100", fg: "#111111",
    layout: "span-4 tall",
    filter: "Branding",
    blurb: "Identidad para el sector de protección automotriz",
  },
  {
    name: "TechServ",
    cat: "Tecnología · B2B",
    year: "2024",
    bg: "#001B2A", fg: "#A6FF00",
    layout: "span-4 tall",
    filter: "Branding",
    blurb: "Marca minimalista, tecnológica y profesional",
  },
  {
    name: "Profile",
    cat: "Web empresarial",
    year: "2024",
    bg: "#F4F1E8", fg: "#111111",
    layout: "span-4 tall",
    filter: "Web",
    blurb: "Liderazgo, experiencia y resultados medibles",
  },
  {
    name: "V&R Automotriz",
    cat: "Branding automotriz",
    year: "2024",
    bg: "#0057FF", fg: "#FAFBF5",
    layout: "span-8 short",
    filter: "Branding",
    blurb: "Una identidad profesional que representa libertad",
  },
  {
    name: "Archivo",
    cat: "Ver el resto del trabajo",
    year: "2025",
    bg: "#111111", fg: "#FAFBF5",
    layout: "span-4 short",
    filter: "Web",
    blurb: "Más de 50 proyectos terminados · ver archivo completo",
    isArchive: true,
  },
];

const FILTERS = ["Todos", "Branding", "Web"];

function Projects() {
  const [active, setActive] = useState("Todos");
  const list = active === "Todos" ? PROJECTS : PROJECTS.filter((p) => p.filter === active);

  return (
    <section id="projects" className="section section--ivory" data-screen-label="04 Projects">
      <div className="shell">
        <Eyebrow num="04">Proyectos destacados · Selected work</Eyebrow>
        <div className="projects-head">
          <Reveal>
            <h2>
              Marcas que ya<br />
              no se ven<br />
              <span className="em">como antes</span><span style={{ color: "var(--upz-electric)" }}>.</span>
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-end" }}>
              <div className="projects-filter">
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    className={`filter-pill${active === f ? " is-active" : ""}`}
                    onClick={() => setActive(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <a href="#" className="btn btn-ivory">Ver archivo completo <span className="arr">↗</span></a>
            </div>
          </Reveal>
        </div>

        <div className="projects-grid">
          {list.map((p, i) => (
            <Reveal key={p.name} delay={i * 50}>
              <article className={`project-card ${p.layout}`}>
                <div className="project-img" style={{ background: p.bg, color: p.fg }}>
                  <div className="project-img-meta">
                    <span className="tag">{p.filter}</span>
                    <span className="tag">{p.year}</span>
                  </div>
                  <span className="project-img-word">{p.name}</span>
                  <span className="project-img-stamp" style={{ color: p.fg }}>{p.isArchive ? "+50 CASOS · ARCHIVO" : `CASO · 00${i+1}`}</span>
                </div>
                <div className="project-meta">
                  <div>
                    <div className="project-name">{p.name}</div>
                    <div className="project-cat">{p.cat}</div>
                  </div>
                  <span className="project-card-arr">↗</span>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
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

function Process() {
  return (
    <section id="process" className="section section--carbon" data-screen-label="05 Process">
      <div className="shell">
        <Eyebrow num="05">Proceso · Workflow estratégico</Eyebrow>
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
function Stats() {
  const stats = [
    { num: "+120", lbl: "Marcas posicionadas", sub: "Desde 2017" },
    { num: <>2.4<span className="em">×</span></>, lbl: "Conversión promedio", sub: "Post-rebrand" },
    { num: "03", lbl: "Bases creativas", sub: "MIA · LA · CCS" },
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

function Testimonials() {
  return (
    <section id="testimonios" className="section section--ivory" data-screen-label="06 Testimonials">
      <div className="shell">
        <Eyebrow num="06">Testimonios · Clientes</Eyebrow>
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
function BigCTA() {
  const [state, setState] = useState({ name: "", email: "", brand: "", scope: "Branding estratégico", brief: "" });
  const [sent, setSent] = useState(false);
  function update(k, v) { setState((s) => ({ ...s, [k]: v })); }
  function submit(e) {
    e.preventDefault();
    // TODO: wire to contacto@upzites.com via real backend (Antigravity)
    setSent(true);
  }

  return (
    <section id="contact" className="bigcta" data-screen-label="07 Big CTA">
      <div className="shell">
        <div className="bigcta-stamp">↗</div>
        <div className="bigcta-eyebrow">
          <span>09 · Hablemos</span>
          <span className="rule"></span>
          <span>UPZ / 2026 · contacto@upzites.com</span>
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
                <div className="meta-row"><span className="b">●</span> Miami · Los Angeles · Caracas</div>
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
                  <textarea id="cta-brief" value={state.brief} onChange={(e) => update("brief", e.target.value)} rows="3" placeholder="Contexto, objetivos, fechas, presupuesto aproximado…" />
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
function Footer() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  function submit(e) { e.preventDefault(); if (email) setDone(true); }

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
            <a href="#services">Branding</a>
            <a href="#services">UX / UI</a>
            <a href="#services">Web</a>
            <a href="#services">E-commerce</a>
            <a href="#services">Dirección creativa</a>
          </div>

          <div className="footer-col">
            <h4>Síguenos</h4>
            <a href="#">Instagram ↗</a>
            <a href="#">Behance ↗</a>
            <a href="#">LinkedIn ↗</a>
            <a href="#">Are.na ↗</a>
            <a href="mailto:hola@upzites.com">hola@upzites.com</a>
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

        <div className="footer-bigword">
          upzites<span className="arr">↗</span>
        </div>

        <div className="footer-foot">
          <span className="footer-cities">
            <span className="b">●</span> Miami · Los Angeles · Venezuela
          </span>
          <span className="footer-meta">UPZ · 2026 · 0001 · Diseño estratégico con carácter</span>
          <a href="#top" className="footer-toplink">Volver arriba <span className="arr">↗</span></a>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, {
  TopNav, Hero, Marquee, Intro, Services, Projects, Process, Stats,
  Testimonials, BigCTA, Footer,
});
