"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CONTACT_BUDGETS as BUDGETS, CONTACT_SERVICES as SERVICES, CONTACT_URGENCIES as URGENCIES } from "@/lib/contact-options";
import { HoneypotField, TurnstileField, useFormProtection, type TurnstileHandle } from "@/components/FormProtection";
import { waLink } from "@/lib/whatsapp";

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
  const turnstileRef = useRef<TurnstileHandle>(null);
  const protection = useFormProtection(turnstileRef);
  const whatsappUrl = useMemo(
    () => waLink(`Hola UPZITES, quiero conversar sobre ${state.service}.`),
    [state.service],
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missingToken = protection.missingTokenMessage();
    if (missingToken) {
      setStatus("error");
      setMessage(missingToken);
      return;
    }
    setStatus("sending");
    setMessage("");

    const payload = {
      ...state,
      ...getUtmParams(),
      ...protection.fields(),
      pageUrl: window.location.href,
      referrer: document.referrer,
    };

    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    const result = await response?.json().catch(() => null);
    protection.afterSubmit();

    if (!response?.ok) {
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
          <Link href="/api/brochure/download?source=contact_page" className="btn btn-ivory btn-lg">
            Descargar brochure <span className="arr">&#8599;</span>
          </Link>
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn btn-dark btn-lg">
            Escribir por WhatsApp <span className="arr">&#8599;</span>
          </a>
        </div>
      </aside>

      <form className="bigcta-form contact-page-form" onSubmit={submit}>
        <HoneypotField value={protection.honeypot} onChange={protection.setHoneypot} />
        <div className="field">
          <label htmlFor="contact-name">Nombre</label>
          <input id="contact-name" maxLength={120} value={state.name} onChange={(e) => update("name", e.target.value)} placeholder="Tu nombre" required />
        </div>
        <div className="field">
          <label htmlFor="contact-email">Email</label>
          <input id="contact-email" maxLength={254} type="email" value={state.email} onChange={(e) => update("email", e.target.value)} placeholder="tu@empresa.com" required />
        </div>
        <div className="field">
          <label htmlFor="contact-phone">Telefono</label>
          <input id="contact-phone" maxLength={40} value={state.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+56 9..." />
        </div>
        <div className="field">
          <label htmlFor="contact-whatsapp">WhatsApp</label>
          <input id="contact-whatsapp" maxLength={40} value={state.whatsapp} onChange={(e) => update("whatsapp", e.target.value)} placeholder="+56 9..." />
        </div>
        <div className="field">
          <label htmlFor="contact-company">Empresa / proyecto</label>
          <input id="contact-company" maxLength={160} value={state.company} onChange={(e) => update("company", e.target.value)} placeholder="Nombre de la marca" />
        </div>
        <div className="field">
          <label htmlFor="contact-industry">Rubro / nicho</label>
          <input id="contact-industry" maxLength={160} value={state.industry} onChange={(e) => update("industry", e.target.value)} placeholder="Ej: salud, restaurante, inmobiliaria" />
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
            maxLength={10000}
            placeholder="Contexto, objetivos, fecha ideal, referencias, problemas actuales..."
            required
          />
        </div>
        <div className="bigcta-form-submit field-full">
          <button type="submit" className="btn btn-lime btn-lg" disabled={status === "sending"}>
            {status === "sending" ? "Enviando..." : "Enviar solicitud"} <span className="arr">&#8599;</span>
          </button>
          {message && <small role="status">{message}</small>}
          <TurnstileField ref={turnstileRef} />
        </div>
      </form>
    </div>
  );
}
