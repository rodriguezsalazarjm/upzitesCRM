"use client";

import { useState } from "react";
import { Eyebrow, Reveal } from "./Atoms";

type Field = {
  id: string;
  label: string;
  placeholder?: string;
  type?: "text" | "email" | "textarea";
  required?: boolean;
};

type Brief = {
  key: string;
  tab: string;
  title: string;
  blurb: string;
  fields: Field[];
};

const SHARED: Field[] = [
  { id: "nombre", label: "Tu nombre", placeholder: "Nombre y apellido", required: true },
  { id: "email", label: "Email", placeholder: "tu@correo.com", type: "email", required: true },
  { id: "whatsapp", label: "WhatsApp (opcional)", placeholder: "+56 9 ..." },
];

const BRIEFS: Brief[] = [
  {
    key: "marca",
    tab: "Brief de marca",
    title: "Brief de marca",
    blurb:
      "Para empresas, productos o proyectos. Cuéntanos lo esencial y armamos la estrategia de identidad.",
    fields: [
      { id: "marca", label: "Nombre y rubro de la marca", placeholder: "Ej: Calor Coffee · cafetería de especialidad", required: true },
      { id: "que_hace", label: "¿Qué hace tu marca?", placeholder: "Productos / servicios principales", type: "textarea", required: true },
      { id: "diferencia", label: "¿Qué te diferencia?", placeholder: "Tu propuesta de valor, por qué te eligen", type: "textarea" },
      { id: "publico", label: "Público objetivo", placeholder: "A quién le hablas (edad, intereses, lugar)", type: "textarea" },
      { id: "referentes", label: "Referentes / competencia que admiras", placeholder: "Marcas o estilos que te gustan" },
      { id: "personalidad", label: "Personalidad de marca", placeholder: "3–5 adjetivos (ej: bold, cálida, premium)" },
      { id: "necesito", label: "¿Qué necesitas?", placeholder: "Logo, identidad, web, e-commerce, redes...", type: "textarea", required: true },
      { id: "objetivos", label: "Objetivos del proyecto", placeholder: "Qué quieres lograr", type: "textarea" },
      { id: "presupuesto", label: "Presupuesto y fecha objetivo", placeholder: "Rango aproximado + cuándo lo necesitas" },
      { id: "extra", label: "Algo más que debamos saber", placeholder: "Contexto, links, inspiración...", type: "textarea" },
    ],
  },
  {
    key: "personal",
    tab: "Brief de marca personal",
    title: "Brief de marca personal",
    blurb:
      "Para profesionales, founders y creadores. Construyamos tu marca personal con estrategia y carácter.",
    fields: [
      { id: "quien", label: "Tu nombre y a qué te dedicas", placeholder: "Ej: María Pérez · arquitecta y creadora de contenido", required: true },
      { id: "percepcion", label: "¿Cómo quieres que te perciban?", placeholder: "El posicionamiento que buscas", type: "textarea", required: true },
      { id: "audiencia", label: "Tu audiencia", placeholder: "A quién quieres llegar", type: "textarea" },
      { id: "unico", label: "¿Qué te hace único?", placeholder: "Tu historia, expertise, sello personal", type: "textarea" },
      { id: "plataformas", label: "Plataformas", placeholder: "Dónde tienes / quieres presencia (IG, LinkedIn, TikTok...)" },
      { id: "referentes", label: "Referentes que admiras", placeholder: "Personas o marcas personales que te inspiran" },
      { id: "tono", label: "Personalidad / tono", placeholder: "3–5 adjetivos (ej: cercano, experto, disruptivo)" },
      { id: "necesito", label: "¿Qué necesitas?", placeholder: "Identidad, web personal, contenido, fotografía...", type: "textarea", required: true },
      { id: "objetivos", label: "Objetivos", placeholder: "Qué quieres lograr con tu marca personal", type: "textarea" },
      { id: "presupuesto", label: "Presupuesto y fecha objetivo", placeholder: "Rango aproximado + cuándo lo necesitas" },
    ],
  },
];

export function BriefForms() {
  const [active, setActive] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);

  const brief = BRIEFS[active];

  function set(id: string, v: string) {
    setValues((s) => ({ ...s, [id]: v }));
  }

  function switchTo(i: number) {
    setActive(i);
    setValues({});
    setSent(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const all = [...SHARED, ...brief.fields];
    const lines = all.map((f) => `${f.label}:\n${values[f.id] || "—"}`);
    const subject = encodeURIComponent(
      `${brief.title} — ${values["nombre"] || values["marca"] || values["quien"] || "Nuevo brief"}`
    );
    const body = encodeURIComponent(
      `${brief.title.toUpperCase()} · UPZITES\n\n${lines.join("\n\n")}`
    );
    window.location.href = `mailto:contacto@upzites.com?subject=${subject}&body=${body}`;
    setSent(true);
  }

  return (
    <section id="brief" className="section section--ivory brief" data-screen-label="Brief">
      <div className="shell">
        <Eyebrow>Brief · Cuéntanos tu proyecto</Eyebrow>
        <div className="services-head">
          <Reveal>
            <h2 className="services-h">
              Empecemos con un<br />
              <span className="b">brief claro<span style={{ color: "var(--upz-tomato)" }}>.</span></span>
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "var(--fg-2)", maxWidth: 460, margin: 0 }}>
              Completa el brief que aplique a ti. Lo recibimos al instante y te
              respondemos en menos de 48h hábiles con próximos pasos.
            </p>
          </Reveal>
        </div>

        <div className="brief-tabs" role="tablist" aria-label="Tipo de brief">
          {BRIEFS.map((b, i) => (
            <button
              key={b.key}
              type="button"
              role="tab"
              aria-selected={active === i}
              className={`brief-tab${active === i ? " is-active" : ""}`}
              onClick={() => switchTo(i)}
            >
              {b.tab}
            </button>
          ))}
        </div>

        {sent ? (
          <div className="brief-confirm">
            <span className="check">↗</span>
            <div>
              <strong>Brief enviado · {values["nombre"] || "¡Gracias!"}</strong>
              <p>
                Abrimos tu correo con el brief listo para <strong>contacto@upzites.com</strong>.
                Si no se abrió, escríbenos directamente y te ayudamos.
              </p>
              <button type="button" className="btn btn-ivory btn-sm" onClick={() => setSent(false)}>
                Volver al brief
              </button>
            </div>
          </div>
        ) : (
          <form className="brief-form" onSubmit={submit}>
            <p className="brief-form-title">{brief.blurb}</p>
            <div className="brief-grid">
              {[...SHARED, ...brief.fields].map((f) => (
                <div key={f.id} className={`brief-field${f.type === "textarea" ? " brief-field-full" : ""}`}>
                  <label htmlFor={`brief-${f.id}`}>
                    {f.label}{f.required ? " *" : ""}
                  </label>
                  {f.type === "textarea" ? (
                    <textarea
                      id={`brief-${f.id}`}
                      rows={2}
                      value={values[f.id] || ""}
                      onChange={(e) => set(f.id, e.target.value)}
                      placeholder={f.placeholder}
                      required={f.required}
                    />
                  ) : (
                    <input
                      id={`brief-${f.id}`}
                      type={f.type || "text"}
                      value={values[f.id] || ""}
                      onChange={(e) => set(f.id, e.target.value)}
                      placeholder={f.placeholder}
                      required={f.required}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="brief-submit">
              <button type="submit" className="btn btn-dark btn-lg">
                Enviar {brief.title.toLowerCase()} <span className="arr">↗</span>
              </button>
              <small>Se envía a contacto@upzites.com · Respondemos en 48h hábiles.</small>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
