import { TopNav, Footer, Marquee } from "@/components/Sections";
import { Projects } from "@/components/Sections";
import { ViewContentOnLoad } from "@/components/MetaPixelEvents";

export const metadata = {
  title: "Proyectos — UPZITES",
  description: "Archivo completo de proyectos y casos de éxito.",
};

export default function ProyectosPage() {
  return (
    <div id="top">
      <ViewContentOnLoad contentName="Proyectos" contentCategory="portfolio" contentId="page:proyectos" />
      <TopNav />

      <section className="section" style={{ paddingTop: "120px" }}>
        <div className="shell">
          <h1 className="h1" style={{ marginBottom: 24 }}>Archivo de Proyectos</h1>
          <p className="p" style={{ maxWidth: 600 }}>
            Explora nuestro portfolio completo. Filtra por categoría y descubre
            cómo transformamos marcas y aumentamos la conversión.
          </p>
        </div>
      </section>

      {/* Reuse the Projects component from the main page for now */}
      <Projects />

      <Marquee variant="carbon" items={["Casos de éxito", "Portfolio", "Resultados reales"]} />
      <Footer />
    </div>
  );
}
