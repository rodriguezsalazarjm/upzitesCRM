import { Reveal } from "./Atoms";

// TODO: el segundo enlace que enviaste era idéntico al primero.
// Cuando tengas la URL del otro brief, reemplaza BRIEF_PERSONAL_URL.
const BRIEF_MARCA_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfvKnC7mN3z1O_3Oaj2PIvtGa1ElVvPSRbGfY-IFhYxIUAC-g/viewform";
const BRIEF_PERSONAL_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfvKnC7mN3z1O_3Oaj2PIvtGa1ElVvPSRbGfY-IFhYxIUAC-g/viewform";

const BRIEFS = [
  {
    title: "Brief de marca",
    desc: "Para empresas, productos o proyectos.",
    url: BRIEF_MARCA_URL,
  },
  {
    title: "Brief de marca personal",
    desc: "Para founders, profesionales y creadores.",
    url: BRIEF_PERSONAL_URL,
  },
];

export function BriefForms() {
  return (
    <Reveal>
      <div className="brief-cta" id="brief">
        <div className="brief-cta-head">
          <span className="brief-cta-kicker">Brief · Empecemos</span>
          <h3>¿Listo para arrancar tu proyecto?</h3>
          <p>Completa el brief que aplique a ti. Toma 5 minutos y nos das todo lo que necesitamos.</p>
        </div>
        <div className="brief-cta-btns">
          {BRIEFS.map((b) => (
            <a
              key={b.title}
              className="brief-cta-card"
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="brief-cta-card-title">{b.title} <span className="arr">↗</span></span>
              <span className="brief-cta-card-desc">{b.desc}</span>
            </a>
          ))}
        </div>
      </div>
    </Reveal>
  );
}
