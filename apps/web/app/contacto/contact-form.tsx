"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

const SERVICES = [
  "Branding y Dirección Visual",
  "Diseño y Desarrollo Web",
  "E-commerce",
  "Marketing Digital y Contenido",
  "Ads y Performance",
  "Apps Móviles",
  "Automatización e Inteligencia Artificial",
  "Soluciones Express",
  "No estoy seguro, quiero orientación",
];

const BUDGETS = [
  "Menos de $500.000 CLP",
  "$500.000 - $1.500.000 CLP",
  "$1.500.000 - $3.000.000 CLP",
  "$3.000.000 - $6.000.000 CLP",
  "Más de $6.000.000 CLP",
  "Prefiero definirlo con ustedes",
];

const URGENCIES = [
  "Esta semana",
  "Este mes",
  "1 a 3 meses",
  "Estoy planificando",
];

type FormState = {
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  company: string;
  industry: string;
  service: string;
  budget: string;
  urgency: string;
  message: string;
  consent: boolean;
};

const initialState: FormState = {
  name: "",
  email: "",
  phone: "",
  whatsapp: "",
  company: "",
  industry: "",
  service: SERVICES[0],
  budget: BUDGETS[1],
  urgency: URGENCIES[1],
  message: "",
  consent: false,
};

function getUtmParams() {
  if (typeof window === "undefined") {
    return { utmSource: "", utmMedium: "", utmCampaign: "" };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    utmSource: params.get("utm_source") ?? "",
    utmMedium: params.get("utm_medium") ?? "",
    utmCampaign: params.get("utm_campaign") ?? "",
  };
}

export function ContactForm() {
  const [state, setState] = useState<FormState>(initialState);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const whatsappUrl = useMemo(() => {
    const text = encodeURIComponent(`Hola UPZITES, quiero conversar sobre ${state.service}.`);
    return `https://wa.me/56973178796text=${text}`;
  }, [state.service]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");

    const payload = {
      ...state,
      ...getUtmParams(),
      pageUrl: window.location.href,
      referrer: document.referrer,
    };

    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      setStatus("error");
      setMessage(result?.message ?? "No pudimos enviar el formulario. Inténtalo nuevamente.");
      return;
    }

    setStatus("sent");
    setMessage("Tu solicitud ha sido recibida con éxito. Te contactaremos a la brevedad.");
    setState(initialState);
  }

  return (
    <div className="contact-page-grid">
      <aside className="contact-page-panel">
        <span className="contact-page-kicker">Respuesta comercial</span>
        <h2>Conversemos con contexto.</h2>
        <p>
          Cuéntanos qué necesitas construir, vender o automatizar. Te responderemos
          con foco, próximos pasos claros y una recomendación inicial.
        </p>
        <div className="contact-page-actions">
          <Link href="/api/brochure/downloadsource=contact_page" className="btn btn-ivory btn-lg">
            Descargar brochure <span className="arr">&#8599;</span>
          </Link>
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn btn-dark btn-lg">
            Escribir por WhatsApp <span className="arr">&#8599;</span>
          </a>
        </div>
      </aside>

      <form className="bigcta-form contact-page-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="contact-name">Nombre</label>
          <input id="contact-name" value={state.name} onChange={(e) => update("name", e.target.value)} placeholder="Tu nombre" required />
        </div>
        <div className="field">
          <label htmlFor="contact-email">Email</label>
          <input id="contact-email" type="email" value={state.email} onChange={(e) => update("email", e.target.value)} placeholder="tu@empresa.com" required />
        </div>
        <div className="field">
          <label htmlFor="contact-phone">Telefono</label>
          <input id="contact-phone" value={state.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+56 9..." />
        </div>
        <div className="field">
          <label htmlFor="contact-whatsapp">WhatsApp</label>
          <input id="contact-whatsapp" value={state.whatsapp} onChange={(e) => update("whatsapp", e.target.value)} placeholder="+56 9..." />
        </div>
        <div className="field">
          <label htmlFor="contact-company">Empresa / proyecto</label>
          <input id="contact-company" value={state.company} onChange={(e) => update("company", e.target.value)} placeholder="Nombre de la marca" />
        </div>
        <div className="field">
          <label htmlFor="contact-industry">Rubro / nicho</label>
          <input id="contact-industry" value={state.industry} onChange={(e) => update("industry", e.target.value)} placeholder="Ej: salud, restaurante, inmobiliaria" />
        </div>
        <div className="field">
          <label htmlFor="contact-service">Servicio de interés</label>
          <select id="contact-service" value={state.service} onChange={(e) => update("service", e.target.value)}>
            {SERVICES.map((service) => <option key={service}>{service}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="contact-budget">Presupuesto aproximado</label>
          <select id="contact-budget" value={state.budget} onChange={(e) => update("budget", e.target.value)}>
            {BUDGETS.map((budget) => <option key={budget}>{budget}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="contact-urgency">Urgencia</label>
          <select id="contact-urgency" value={state.urgency} onChange={(e) => update("urgency", e.target.value)}>
            {URGENCIES.map((urgency) => <option key={urgency}>{urgency}</option>)}
          </select>
        </div>
        <label className="contact-page-consent">
          <input
            type="checkbox"
            checked={state.consent}
            onChange={(e) => update("consent", e.target.checked)}
            required
          />
          <span>Acepto que UPZITES use estos datos para responder mi solicitud comercial.</span>
        </label>
        <div className="field field-full">
          <label htmlFor="contact-message">Cuéntanos del proyecto</label>
          <textarea
            id="contact-message"
            value={state.message}
            onChange={(e) => update("message", e.target.value)}
            rows={5}
            placeholder="Contexto, objetivos, fecha ideal, referencias, problemas actuales..."
            required
          />
        </div>
        <div className="bigcta-form-submit field-full">
          <button type="submit" className="btn btn-lime btn-lg" disabled={status === "sending"}>
            {status === "sending" ? "Enviando..." : "Enviar solicitud"} <span className="arr">&#8599;</span>
          </button>
          {message && <small role="status">{message}</small>}
        </div>
      </form>
    </div>
  );
}
