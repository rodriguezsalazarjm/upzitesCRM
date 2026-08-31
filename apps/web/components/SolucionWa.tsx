"use client";

import { trackContact, trackLead } from "@/lib/meta-pixel";

const WA_NUMBER = "56978167863";

declare global {
  interface Window {
    gtag?: (command: string, eventName: string, params?: Record<string, unknown>) => void;
  }
}

type SolucionWaProps = {
  message: string;
  children: React.ReactNode;
  className?: string;
  /** Etiqueta legacy y granular del CTA (ej. "lx_hero"). Se mantiene por compatibilidad. */
  location?: string;
  /** `content_name`: identifica la landing completa (ej. "landing-express"). */
  contentName?: string;
  /** `content_category`: que producto pide el usuario (ej. "starter" | "generico"). */
  contentCategory?: string;
  /** `source_section`: bloque de la pagina desde donde salio el click. */
  sourceSection?: string;
};

/**
 * CTA a WhatsApp con tracking de conversion, compartido por las landings de
 * Soluciones. Centraliza el numero, el mensaje prellenado y el disparo de
 * eventos, para que ningun CTA quede sin medir ni se dupliquen onClicks.
 *
 * Dispara en cada click:
 *  - Meta Pixel `Contact` y `Lead`, con los parametros de origen.
 *  - GA4 `generate_lead`, solo si hay un `gtag` cargado en la pagina. Hoy el
 *    sitio no tiene GA4; esto empieza a medir solo si algun dia se instala.
 */
export function SolucionWa({
  message,
  children,
  className,
  location = "solucion",
  contentName,
  contentCategory,
  sourceSection,
}: SolucionWaProps) {
  const href = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(message)}`;

  const track = () => {
    // Solo incluimos las claves definidas: Meta descarta el evento entero si
    // recibe parametros con valor undefined.
    const origin = {
      ...(contentName ? { content_name: contentName } : {}),
      ...(contentCategory ? { content_category: contentCategory } : {}),
      ...(sourceSection ? { source_section: sourceSection } : {}),
      location,
    };

    trackContact({ contact_method: "whatsapp", ...origin });
    trackLead({ currency: "CLP", ...origin });

    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", "generate_lead", { method: "whatsapp", currency: "CLP", ...origin });
    }
  };

  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={track}
    >
      {children}
    </a>
  );
}
