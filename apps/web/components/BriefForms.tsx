import Link from "next/link";
import { Reveal } from "./Atoms";

const BRIEFS = [
  {
    title: "Brief de marca",
    desc: "Para empresas, productos o proyectos.",
    url: "/brief/marca",
  },
  {
    title: "Brief de marca personal",
    desc: "Para founders, profesionales y creadores.",
    url: "/brief/marca-personal",
  },
];

export function BriefForms() {
  return (
    <Reveal>
      <div className="brief-cta" id="brief">
        <div className="brief-cta-head">
          <span className="brief-cta-kicker">Brief - Empecemos</span>
          <h3>Listo para arrancar tu proyecto</h3>
          <p>Completa el brief que aplique a ti. Así podemos entender tu contexto y responder con una propuesta más precisa.</p>
        </div>
        <div className="brief-cta-btns">
          {BRIEFS.map((brief) => (
            <Link key={brief.title} className="brief-cta-card" href={brief.url}>
              <span className="brief-cta-card-title">
                {brief.title} <span className="arr">&#8599;</span>
              </span>
              <span className="brief-cta-card-desc">{brief.desc}</span>
            </Link>
          ))}
        </div>
      </div>
    </Reveal>
  );
}
