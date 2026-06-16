import Link from "next/link";
import { TopNav, Footer } from "@/components/Sections";
import { Eyebrow, Reveal } from "@/components/Atoms";
import { BriefForm } from "../brief-form";

export const metadata = {
  title: "Brief de marca personal - UPZITES",
  description: "Formulario para levantar contexto de posicionamiento, audiencia, contenido y objetivos de marca personal.",
};

export default function BriefMarcaPersonalPage() {
  return (
    <div id="top">
      <TopNav />
      <section className="brand-hero" data-screen-label="Brief marca personal">
        <div className="shell">
          <div className="svc-breadcrumb">
            <Link href="/">Inicio</Link>
            <span>↗</span>
            <span>Brief de marca personal</span>
          </div>
          <div className="services-head">
            <Reveal>
              <h1 className="brand-hero-title">
                Brief de <span className="mark">marca personal</span>.
              </h1>
            </Reveal>
            <Reveal delay={120}>
              <p className="brand-hero-sub">
                Completa este formulario si quieres ordenar tu posicionamiento,
                narrativa, contenido, propuesta y presencia digital como founder,
                profesional o creador.
              </p>
            </Reveal>
          </div>
        </div>
      </section>
      <section className="bigcta brief-page-section">
        <div className="shell">
          <Eyebrow num="02">Formulario de proyecto</Eyebrow>
          <BriefForm kind="marca-personal" />
        </div>
      </section>
      <Footer />
    </div>
  );
}
