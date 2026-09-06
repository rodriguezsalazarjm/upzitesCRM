import type { ReactNode } from "react";
import { TopNav, Footer } from "@/components/Sections";
import { Eyebrow } from "@/components/Atoms";

export type LegalSection = { heading: string; body: ReactNode };

export function LegalPage({
  eyebrow,
  title,
  intro,
  updated,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <div id="top">
      <TopNav />
      <section className="section legal" style={{ paddingTop: 132 }} data-screen-label="Legal">
        <div className="shell legal-shell">
          <header className="legal-head">
            <Eyebrow num="·">{eyebrow}</Eyebrow>
            <h1 className="legal-title">{title}</h1>
            <span className="legal-updated">Última actualización: {updated}</span>
            <p className="legal-intro">{intro}</p>
          </header>

          <div className="legal-blocks">
            {sections.map((s, i) => (
              <article key={i} className="legal-block">
                <span className="legal-num">{String(i + 1).padStart(2, "0")}</span>
                <div className="legal-block-content">
                  <h2>{s.heading}</h2>
                  <div className="legal-body">{s.body}</div>
                </div>
              </article>
            ))}
          </div>

          <p className="legal-contact">
            ¿Dudas sobre este documento? Escríbenos a{" "}
            <a href="mailto:contacto@upzites.com">contacto@upzites.com</a>.
          </p>
        </div>
      </section>
      <Footer />
    </div>
  );
}
