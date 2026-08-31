import type { Metadata } from "next";
import Image from "next/image";
import { IBM_Plex_Mono } from "next/font/google";
import { LandingIntro } from "@/components/LandingIntro";
import { Reveal } from "@/components/Atoms";
import { ViewContentOnLoad } from "@/components/MetaPixelEvents";
import { SolucionWa } from "@/components/SolucionWa";
import { ICONS, IconArrow, IconCheck, IconCross, IconPlus } from "./icons";
import {
  ADDONS,
  CANONICAL,
  CASES,
  CHECKLIST,
  CLIENT_LOGOS,
  COMPARE_BAD,
  COMPARE_GOOD,
  CONDICIONES,
  CONTENT_NAME,
  DESCRIPTION,
  DIFFS,
  DOMINIO_RENOVACION,
  EXAMPLES,
  FAQ,
  HERO_GALLERY,
  INCLUYE,
  KEYWORDS,
  MSG_MAIN,
  OG_DESCRIPTION,
  PLANS,
  PLAZO_CONDICION,
  PLAZO_LABEL,
  STEPS,
  TESTIMONIALS,
  TITLE,
  TRUST_ITEMS,
  clp,
  jsonLdString,
  planFeatures,
  planMessage,
} from "./content";
import "./landing-express.css";

/**
 * IBM Plex Mono se carga solo en esta ruta (eyebrows, marcadores numerados y
 * precios). Importarla aqui y no en el layout evita cargarla en todo el sitio.
 */
const mono = IBM_Plex_Mono({
  weight: ["400", "600"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-lx-mono",
});

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: KEYWORDS,
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: TITLE,
    description: OG_DESCRIPTION,
    type: "website",
    url: CANONICAL,
    siteName: "UPZITES",
    locale: "es_CL",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: OG_DESCRIPTION,
  },
};

/** Marcador numerado de seccion: número + regla + etiqueta, en mono. */
function Marker({ n, label }: { n: string; label: string }) {
  return (
    <p className="lx-marker">
      <span className="lx-marker-num">{n}</span>
      <span className="lx-marker-rule" aria-hidden="true" />
      <span>{label}</span>
    </p>
  );
}

export default function LandingExpressPage() {
  return (
    <>
      {/* Pantalla de carga: capa fija que se descubre sola. Va fuera de .lx
          porque debe cubrir el viewport completo, no el flujo de la pagina. */}
      <LandingIntro />

      <div className={`lx ${mono.variable}`}>
      <script
        type="application/ld+json"
        // Serializado desde el mismo objeto que renderiza la FAQ y los planes.
        dangerouslySetInnerHTML={{ __html: jsonLdString() }}
      />
      <ViewContentOnLoad contentName="Landing + Branding Express" contentCategory="solucion" contentId="landing:landing-express" />

      <div className="lx-topbar">
        <div className="lx-topbar-inner">
          <a className="lx-topbar-brand" href="https://www.upzites.com" target="_blank" rel="noopener noreferrer">
            UP<span>·</span>Express
          </a>
          <SolucionWa
            message={MSG_MAIN}
            className="lx-btn lx-btn--primary lx-btn--sm"
            location="lx_topbar"
            contentName={CONTENT_NAME}
            contentCategory="generico"
            sourceSection="nav"
          >
            Cotizar
          </SolucionWa>
        </div>
      </div>

      {/* Hero */}
      <header className="lx-hero">
        <div className="lx-shell lx-hero-head">
          <Reveal>
            <div>
              <Marker n="00" label="Landing Page + Branding Express" />
              <p className="lx-sticker">Listo en {PLAZO_LABEL}</p>
              <h1>Tu marca y landing listas para <span className="lx-accent">vender mejor</span></h1>
              <p className="lx-hero-sub">
                Creamos una identidad visual express y una landing page profesional para que tu negocio
                se vea claro, confiable y listo para captar clientes.
              </p>
            </div>
          </Reveal>
        </div>

        {/* Galeria de paneles: se expanden al pasar el cursor. Sin JS: en
            escritorio con :hover / :focus-within, en movil como carrusel con
            scroll-snap, porque en tactil no existe el hover. */}
        <div className="lx-shell">
          <Reveal delay={100}>
            <div className="lx-gallery">
              {HERO_GALLERY.map((shot) => (
                <figure className="lx-gallery-item" key={shot.src} tabIndex={0}>
                  <Image
                    src={shot.src}
                    alt={`${shot.brand} — ${shot.kind} por UPZITES`}
                    fill
                    sizes="(max-width: 899px) 66vw, 30vw"
                  />
                  <figcaption className="lx-gallery-cap">
                    <span className="lx-gallery-kind">{shot.kind}</span>
                    <span className="lx-gallery-brand">{shot.brand}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </Reveal>
        </div>

        <div className="lx-shell lx-hero-foot">
          <Reveal delay={140}>
            <div>
              <div className="lx-hero-cta">
                <SolucionWa
                  message={MSG_MAIN}
                  className="lx-btn lx-btn--primary"
                  location="lx_hero"
                  contentName={CONTENT_NAME}
                  contentCategory="generico"
                  sourceSection="hero"
                >
                  Quiero mi Branding Express
                  <IconArrow />
                </SolucionWa>
                <a className="lx-btn lx-btn--ghost" href="#incluye">Ver qué incluye</a>
              </div>
              <p className="lx-hero-support">
                Ideal para emprendedores, marcas personales y negocios que necesitan una presencia
                digital rápida, moderna y bien diseñada.
              </p>
            </div>
          </Reveal>
        </div>
      </header>

      {/* Franja de features */}
      <div className="lx-trust">
        <div className="lx-trust-inner">
          {TRUST_ITEMS.map((t) => (
            <span className="lx-pill" key={t}>
              <span className="lx-pill-dot" aria-hidden="true" />
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Problema */}
      <section className="lx-section">
        <div className="lx-shell lx-split">
          <Reveal>
            <div>
              <Marker n="01" label="El problema" />
              <h2>Tu negocio puede ser bueno, pero si no se ve profesional, pierde confianza</h2>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div>
              <p>
                Muchas marcas comienzan vendiendo por Instagram, WhatsApp o recomendación. El problema
                aparece cuando un cliente pide más información y no existe una página clara, una identidad
                visual ordenada o una presentación profesional del servicio.
              </p>
              <p>
                Creamos una presencia digital simple, clara y profesional para que puedas explicar tu
                oferta, generar confianza y recibir consultas.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Qué incluye */}
      <section className="lx-section lx-section--ivory" id="incluye">
        <div className="lx-shell">
          <Reveal>
            <div>
              <Marker n="02" label="Qué incluye" />
              <h2>Qué incluye tu Branding Express</h2>
            </div>
          </Reveal>
          <div className="lx-cards">
            {INCLUYE.map((c) => {
              const Icon = ICONS[c.icon];
              return (
                <div className="lx-card" key={c.title}>
                  <div className="lx-card-icon"><Icon /></div>
                  <h3>{c.title}</h3>
                  <p>{c.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="lx-section">
        <div className="lx-shell">
          <Reveal>
            <div>
              <Marker n="03" label="Cómo funciona" />
              <h2>De idea a presencia digital express</h2>
            </div>
          </Reveal>
          <div className="lx-steps">
            {STEPS.map((s, i) => (
              <div className="lx-step" key={s.title}>
                <div className="lx-step-num">{String(i + 1).padStart(2, "0")}</div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Qué necesitamos de ti */}
      <section className="lx-section lx-section--ivory">
        <div className="lx-shell">
          <Reveal>
            <div>
              <Marker n="04" label="Qué necesitamos de ti" />
              <h2>Lo que tienes que enviarnos para partir</h2>
              <p className="lx-lead" style={{ marginTop: 16 }}>
                Nada complicado. Con esto en mano armamos todo sin que tengas que estar encima.
              </p>
            </div>
          </Reveal>
          <div className="lx-cards">
            {CHECKLIST.map((item) => (
              <div className="lx-card" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
          <p className="lx-note">{PLAZO_CONDICION}</p>
        </div>
      </section>

      {/* Planes */}
      <section className="lx-section">
        <div className="lx-shell">
          <Reveal>
            <div>
              <Marker n="05" label="Planes" />
              <h2>Dos formas de empezar</h2>
            </div>
          </Reveal>
          <div className="lx-plans">
            {PLANS.map((plan) => (
              <div className={`lx-plan${plan.featured ? " lx-plan--featured" : ""}`} key={plan.name}>
                {plan.featured && <span className="lx-plan-badge">Recomendado</span>}
                <div>
                  <div className="lx-plan-name">{plan.name}</div>
                  <div className="lx-plan-price">{clp(plan.amountClp)}<small>CLP</small></div>
                </div>
                <p className="lx-plan-ideal">{plan.ideal}</p>
                <ul className="lx-plan-list">
                  {planFeatures(plan).map((f) => (
                    <li key={f}><IconCheck />{f}</li>
                  ))}
                </ul>
                <SolucionWa
                  message={planMessage(plan.name)}
                  className={`lx-btn ${plan.featured ? "lx-btn--primary" : "lx-btn--ghost"} lx-btn--block`}
                  location={`lx_plan_${plan.id}`}
                  contentName={CONTENT_NAME}
                  contentCategory={plan.id}
                  sourceSection="planes"
                >
                  {plan.cta}
                </SolucionWa>
              </div>
            ))}
          </div>
          {/* Se omite entero mientras no esten confirmados el IVA y los medios de pago. */}
          {(CONDICIONES.iva || CONDICIONES.formasPago.length > 0) && (
            <p className="lx-note">
              {CONDICIONES.iva}
              {CONDICIONES.iva && CONDICIONES.formasPago.length > 0 ? " · " : ""}
              {CONDICIONES.formasPago.length > 0 ? `Formas de pago: ${CONDICIONES.formasPago.join(", ")}.` : ""}
            </p>
          )}
          <p className="lx-note">¿Necesitas web completa, ecommerce, reservas o branding profundo? Lo derivamos a Sitios Web Pro / Proyecto Personalizado UPZITES.</p>
        </div>
      </section>

      {/* Comparación */}
      <section className="lx-section lx-section--ivory">
        <div className="lx-shell">
          <Reveal>
            <div>
              <Marker n="06" label="No es solo una página bonita" />
              <h2>La diferencia se nota</h2>
            </div>
          </Reveal>
          <div className="lx-compare">
            <div className="lx-compare-col lx-compare-col--bad">
              <h3>Una presencia improvisada</h3>
              <ul className="lx-compare-list">
                {COMPARE_BAD.map((t) => <li key={t}><IconCross />{t}</li>)}
              </ul>
            </div>
            <div className="lx-compare-col lx-compare-col--good">
              <h3>Landing + Branding Express</h3>
              <ul className="lx-compare-list">
                {COMPARE_GOOD.map((t) => <li key={t}><IconCheck />{t}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Ejemplos */}
      <section className="lx-section">
        <div className="lx-shell">
          <Reveal>
            <div>
              <Marker n="07" label="Ejemplos" />
              <h2>Marcas que pueden nacer con este servicio</h2>
            </div>
          </Reveal>
          <div className="lx-cards">
            {EXAMPLES.map((e) => (
              <div className="lx-card" key={e.title}>
                <h3>{e.title}</h3>
                <p>{e.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Prueba social — se oculta entera si no hay casos cargados */}
      {CASES.length > 0 && (
        <section className="lx-section lx-section--ivory">
          <div className="lx-shell">
            <Reveal>
              <div>
                <Marker n="08" label="Trabajo publicado" />
                <h2>Sitios que ya están en línea</h2>
                <p className="lx-lead" style={{ marginTop: 16 }}>
                  Proyectos que diseñamos y publicamos. No son landings express: son trabajos más
                  grandes, del mismo equipo y con el mismo criterio.
                </p>
              </div>
            </Reveal>

            <div className="lx-cases">
              {CASES.map((c) => (
                <div className="lx-case" key={c.slug}>
                  <div className="lx-case-frame">
                    <div className="lx-case-bar" aria-hidden="true"><span /><span /><span /></div>
                    <div className="lx-case-shot">
                      <Image
                        src={c.shot}
                        alt={`Sitio web de ${c.brand} diseñado por UPZITES`}
                        fill
                        sizes="(min-width: 900px) 340px, 100vw"
                      />
                    </div>
                  </div>
                  <div>
                    <p className="lx-case-sector">{c.sector}</p>
                    <p className="lx-case-brand">{c.brand}</p>
                    {/* Sin resultado confirmado no se muestra linea: nada inventado. */}
                    {c.result && <p className="lx-case-result">{c.result}</p>}
                    <a className="lx-case-link" href={c.url} target="_blank" rel="noopener noreferrer">
                      Ver el sitio
                      <IconArrow />
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {TESTIMONIALS.length > 0 && (
              <div className="lx-quotes">
                {TESTIMONIALS.map((t) => (
                  <figure className="lx-quote" key={`${t.brand}-${t.name}`}>
                    <blockquote>{t.quote}</blockquote>
                    <figcaption>{t.name} · {t.role} · {t.brand}</figcaption>
                  </figure>
                ))}
              </div>
            )}

            {CLIENT_LOGOS.length > 0 && (
              <ul className="lx-logos">
                {CLIENT_LOGOS.map((l) => (
                  <li key={l.name}>
                    <Image src={l.src} alt={l.name} width={120} height={30} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* Diferenciadores — sección oscura */}
      <section className="lx-section lx-section--carbon">
        <div className="lx-shell">
          <Reveal>
            <div>
              <Marker n="09" label="Por qué UPZITES" />
              <h2>Diseño, marca y estrategia en un solo paso</h2>
            </div>
          </Reveal>
          <div className="lx-diff">
            {DIFFS.map((d, i) => (
              <div className="lx-diff-item" key={d}>
                <span className="lx-diff-stamp">{String(i + 1).padStart(2, "0")}</span>
                <span className="lx-diff-text">{d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Addons */}
      <section className="lx-section lx-section--tight lx-section--ivory">
        <div className="lx-shell">
          <Reveal>
            <div>
              <Marker n="10" label="También puedes agregar" />
              <h2>Adicionales</h2>
              <div className="lx-diff">
                {ADDONS.map((a) => (
                  <div className="lx-diff-item" key={a.name}>
                    <span className="lx-diff-stamp"><IconPlus /></span>
                    <span className="lx-diff-text">
                      {a.name}
                      {/* Sin precio confirmado no se muestra nada: mejor vacio que inventado. */}
                      {a.priceFrom !== null && <span className="lx-addon-price">desde {clp(a.priceFrom)}</span>}
                    </span>
                  </div>
                ))}
              </div>
              {DOMINIO_RENOVACION && <p className="lx-note">{DOMINIO_RENOVACION}</p>}
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="lx-section">
        <div className="lx-shell" style={{ maxWidth: 820 }}>
          <Reveal>
            <div>
              <Marker n="11" label="Preguntas frecuentes" />
              <h2>Resolvemos tus dudas</h2>
            </div>
          </Reveal>
          <div className="lx-faq">
            {FAQ.map((item) => (
              <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="lx-section lx-section--carbon lx-closing">
        <div className="lx-shell">
          <Reveal>
            <div>
              <Marker n="12" label="Empieza hoy" />
              <h2>Tu negocio ya puede verse como una marca profesional</h2>
              <p className="lx-lead">
                Creamos tu identidad visual base y una landing page lista para compartir, captar clientes
                y vender mejor.
              </p>
              <div className="lx-hero-cta">
                <SolucionWa
                  message={MSG_MAIN}
                  className="lx-btn lx-btn--on-ink"
                  location="lx_cierre_primario"
                  contentName={CONTENT_NAME}
                  contentCategory="generico"
                  sourceSection="cierre"
                >
                  Quiero mi Branding Express
                  <IconArrow />
                </SolucionWa>
                <SolucionWa
                  message={MSG_MAIN}
                  className="lx-btn lx-btn--ghost"
                  location="lx_cierre_whatsapp"
                  contentName={CONTENT_NAME}
                  contentCategory="generico"
                  sourceSection="cierre"
                >
                  Cotizar por WhatsApp
                </SolucionWa>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="lx-footer">
        <div className="lx-shell">
          <div className="lx-footer-brand">UPZITES</div>
          <p>Landing Page + Branding Express · <a href="https://www.upzites.com" target="_blank" rel="noopener noreferrer">www.upzites.com</a></p>
        </div>
      </footer>

      <div className="lx-sticky">
        <SolucionWa
          message={MSG_MAIN}
          className="lx-btn lx-btn--primary"
          location="lx_sticky"
          contentName={CONTENT_NAME}
          contentCategory="generico"
          sourceSection="sticky"
        >
          Quiero mi Branding Express
        </SolucionWa>
      </div>
      </div>
    </>
  );
}
