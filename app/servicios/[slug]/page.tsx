import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TopNav, Footer } from "@/components/Sections";
import { Eyebrow, Reveal, Sticker } from "@/components/Atoms";
import { SERVICES, getService } from "@/lib/services";

export function generateStaticParams() {
  // "branding" and "diseno-web" have dedicated static routes under app/servicios/
  const custom = ["branding", "diseno-web"];
  return SERVICES.filter((s) => !custom.includes(s.slug)).map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = getService(slug);
  if (!s) return { title: "Servicio — UPZITES" };
  return {
    title: `${s.title} — UPZITES`,
    description: s.tagline,
  };
}

export default async function ServiceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = getService(slug);
  if (!s) notFound();

  const others = SERVICES.filter((x) => x.slug !== s.slug);

  return (
    <div id="top">
      <TopNav />

      {/* Detail hero */}
      <section className="svc-hero" style={{ "--svc-accent": s.accent } as CSSProperties} data-screen-label="Servicio · Hero">
        <div className="shell">
          <div className="svc-breadcrumb">
            <Link href="/servicios">Servicios</Link>
            <span>↗</span>
            <span>{s.title}</span>
          </div>
          <div className="svc-hero-grid">
            <div>
              <Eyebrow num={s.num}>Servicio</Eyebrow>
              <h1 className="svc-hero-title">{s.detail.headline}</h1>
              <p className="svc-hero-tagline">{s.tagline}</p>
              <div className="hero-actions">
                <Link href="/#contact" className="btn btn-dark btn-lg">Hablemos <span className="arr">↗</span></Link>
                <Link href="/#auditoria" className="btn btn-ivory btn-lg">Auditoría gratis <span className="arr">↗</span></Link>
              </div>
            </div>
            <div className="svc-hero-media">
              <img src={s.image} alt={s.title} />
            </div>
          </div>
        </div>
      </section>

      {/* Intro */}
      <section className="section section--tight" data-screen-label="Servicio · Intro">
        <div className="shell">
          <div className="svc-intro">
            {s.detail.intro.map((p, i) => (
              <Reveal key={i} delay={i * 80}><p>{p}</p></Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Qué incluye */}
      <section className="section section--ivory" data-screen-label="Servicio · Incluye">
        <div className="shell">
          <Eyebrow>Qué incluye</Eyebrow>
          <div className="svc-includes">
            {s.detail.includes.map((it, i) => (
              <Reveal key={it.title} delay={i * 60}>
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

      {/* Beneficios */}
      <section className="section section--carbon" data-screen-label="Servicio · Beneficios">
        <div className="shell">
          <Eyebrow>Beneficios</Eyebrow>
          <ul className="svc-benefits">
            {s.detail.benefits.map((b, i) => (
              <Reveal key={i} delay={i * 60} as="li">
                <span className="svc-benefit-arr">↗</span>
                <span>{b}</span>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="section" data-screen-label="Servicio · CTA">
        <div className="shell" style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
          <Sticker tone="lime" angle={-3}>Respuesta en 24h</Sticker>
          <h2 className="services-h" style={{ maxWidth: 820 }}>{s.detail.cta}</h2>
          <Link href="/#contact" className="btn btn-dark btn-lg">Empezar ahora <span className="arr">↗</span></Link>
        </div>
      </section>

      {/* Otros servicios */}
      <section className="section section--ivory" data-screen-label="Servicio · Otros">
        <div className="shell">
          <Eyebrow>Otros servicios</Eyebrow>
          <div className="svc-others">
            {others.map((o) => (
              <Link
                key={o.slug}
                href={`/servicios/${o.slug}`}
                className="svc-other"
                style={{ "--svc-accent": o.accent } as CSSProperties}
              >
                <span className="svc-other-num">{o.num}</span>
                <span className="svc-other-title">{o.title}</span>
                <span className="svc-other-arr">↗</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
