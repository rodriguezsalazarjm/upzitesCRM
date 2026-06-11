import { Eyebrow, Reveal } from "./Atoms";
import { Logo3D } from "./Logo3D";

const CARDS = [
  {
    k: "01 · Smart Websites",
    t: "Websites inteligentes",
    d: "Sitios que recomiendan, responden y guían al usuario hacia la conversión — sin perder tu estética ni tu tono.",
  },
  {
    k: "02 · Atención 24/7",
    t: "Tu marca, siempre activa",
    d: "Responde a tus clientes a cualquier hora, con el mismo criterio y voz de la marca. Menos esperas, más cierres.",
  },
  {
    k: "03 · Automatización UX",
    t: "Menos fricción, más conversión",
    d: "Flujos y procesos que eliminan pasos innecesarios: captación, seguimiento y atención que trabajan solos.",
  },
  {
    k: "04 · AI Enhanced Branding",
    t: "Identidad que escala",
    d: "Contenido y experiencias que crecen con inteligencia, manteniendo intacta la dirección visual de tu marca.",
  },
];

const USES = [
  "Chat que califica leads",
  "Respuestas con tu tono de marca",
  "Recomendador de productos",
  "Reservas y agenda automáticas",
  "Seguimiento y reportes automáticos",
];

export function SmartLayer() {
  return (
    <section id="ia" className="section section--ivory smart" data-screen-label="Capa inteligente">
      <div className="shell">
        <Eyebrow>Capa inteligente · Nuevo</Eyebrow>
        <div className="services-head">
          <Reveal>
            <h2 className="services-h">
              Branding y experiencias digitales,<br />
              <span className="b">potenciadas con IA<span style={{ color: "var(--upz-electric)" }}>.</span></span>
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "var(--fg-2)", maxWidth: 480, margin: 0 }}>
              La IA no cambia quiénes somos: suma una capa estratégica a lo que ya
              hacemos. Marcas y websites preparados para la nueva era —{" "}
              <strong>sin perder identidad</strong>.
            </p>
          </Reveal>
        </div>

        <Logo3D />

        <div className="smart-grid">
          {CARDS.map((c, i) => (
            <Reveal key={c.k} delay={i * 70}>
              <article className="smart-card">
                <span className="smart-card-kicker">{c.k}</span>
                <h3>{c.t}</h3>
                <p>{c.d}</p>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={80}>
          <div className="smart-uses glass" aria-label="Casos de uso">
            <span className="smart-uses-label">Casos de uso</span>
            {USES.map((u) => (
              <span className="smart-use" key={u}><span className="smart-use-dot">●</span>{u}</span>
            ))}
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="smart-foot">
            <p className="smart-foot-line">
              La IA no reemplaza tu marca. <span className="hl">La hace funcionar mejor</span>.
            </p>
            <a href="#contact" className="btn btn-dark btn-lg">Integra IA a tu marca <span className="arr">↗</span></a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
