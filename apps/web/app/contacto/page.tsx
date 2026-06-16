import Link from "next/link";
import { TopNav, Footer, Marquee } from "@/components/Sections";
import { Eyebrow, Reveal, Sticker } from "@/components/Atoms";
import { ContactForm } from "./contact-form";
import { BriefForms } from "@/components/BriefForms";

export const metadata = {
  title: "Contacto - UPZITES",
  description:
    "Cuéntanos sobre tu marca, web, contenido, ads o automatización. El formulario se conecta al CRM de UPZITES para dar seguimiento comercial.",
};

export default function ContactoPage() {
  return (
    <div id="top">
      <TopNav />

      <section className="brand-hero contact-page-hero" data-screen-label="Contacto Hero">
        <div className="shell">
          <div className="svc-breadcrumb">
            <Link href="/">Inicio</Link>
            <span>&rarr;</span>
            <span>Contacto</span>
          </div>
          <div className="brand-hero-grid">
            <div>
              <Eyebrow num="01">Contacto - Nuevo proyecto</Eyebrow>
              <h1 className="brand-hero-title">
                Hablemos de lo que quieres <span className="mark">construir y vender</span>.
              </h1>
              <p className="brand-hero-sub">
                Completa el formulario y te responderemos con contexto:
                servicio, urgencia, rubro, presupuesto y próximos pasos claros.
              </p>
              <div className="hero-actions">
                <a href="#formulario" className="btn btn-dark btn-lg">
                  Completar formulario <span className="arr">&rarr;</span>
                </a>
                <Link href="/api/brochure/downloadsource=contact_hero" className="btn btn-ivory btn-lg">
                  Descargar brochure <span className="arr">&rarr;</span>
                </Link>
              </div>
            </div>
            <div className="contact-system-card">
              <Sticker tone="lime" angle={-3}>Sistema comercial</Sticker>
              <h2>No hacemos solo webs bonitas.</h2>
              <p>
                Construimos sistemas que capturan leads, ordenan conversaciones,
                activan seguimiento y ayudan a convertir interés en reuniones,
                oportunidades y ventas reales.
              </p>
              <div className="contact-system-flow" aria-label="Flujo comercial UPZITES">
                <span>Web</span>
                <span>Lead</span>
                <span>CRM</span>
                <span>Venta</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Marquee
        variant="carbon"
        items={[
          "Webs que venden",
          "Sistemas que convierten",
          "Automatización",
          "CRM",
          "WhatsApp",
          "IA comercial",
          "Agenda",
          "Seguimiento",
        ]}
      />

      <section id="formulario" className="bigcta contact-page-section" data-screen-label="Contacto Formulario">
        <div className="shell">
          <Reveal>
            <ContactForm />
          </Reveal>
          <BriefForms />
        </div>
      </section>

      <Marquee
        variant="carbon"
        items={[
          "Branding",
          "Web",
          "Contenido",
          "Ads",
          "Automatización",
          "CRM",
          "Soluciones Express",
        ]}
      />

      <Footer />
    </div>
  );
}


