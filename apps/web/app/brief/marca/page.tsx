import Link from "next/link";
import { TopNav, Footer } from "@/components/Sections";
import { Eyebrow, Reveal } from "@/components/Atoms";
import { BriefForm } from "../brief-form";

export const metadata = {
  title: "Brief de marca - UPZITES",
  description: "Formulario para levantar contexto de marca, audiencia, oferta y dirección visual.",
};

export default function BriefMarcaPage() {
  return (
    <div id="top">
      <TopNav />
      <section className="brand-hero" data-screen-label="Brief marca">
        <div className="shell">
          <div className="svc-breadcrumb">
            <Link href="/">Inicio</Link>
            <span>&#8599;</span>
            <span>Brief de marca</span>
          </div>
          <div className="services-head">
            <Reveal>
              <h1 className="brand-hero-title">
                Brief de <span className="mark">marca</span>.
              </h1>
            </Reveal>
            <Reveal delay={120}>
              <p className="brand-hero-sub">
                Completa este formulario si necesitas branding, dirección visual,
                identidad, sistema gráfico o una marca lista para web, contenido y campañas.
              </p>
            </Reveal>
          </div>
        </div>
      </section>
      <section className="bigcta brief-page-section">
        <div className="shell">
          <Eyebrow num="02">Formulario de proyecto</Eyebrow>
          <BriefForm kind="marca" />
        </div>
      </section>
      <Footer />
    </div>
  );
}
