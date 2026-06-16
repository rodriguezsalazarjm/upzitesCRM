import type { CSSProperties } from "react";
import Link from "next/link";
import { TopNav, Footer } from "@/components/Sections";
import { Eyebrow, Reveal, Sticker, Pill } from "@/components/Atoms";
import { ViewContentOnLoad } from "@/components/MetaPixelEvents";
import { FeatureCards, type FeatureCard } from "@/components/FeatureCards";
import { SocialLinks, JOSE_SOCIALS, JILLY_SOCIALS } from "@/components/SocialIcons";

export const metadata = {
  title: "Quiénes somos — UPZITES",
  description:
    "Estudio de estrategia digital, branding y UX/UI para marcas que quieren verse más fuertes, claras y competitivas. Desde Santiago de Chile, con raíces caraqueñas.",
};

const ACCENT = "var(--upz-electric)";

const QUE_SOMOS = [
  { t: "Somos estrategia", d: "Antes de diseñar, entendemos el negocio, la audiencia, el mercado y la percepción que la marca necesita construir." },
  { t: "Somos sistema", d: "Creamos identidades, sitios web, piezas digitales y experiencias visuales que funcionan juntas, no como elementos sueltos." },
  { t: "Somos carácter", d: "Construimos marcas con personalidad real: claras, visualmente fuertes, memorables y listas para competir." },
];

const NO_SOMOS = [
  "Menos plantilla. Más personalidad.",
  "Menos ruido. Más dirección.",
  "Menos diseño decorativo. Más intención.",
  "Menos genérico. Más marca.",
];

const CARDS: FeatureCard[] = [
  { num: "01", title: "Claridad", visible: "Una marca debe entenderse rápido.", detail: "Ordenamos mensajes, jerarquías visuales y puntos de contacto para que tu audiencia entienda quién eres, qué haces y por qué debería elegirte.", micro: "La claridad vende." },
  { num: "02", title: "Carácter", visible: "Una marca sin personalidad se olvida.", detail: "Diseñamos identidades con energía, tono, color, tipografía y una presencia visual capaz de diferenciarse en mercados saturados.", micro: "Si no se siente distinta, desaparece." },
  { num: "03", title: "Sistema", visible: "El diseño debe funcionar más allá del logo.", detail: "Creamos sistemas visuales que viven en web, redes, presentaciones, campañas, productos, servicios y experiencias digitales.", micro: "Una marca fuerte no improvisa." },
  { num: "04", title: "Cultura", visible: "Diseñamos conectados con el mundo real.", detail: "Nuestra estética bebe de la calle, la música, el comercio, el diseño independiente, la cultura latina, la tecnología y la comunicación contemporánea.", micro: "Diseño con sangre visual." },
  { num: "05", title: "Conversión", visible: "La presencia también debe trabajar.", detail: "Cada web, campaña o identidad debe ayudar a comunicar mejor, generar confianza y mover al usuario hacia una acción.", micro: "Verse bien no basta." },
  { num: "06", title: "Precisión", visible: "La actitud también necesita control.", detail: "Nos gusta el color, la fuerza gráfica y la energía visual, pero siempre con estructura, jerarquía y dirección estratégica.", micro: "Bold, pero con criterio." },
];

const PARA_QUIEN = [
  "Marcas que necesitan una identidad más fuerte.",
  "Empresas que quieren rediseñar su presencia digital.",
  "Negocios que se ven genéricos frente a su competencia.",
  "Startups o proyectos que necesitan verse confiables.",
  "Marcas que quieren una web más clara, moderna y comercial.",
  "Equipos que entienden que el diseño también es estrategia.",
];

const PROCESO = [
  { num: "01", t: "Entendemos", d: "Analizamos tu marca, negocio, audiencia, competencia, objetivos y percepción actual." },
  { num: "02", t: "Definimos", d: "Construimos una dirección estratégica: posicionamiento, personalidad, tono, estructura visual y prioridades digitales." },
  { num: "03", t: "Diseñamos", d: "Creamos identidad, interfaces, sistemas gráficos, piezas visuales o experiencias web alineadas con la estrategia." },
  { num: "04", t: "Organizamos", d: "Entregamos sistemas claros para que tu marca pueda aplicarse con coherencia y crecer sin perder fuerza." },
];

const JOSE_PHOTOS = [
  "/images/founder-1.webp",
  "/images/founder-2.webp",
  "/images/founder-3.webp",
  "/images/founder-4.webp",
];
const JILLY_PHOTOS = [
  "/images/jilly-1.webp",
  "/images/jilly-2.webp",
  "/images/jilly-3.webp",
  "/images/jilly-4.webp",
];

export default function NosotrosPage() {
  return (
    <div id="top" style={{ "--svc-accent": ACCENT } as CSSProperties}>
      <ViewContentOnLoad contentName="Nosotros" contentCategory="about" contentId="page:nosotros" />
      <TopNav />

      {/* 1. Hero */}
      <section className="section nos-hero" style={{ paddingTop: 132 }} data-screen-label="Nosotros · Hero">
        <div className="shell">
          <Eyebrow num="01">Quiénes somos · El estudio</Eyebrow>
          <Reveal>
            <h1 className="nos-hero-title">
              No somos una agencia más.<br />
              Somos un estudio para marcas que quieren <span className="mark">verse más fuertes</span>.
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p className="nos-hero-sub">
              En UPZITES mezclamos estrategia digital, branding, UX/UI y cultura
              visual contemporánea para construir marcas con presencia, claridad y
              carácter.
            </p>
            <p className="brand-hero-note">
              Diseñamos para negocios que no quieren parecer una opción más: marcas
              que necesitan verse actuales, entenderse rápido y competir con una
              identidad más sólida.
            </p>
            <div className="hero-actions">
              <a href="#proceso" className="btn btn-dark btn-lg">Conoce cómo trabajamos <span className="arr">↗</span></a>
              <Link href="/#projects" className="btn btn-ivory btn-lg">Ver proyectos <span className="arr">↗</span></Link>
              <Link href="/servicios" className="btn btn-ivory btn-lg">Ver servicios <span className="arr">↗</span></Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 2. Declaración */}
      <section className="brand-closing" data-screen-label="Nosotros · Declaración">
        <div className="shell" style={{ alignItems: "flex-start", textAlign: "left" }}>
          <Reveal>
            <h2 className="brand-closing-h" style={{ maxWidth: 880 }}>
              Diseñamos con estrategia.<br /><span className="mark">Creamos con actitud</span>.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <div className="nos-declara">
              <p>
                UPZITES nace para ayudar a marcas, empresas y proyectos ambiciosos a
                dejar de verse genéricos, improvisados o débiles.
              </p>
              <p>
                Nuestro trabajo combina pensamiento estratégico, diseño gráfico
                contemporáneo, experiencia digital y una sensibilidad visual tropical
                underground: vibrante, humana, urbana y premium.
              </p>
              <p className="nos-declara-strong">No diseñamos para decorar. Diseñamos para posicionar.</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 3. Qué somos */}
      <section className="section" data-screen-label="Nosotros · Qué somos">
        <div className="shell">
          <Eyebrow num="02">Qué somos</Eyebrow>
          <div className="nos-cols">
            {QUE_SOMOS.map((c, i) => (
              <Reveal key={c.t} delay={i * 80}>
                <div className="nos-col">
                  <span className="nos-col-num">0{i + 1}</span>
                  <h3>{c.t}</h3>
                  <p>{c.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Qué no somos */}
      <section className="section section--ivory" data-screen-label="Nosotros · Qué no somos">
        <div className="shell">
          <Eyebrow num="03">Qué no somos</Eyebrow>
          <div className="services-head">
            <Reveal>
              <h2 className="services-h">
                No hacemos<br />
                <span className="b">diseño vacío<span style={{ color: ACCENT }}>.</span></span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <div className="nos-no">
                <p>No creemos en marcas que se ven bien solo en un mockup.</p>
                <p>No creemos en webs bonitas que no explican nada.</p>
                <p>No creemos en identidades que podrían pertenecerle a cualquier negocio.</p>
                <p className="nos-no-strong">Creemos en marcas con dirección, estructura visual y una voz propia.</p>
              </div>
            </Reveal>
          </div>
          <div className="nos-frases">
            {NO_SOMOS.map((f) => <span key={f} className="nos-frase">{f}</span>)}
          </div>
        </div>
      </section>

      {/* 5. Enfoque */}
      <section className="section section--tight" data-screen-label="Nosotros · Enfoque">
        <div className="shell brand-problem">
          <Eyebrow num="04">Nuestro enfoque</Eyebrow>
          <Reveal>
            <h2 className="brand-promise-h" style={{ marginTop: 8 }}>Estrategia clara + expresión visual audaz.</h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="brand-lead" style={{ marginTop: 18 }}>
              Cada proyecto en UPZITES empieza con una pregunta: ¿qué necesita
              proyectar esta marca para competir mejor Desde ahí construimos una
              dirección visual y digital con criterio: identidad, tono, diseño web,
              experiencia de usuario, contenido y presencia de marca.
            </p>
          </Reveal>
          <Reveal delay={160}>
            <h2 className="brand-punch">
              El resultado no es solo una estética. Es una forma más <span className="mark">clara, fuerte y memorable</span> de presentarse al mercado.
            </h2>
          </Reveal>
        </div>
      </section>

      {/* 6. Lo que nos mueve */}
      <section className="section section--ivory" data-screen-label="Nosotros · Lo que nos mueve">
        <div className="shell">
          <Eyebrow num="05">Lo que nos mueve</Eyebrow>
          <div className="services-head">
            <Reveal>
              <h2 className="services-h">
                Seis principios.<br />
                <span className="b">Una sola dirección<span style={{ color: ACCENT }}>.</span></span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "var(--fg-2)", maxWidth: 460, margin: 0 }}>
                Pasa el cursor o toca cada tarjeta para ver cómo lo aplicamos.
              </p>
            </Reveal>
          </div>
          <FeatureCards cards={CARDS} />
        </div>
      </section>

      {/* 7. Estética */}
      <section className="section" data-screen-label="Nosotros · Estética">
        <div className="shell brand-problem">
          <Eyebrow num="06">Nuestra estética</Eyebrow>
          <Reveal>
            <h2 className="brand-promise-h" style={{ marginTop: 8 }}>Tropical underground premium.</h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="brand-lead" style={{ marginTop: 18 }}>
              Nuestra identidad visual mezcla la energía brillante de Miami, la
              actitud creativa de Los Ángeles y la expresividad gráfica venezolana.
              Nos gustan los fondos claros, la tipografía fuerte, los colores
              intensos usados con control, los grids editoriales, los recursos
              urbanos y las marcas que se sienten vivas.
            </p>
          </Reveal>
          <Reveal delay={140}>
            <div className="intro-tags" style={{ marginTop: 22 }}>
              <Pill dot>Premium, pero no frío</Pill>
              <Pill dot>Creativo, pero no caótico</Pill>
              <Pill dot>Estratégico, pero con sangre</Pill>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 8. Quién es UPZITES (Santiago) */}
      <section className="section section--ivory" data-screen-label="Nosotros · UPZITES">
        <div className="shell">
          <Eyebrow num="07">Quién es UPZITES</Eyebrow>
          <div className="brand-promise">
            <figure className="brand-promise-media brand-promise-media--in" style={{ margin: 0 }}>
              <img src="/images/nosotros/santiago.webp" alt="Santiago de Chile — base de UPZITES" />
            </figure>
            <Reveal delay={120}>
              <div>
                <h2 className="brand-promise-h">Un estudio con base en Santiago de Chile.</h2>
                <p className="brand-body">
                  Operamos desde Santiago de Chile y llevamos en el ADN la
                  expresividad de nuestras raíces caraqueñas. Diseñamos para marcas
                  de Latinoamérica, Estados Unidos y Europa que quieren competir con
                  una imagen más fuerte.
                </p>
                <div className="intro-tags" style={{ marginTop: 20 }}>
                  <Pill dot>Santiago de Chile · base</Pill>
                  <Pill dot>Raíces caraqueñas</Pill>
                  <Pill dot>LATAM · EE.UU. · Europa</Pill>
                </div>
                <p className="nos-credit-light">Foto de Santiago: Wikimedia Commons (CC BY-SA).</p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 9. Nuestro equipo */}
      <section className="section" data-screen-label="Nosotros · Equipo">
        <div className="shell">
          <Eyebrow num="08">Nuestro equipo</Eyebrow>
          <div className="services-head">
            <Reveal>
              <h2 className="services-h">
                Un equipo pequeño.<br />
                <span className="b">Una presencia grande<span style={{ color: ACCENT }}>.</span></span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "var(--fg-2)", maxWidth: 460, margin: 0 }}>
                UPZITES se construye desde dos fuerzas que se complementan: la
                estructura visual y técnica de José, y la energía organizada y
                social de Jilly. Uno construye la experiencia; la otra mantiene el
                flow.
              </p>
            </Reveal>
          </div>

          {/* José */}
          <div className="nos-founder team-member">
            <div className="nos-founder-photos nos-founder-photos--in">
              {JOSE_PHOTOS.map((src, i) => (
                <img key={i} src={src} alt={`José Rodríguez — foto ${i + 1}`} loading="lazy" />
              ))}
            </div>
            <Reveal delay={120}>
              <div className="nos-founder-bio">
                <h3 className="team-name">José Rodríguez</h3>
                <p className="qs-bio-role">Diseño &amp; Desarrollo Web · Founder</p>
                <p className="brand-body">
                  Diseñador y desarrollador de UPZITES. Combina diseño gráfico,
                  desarrollo web y pensamiento técnico para crear marcas digitales,
                  interfaces y sitios con estructura, rendimiento y carácter.
                </p>
                <p className="brand-body" style={{ marginTop: 12 }}>
                  Viene del mundo de la ingeniería civil y la construcción, donde
                  desarrolló una mentalidad analítica y orientada a resultados que
                  hoy aplica al diseño digital, UX/UI y desarrollo web.
                </p>
                <div className="intro-tags" style={{ marginTop: 20 }}>
                  <Pill dot>Diseño web</Pill>
                  <Pill dot>Frontend &amp; Backend</Pill>
                  <Pill dot>UX/UI</Pill>
                  <Pill dot>Diseño gráfico</Pill>
                  <Pill dot>Visión técnica</Pill>
                  <Pill dot>Visión de negocio</Pill>
                </div>
                <SocialLinks links={JOSE_SOCIALS} className="team-socials" />
              </div>
            </Reveal>
          </div>

          {/* Jilly */}
          <div className="nos-founder team-member team-member--rev">
            <div className="nos-founder-photos nos-founder-photos--in">
              {JILLY_PHOTOS.map((src, i) => (
                <img key={i} src={src} alt={`Jilly Moreno — foto ${i + 1}`} loading="lazy" />
              ))}
            </div>
            <Reveal delay={120}>
              <div className="nos-founder-bio">
                <h3 className="team-name">Jilly Moreno</h3>
                <p className="qs-bio-role">Administración &amp; Social Media</p>
                <p className="brand-body">
                  Mantiene el ritmo interno de UPZITES. Licenciada en Administración
                  de Empresas con más de 7 años en gestión administrativa, RR.HH.,
                  operaciones, atención al cliente y remuneraciones.
                </p>
                <p className="brand-body" style={{ marginTop: 12 }}>
                  Es la mezcla de estructura y glamour: organiza procesos, cuida los
                  detalles y se mantiene al día con los trends de Instagram y TikTok
                  para que la marca nunca pierda frescura cultural.
                </p>
                <div className="intro-tags" style={{ marginTop: 20 }}>
                  <Pill dot>Administración</Pill>
                  <Pill dot>RR.HH.</Pill>
                  <Pill dot>Operaciones</Pill>
                  <Pill dot>Atención al cliente</Pill>
                  <Pill dot>Social media</Pill>
                  <Pill dot>Organización</Pill>
                </div>
                <SocialLinks links={JILLY_SOCIALS} className="team-socials" />
              </div>
            </Reveal>
          </div>

          <Reveal delay={80}>
            <p className="team-closing">
              José construye la experiencia. <span className="mark">Jilly mantiene el ritmo</span>.
            </p>
          </Reveal>
        </div>
      </section>

      {/* 9. Para quién */}
      <section className="section" data-screen-label="Nosotros · Para quién">
        <div className="shell">
          <Eyebrow num="09">Para quién trabajamos</Eyebrow>
          <div className="services-head">
            <Reveal>
              <h2 className="services-h">
                Marcas que quieren<br />
                <span className="b">competir distinto<span style={{ color: ACCENT }}>.</span></span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "var(--fg-2)", maxWidth: 460, margin: 0 }}>
                Para negocios, fundadores y proyectos que saben que su imagen actual
                ya no representa el nivel al que quieren llegar.
              </p>
            </Reveal>
          </div>
          <div className="mkt-points">
            {PARA_QUIEN.map((p, i) => (
              <Reveal key={i} delay={i * 50}>
                <div className="mkt-point"><span className="mkt-point-arr">↗</span><span>{p}</span></div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 10. Cómo trabajamos */}
      <section id="proceso" className="section section--ivory" data-screen-label="Nosotros · Cómo trabajamos">
        <div className="shell">
          <Eyebrow num="10">Cómo trabajamos</Eyebrow>
          <Reveal>
            <h2 className="services-h" style={{ marginBottom: 36 }}>
              Dirección, diseño<br />
              <span className="b">y ejecución<span style={{ color: ACCENT }}>.</span></span>
            </h2>
          </Reveal>
          <div className="nos-steps">
            {PROCESO.map((s, i) => (
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

      {/* 11. Manifiesto */}
      <section className="brand-closing" data-screen-label="Nosotros · Manifiesto">
        <div className="shell">
          <Sticker tone="lime" angle={-3}>Manifiesto UPZITES</Sticker>
          <Reveal>
            <h2 className="brand-closing-h" style={{ maxWidth: 980 }}>
              Creemos en marcas con <span className="mark">carácter</span>.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <div className="nos-manifiesto">
              <p>Marcas que no se esconden detrás de plantillas. Marcas que se ven vivas, actuales y listas para competir.</p>
              <p>Creemos que la claridad vende. Que el color puede ser estrategia. Que una buena tipografía puede cambiar la percepción de un negocio. Que una web bien diseñada no solo informa: convence.</p>
              <p className="nos-manifiesto-strong">UPZITES existe para marcas que no quieren verse como una opción más.</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 12. Cierre CTA */}
      <section className="section" data-screen-label="Nosotros · Cierre">
        <div className="shell brand-sell">
          <Reveal>
            <h2 className="services-h">
              Tu marca puede verse más clara,<br />
              <span className="b">más fuerte y más memorable<span style={{ color: ACCENT }}>.</span></span>
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="brand-body">
              Si tienes un negocio con potencial, pero tu presencia visual todavía no
              comunica ese nivel, ahí entramos nosotros. Creamos dirección, sistema y
              diseño para que tu marca se vea lista para competir.
            </p>
            <div className="hero-actions" style={{ justifyContent: "center" }}>
              <Link href="/#contact" className="btn btn-dark btn-lg">Trabajemos tu marca <span className="arr">↗</span></Link>
              <Link href="/servicios" className="btn btn-ivory btn-lg">Ver servicios <span className="arr">↗</span></Link>
            </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </div>
  );
}
