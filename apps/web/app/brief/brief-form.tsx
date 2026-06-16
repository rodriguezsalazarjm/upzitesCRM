"use client";

import { useState } from "react";

type BriefKind = "marca" | "marca-personal";

type BriefField = {
  key: string;
  label: string;
  type?: "text" | "email" | "tel" | "textarea" | "select";
  options?: string[];
  required?: boolean;
};

const COMMON_FIELDS: BriefField[] = [
  { key: "name", label: "Nombre", required: true },
  { key: "email", label: "Email", type: "email", required: true },
  { key: "whatsapp", label: "WhatsApp", type: "tel" },
  { key: "instagram", label: "Instagram / red principal" },
  {
    key: "budget",
    label: "Presupuesto aproximado",
    type: "select",
    options: ["Menos de $500.000 CLP", "$500.000 - $1.500.000 CLP", "$1.500.000 - $3.000.000 CLP", "Más de $3.000.000 CLP", "Prefiero definirlo con ustedes"],
  },
  {
    key: "urgency",
    label: "Urgencia",
    type: "select",
    options: ["Esta semana", "Este mes", "1 a 3 meses", "Estoy planificando"],
  },
];

const BRAND_FIELDS: BriefField[] = [
  { key: "company", label: "Nombre de la marca / proyecto", required: true },
  { key: "industry", label: "Rubro o nicho", required: true },
  { key: "audience", label: "A quién quieres venderle", type: "textarea", required: true },
  { key: "offer", label: "Qué vendes o qué quieres lanzar", type: "textarea", required: true },
  { key: "problem", label: "Qué problema quieres resolver con la marca", type: "textarea" },
  { key: "style", label: "Cómo quieres que se perciba", type: "textarea" },
  { key: "references", label: "Referencias, competidores o marcas que te gustan", type: "textarea" },
];

const PERSONAL_FIELDS: BriefField[] = [
  { key: "company", label: "Nombre público / marca personal", required: true },
  { key: "industry", label: "Área profesional o nicho", required: true },
  { key: "positioning", label: "Cómo quieres posicionarte", type: "textarea", required: true },
  { key: "audience", label: "A que audiencia quieres atraer", type: "textarea", required: true },
  { key: "content", label: "Qué tipo de contenido haces o quieres hacer", type: "textarea" },
  { key: "goals", label: "Objetivos principales", type: "textarea" },
  { key: "references", label: "Referentes o estilos que te representan", type: "textarea" },
];

function initialState(fields: BriefField[]) {
  return Object.fromEntries(fields.map((field) => [field.key, field.options?.[0] ?? ""]));
}

function buildMessage(kind: BriefKind, values: Record<string, string>) {
  const title = kind === "marca" ? "Brief de marca" : "Brief de marca personal";
  return [
    title,
    "",
    ...Object.entries(values)
      .filter(([, value]) => value.trim())
      .map(([key, value]) => `${key}: ${value}`),
  ].join("\n");
}

export function BriefForm({ kind }: { kind: BriefKind }) {
  const fields = [...COMMON_FIELDS, ...(kind === "marca" ? BRAND_FIELDS : PERSONAL_FIELDS)];
  const [values, setValues] = useState<Record<string, string>>(() => initialState(fields));
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  function update(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");

    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        kind: "brief",
        briefType: kind === "marca" ? "Brief de marca" : "Brief de marca personal",
        service: kind === "marca" ? "Branding y Dirección Visual" : "Branding personal",
        message: buildMessage(kind, values),
        consent,
        pageUrl: window.location.href,
        referrer: document.referrer,
      }),
    });
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      setStatus("error");
      setMessage(result?.message ?? "No pudimos enviar el brief. Inténtalo nuevamente.");
      return;
    }

    setStatus("sent");
    setMessage("Brief recibido con éxito. Te responderemos con próximos pasos.");
    setValues(initialState(fields));
    setConsent(false);
  }

  return (
    <form className="bigcta-form brief-page-form" onSubmit={submit}>
      {fields.map((field) => (
        <div className={`field${field.type === "textarea" ? " field-full" : ""}`} key={field.key}>
          <label htmlFor={`brief-${field.key}`}>{field.label}</label>
          {field.type === "textarea" ? (
            <textarea
              id={`brief-${field.key}`}
              value={values[field.key] ?? ""}
              onChange={(event) => update(field.key, event.target.value)}
              rows={4}
              required={field.required}
            />
          ) : field.type === "select" ? (
            <select
              id={`brief-${field.key}`}
              value={values[field.key] ?? ""}
              onChange={(event) => update(field.key, event.target.value)}
              required={field.required}
            >
              {field.options?.map((option) => <option key={option}>{option}</option>)}
            </select>
          ) : (
            <input
              id={`brief-${field.key}`}
              type={field.type ?? "text"}
              value={values[field.key] ?? ""}
              onChange={(event) => update(field.key, event.target.value)}
              required={field.required}
            />
          )}
        </div>
      ))}
      <label className="contact-page-consent field-full">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required />
        <span>Acepto que UPZITES use estos datos para responder mi solicitud.</span>
      </label>
      <div className="bigcta-form-submit field-full">
        <button type="submit" className="btn btn-lime btn-lg" disabled={status === "sending"}>
          {status === "sending" ? "Enviando..." : "Enviar brief"} <span className="arr">&rarr;</span>
        </button>
        {message && <small role="status">{message}</small>}
      </div>
    </form>
  );
}


